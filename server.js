import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const HYPERBEAM_API_KEY = process.env.HYPERBEAM_API_KEY || "";
const PORT = process.env.PORT || 3000;

// In-memory store for active watch rooms
// Format: { [roomId]: { sessionId, embedUrl, adminToken, hostId, createdAt, participants: Map } }
const rooms = new Map();

// Helper to call Hyperbeam API to provision a fresh virtual browser session
async function createHyperbeamSession(startUrl = "https://www.google.com") {
  if (!HYPERBEAM_API_KEY || HYPERBEAM_API_KEY === "YOUR_HYPERBEAM_API_KEY_HERE") {
    throw new Error(
      "Missing Hyperbeam API Key! Please get a free API key from https://hyperbeam.com/developer and set it in your .env file."
    );
  }

  async function requestVm() {
    return await fetch("https://engine.hyperbeam.com/v0/vm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HYPERBEAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_url: startUrl,
        ublock: true, // Auto-enables uBlock Origin to kill movie site popups/ads!
        kiosk: false, // Allows full browser UI (URL bar, navigation, tabs)
        timeout: {
          offline: 180, // Terminate after 3 minutes if no users are connected
        },
      }),
    });
  }

  let response = await requestVm();

  // If hitting concurrency limit (too many VMs on test tier), clean up stale sessions and retry
  if (!response.ok && (response.status === 400 || response.status === 429)) {
    console.warn("VM creation hit limit, cleaning up stale sessions...");
    try {
      const listRes = await fetch("https://engine.hyperbeam.com/v0/vm", {
        headers: { Authorization: `Bearer ${HYPERBEAM_API_KEY}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const activeVms = listData.results || [];
        for (const vm of activeVms) {
          await deleteHyperbeamSession(vm.id);
        }
        // Small delay and retry
        await new Promise((r) => setTimeout(r, 1000));
        response = await requestVm();
      }
    } catch (cleanupErr) {
      console.warn("Cleanup error:", cleanupErr.message);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hyperbeam API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

async function deleteHyperbeamSession(sessionId) {
  if (!sessionId || !HYPERBEAM_API_KEY) return;
  try {
    const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${HYPERBEAM_API_KEY}` },
    });
    if (res.ok) {
      console.log(`Cleaned up stale VM session: ${sessionId}`);
    }
  } catch (err) {
    console.warn("Could not delete session:", err.message);
  }
}

// Generate friendly room code (e.g. "cine-a8f3b2")
function generateRoomCode() {
  return "cine-" + crypto.randomBytes(3).toString("hex");
}

// REST: Create a new watch room
app.post("/api/rooms", async (req, res) => {
  try {
    const { startUrl, closeRoomId } = req.body;

    // If requested to close an old room first, delete its VM immediately
    if (closeRoomId && rooms.has(closeRoomId)) {
      const oldRoom = rooms.get(closeRoomId);
      if (oldRoom.cleanupTimer) clearTimeout(oldRoom.cleanupTimer);
      rooms.delete(closeRoomId);
      await deleteHyperbeamSession(oldRoom.sessionId);
      console.log(`Explicitly closed old room ${closeRoomId} before creating new one.`);
    }

    const session = await createHyperbeamSession(startUrl || "https://www.google.com");
    const roomId = generateRoomCode();

    const roomData = {
      roomId,
      sessionId: session.session_id,
      embedUrl: session.embed_url,
      adminToken: session.admin_token,
      createdAt: new Date(),
      controlMode: "anyone", // "anyone" or "host-only"
      activeController: null,
      participants: new Map(),
      cleanupTimer: null, // Grace period timer
    };

    rooms.set(roomId, roomData);

    res.json({
      success: true,
      roomId,
      embedUrl: session.embed_url,
      adminToken: session.admin_token,
    });
  } catch (error) {
    console.error("Failed to create room:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// REST: Get room info by ID
app.get("/api/rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found or expired." });
  }

  res.json({
    success: true,
    roomId: room.roomId,
    embedUrl: room.embedUrl,
    controlMode: room.controlMode,
  });
});

// Health check / API status
app.get("/api/status", (req, res) => {
  res.json({
    hasApiKey: Boolean(HYPERBEAM_API_KEY && HYPERBEAM_API_KEY !== "YOUR_HYPERBEAM_API_KEY_HERE"),
    activeRooms: rooms.size,
  });
});

// Socket.io for Real-time Group Chat & Presence
io.on("connection", (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  socket.on("join-room", ({ roomId, username, isHost }) => {
    currentRoomId = roomId;
    currentUser = {
      id: socket.id,
      username: username || "Guest " + socket.id.slice(0, 4),
      isHost: Boolean(isHost),
    };

    socket.join(roomId);

    let room = rooms.get(roomId);
    if (room) {
      // If there was a grace period timer waiting to delete the VM, cancel it!
      if (room.cleanupTimer) {
        console.log(`User reconnected to room ${roomId}. Cancelling VM termination timer.`);
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }

      room.participants.set(socket.id, currentUser);

      // Send participant list to everyone in room
      const userList = Array.from(room.participants.values());
      io.to(roomId).emit("room-users", userList);

      // System notification
      io.to(roomId).emit("chat-message", {
        system: true,
        text: `${currentUser.username} joined the party! 🍿`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }
  });

  // Chat message
  socket.on("send-message", ({ roomId, text }) => {
    if (!text || !text.trim() || !currentUser) return;

    io.to(roomId).emit("chat-message", {
      system: false,
      sender: currentUser.username,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  });

  // Control sharing mode toggle
  socket.on("set-control-mode", ({ roomId, mode }) => {
    const room = rooms.get(roomId);
    if (room && currentUser && currentUser.isHost) {
      room.controlMode = mode;
      io.to(roomId).emit("control-mode-updated", { mode });
      io.to(roomId).emit("chat-message", {
        system: true,
        text: `Host set controls to: ${mode === "anyone" ? "Everyone can browse" : "Host only"}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }
  });

  socket.on("disconnect", async () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      room.participants.delete(socket.id);

      const userList = Array.from(room.participants.values());
      io.to(currentRoomId).emit("room-users", userList);

      if (currentUser) {
        io.to(currentRoomId).emit("chat-message", {
          system: true,
          text: `${currentUser.username} left the party.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      }

      // If room is empty, wait 2 minutes before terminating the VM (grace period for app switching / reloads)
      if (room.participants.size === 0) {
        console.log(`Room ${currentRoomId} is empty. Starting 2-minute grace period before terminating VM...`);
        if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
        
        room.cleanupTimer = setTimeout(async () => {
          if (rooms.has(currentRoomId)) {
            const r = rooms.get(currentRoomId);
            if (r.participants.size === 0) {
              console.log(`Grace period expired for room ${currentRoomId}. Terminating VM to free capacity...`);
              rooms.delete(currentRoomId);
              await deleteHyperbeamSession(r.sessionId);
            }
          }
        }, 120000); // 2 minutes
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 CineParty (Hyperbeam Watch Party) is running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  const isKeyConfigured = Boolean(HYPERBEAM_API_KEY && HYPERBEAM_API_KEY !== "YOUR_HYPERBEAM_API_KEY_HERE");
  console.log(`🔑 Hyperbeam Key: ${isKeyConfigured ? "CONFIGURED" : "NEEDS KEY (Set in .env)"}`);
  console.log(`======================================================\n`);
});
