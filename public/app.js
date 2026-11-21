import Hyperbeam from "https://esm.sh/@hyperbeam/web";

// State
let socket = null;
let hbInstance = null;
let currentRoom = null;
let currentUser = {
  username: "",
  isHost: false,
};

// DOM Elements
const apiKeyBanner = document.getElementById("apiKeyBanner");
const lobbyView = document.getElementById("lobbyView");
const roomView = document.getElementById("roomView");
const usernameInput = document.getElementById("usernameInput");
const randomizeNameBtn = document.getElementById("randomizeNameBtn");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

const startUrlInput = document.getElementById("startUrlInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");

const currentRoomCodeEl = document.getElementById("currentRoomCode");
const copyInviteBtn = document.getElementById("copyInviteBtn");
const roomBadge = document.getElementById("roomBadge");
const controlModeGroup = document.getElementById("controlModeGroup");
const controlToggleBtn = document.getElementById("controlToggleBtn");
const controlModeText = document.getElementById("controlModeText");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const toggleChatBtn = document.getElementById("toggleChatBtn");
const unreadBadge = document.getElementById("unreadBadge");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const hbContainer = document.getElementById("hyperbeamContainer");
const browserLoader = document.getElementById("browserLoader");
const chatSidebar = document.getElementById("chatSidebar");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const sideTabs = document.querySelectorAll(".side-tab");
const sidePanes = document.querySelectorAll(".sidebar-pane");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const reactionBtns = document.querySelectorAll(".reaction-btn");
const usersList = document.getElementById("usersList");
const userCountEl = document.getElementById("userCount");
const toastContainer = document.getElementById("toastContainer");

// Active Room Modal Elements
const activeRoomModal = document.getElementById("activeRoomModal");
const modalRoomCode = document.getElementById("modalRoomCode");
const rejoinActiveRoomBtn = document.getElementById("rejoinActiveRoomBtn");
const closeOldAndCreateBtn = document.getElementById("closeOldAndCreateBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");

// Random name generator
const adjectives = ["Cosmic", "Neon", "Cyber", "Midnight", "Golden", "Retro", "Pixel", "Silent", "Popcorn", "Velvet"];
const nouns = ["Viewer", "Watcher", "Cinephile", "Streamer", "Critic", "Fan", "Nomad", "Captain", "Buddy", "Pirate"];

function getRandomName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${adj}${noun}-${num}`;
}

// Show toast notification
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Check Backend & API Key status on load
async function checkApiStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (!data.hasApiKey) {
      apiKeyBanner.classList.remove("hidden");
    }
  } catch (err) {
    console.warn("Could not reach backend API status:", err);
  }
}

// Saved Room helpers (LocalStorage)
function getSavedRoom() {
  try {
    const raw = localStorage.getItem("cineparty_saved_room");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveRoom(room) {
  try {
    localStorage.setItem("cineparty_saved_room", JSON.stringify(room));
  } catch {}
}

function clearSavedRoom() {
  try {
    localStorage.removeItem("cineparty_saved_room");
  } catch {}
}

// Check if user has an active room running on server
async function checkSavedRoom() {
  const saved = getSavedRoom();
  if (!saved || !saved.roomId) return;

  // Don't show modal if user is visiting a specific room link via hash
  if (window.location.hash) {
    const hashRoom = window.location.hash.replace("#", "").trim();
    if (hashRoom && hashRoom !== saved.roomId) return;
  }

  try {
    const res = await fetch(`/api/rooms/${saved.roomId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        modalRoomCode.textContent = saved.roomId;
        activeRoomModal.classList.remove("hidden");
      } else {
        clearSavedRoom();
      }
    } else {
      clearSavedRoom();
    }
  } catch {
    // Backend unreachable or offline
  }
}

// Initial Setup
usernameInput.value = getRandomName();
randomizeNameBtn.addEventListener("click", () => {
  usernameInput.value = getRandomName();
});

// Check if URL has a room hash (e.g. #cine-a1b2c3)
if (window.location.hash) {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash) {
    roomCodeInput.value = hash;
    // Switch to Join tab
    switchTab("joinTab");
  }
}

checkApiStatus();
checkSavedRoom();

// Tabs switching (Create vs Join)
function switchTab(targetId) {
  tabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === targetId);
  });
  tabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === targetId);
  });
}

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Sidebar Tabs (Chat vs Users)
sideTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    sideTabs.forEach((t) => t.classList.remove("active"));
    sidePanes.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.sidetab).classList.add("active");
  });
});

// Toggle Chat Sidebar & Mobile Drawer
function openSidebar() {
  chatSidebar.classList.remove("collapsed");
  toggleChatBtn.classList.add("active");
  unreadBadge.classList.add("hidden");
  if (window.innerWidth <= 768 && sidebarBackdrop) {
    sidebarBackdrop.classList.remove("hidden");
  }
}

function closeSidebar() {
  chatSidebar.classList.add("collapsed");
  toggleChatBtn.classList.remove("active");
  if (sidebarBackdrop) {
    sidebarBackdrop.classList.add("hidden");
  }
}

toggleChatBtn.addEventListener("click", () => {
  if (chatSidebar.classList.contains("collapsed")) {
    openSidebar();
  } else {
    closeSidebar();
  }
});

if (closeSidebarBtn) {
  closeSidebarBtn.addEventListener("click", closeSidebar);
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", closeSidebar);
}

// Copy Room Link
function copyRoomLink() {
  if (!currentRoom) return;
  const url = `${window.location.origin}/#${currentRoom.roomId}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast("📋 Party link copied to clipboard!");
  }).catch(() => {
    prompt("Copy this party link:", url);
  });
}

copyInviteBtn.addEventListener("click", copyRoomLink);
roomBadge.addEventListener("click", copyRoomLink);

// Fullscreen Toggle
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    hbContainer.requestFullscreen().catch((err) => {
      console.error("Fullscreen error:", err);
    });
  } else {
    document.exitFullscreen();
  }
});

// CREATE ROOM ACTION (Checks for active room first)
createRoomBtn.addEventListener("click", async () => {
  const saved = getSavedRoom();
  if (saved && saved.roomId) {
    try {
      const res = await fetch(`/api/rooms/${saved.roomId}`);
      if (res.ok) {
        modalRoomCode.textContent = saved.roomId;
        activeRoomModal.classList.remove("hidden");
        return;
      }
    } catch {}
    clearSavedRoom();
  }

  executeCreateRoom(null);
});

// Modal Actions: Rejoin or Close Old & Start Fresh
rejoinActiveRoomBtn.addEventListener("click", () => {
  activeRoomModal.classList.add("hidden");
  const saved = getSavedRoom();
  if (saved) {
    currentUser.username = usernameInput.value.trim() || saved.username || getRandomName();
    currentUser.isHost = saved.isHost;
    enterRoom(saved.roomId, saved.embedUrl, saved.adminToken, saved.isHost);
  }
});

closeOldAndCreateBtn.addEventListener("click", () => {
  activeRoomModal.classList.add("hidden");
  const saved = getSavedRoom();
  const oldRoomId = saved ? saved.roomId : null;
  clearSavedRoom();
  executeCreateRoom(oldRoomId);
});

cancelModalBtn.addEventListener("click", () => {
  activeRoomModal.classList.add("hidden");
  clearSavedRoom();
});

async function executeCreateRoom(closeRoomId = null) {
  const username = usernameInput.value.trim() || getRandomName();
  currentUser.username = username;
  currentUser.isHost = true;

  const startUrl = startUrlInput.value.trim() || "https://www.google.com";

  // Loading state
  const btnText = createRoomBtn.querySelector(".btn-text");
  const spinner = createRoomBtn.querySelector(".btn-spinner");
  createRoomBtn.disabled = true;
  btnText.textContent = "Spinning up browser...";
  spinner.classList.remove("hidden");

  try {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrl, closeRoomId }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to create room.");
    }

    await enterRoom(data.roomId, data.embedUrl, data.adminToken, true);
  } catch (err) {
    alert("Error creating watch party: " + err.message);
  } finally {
    createRoomBtn.disabled = false;
    btnText.textContent = "🚀 Launch Party Room";
    spinner.classList.add("hidden");
  }
}

// JOIN ROOM ACTION
joinRoomBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim() || getRandomName();
  currentUser.username = username;
  currentUser.isHost = false;

  let inputCode = roomCodeInput.value.trim();
  if (!inputCode) {
    alert("Please enter a room code or link.");
    return;
  }

  // If user pasted a full URL, extract the code
  if (inputCode.includes("#")) {
    inputCode = inputCode.split("#")[1];
  } else if (inputCode.includes("/")) {
    inputCode = inputCode.split("/").pop();
  }

  const btnText = joinRoomBtn.querySelector(".btn-text");
  const spinner = joinRoomBtn.querySelector(".btn-spinner");
  joinRoomBtn.disabled = true;
  btnText.textContent = "Connecting...";
  spinner.classList.remove("hidden");

  try {
    const res = await fetch(`/api/rooms/${inputCode}`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Room not found.");
    }

    await enterRoom(data.roomId, data.embedUrl, null, false);
  } catch (err) {
    alert("Error joining room: " + err.message);
  } finally {
    joinRoomBtn.disabled = false;
    btnText.textContent = "🍿 Join Party";
    spinner.classList.add("hidden");
  }
});

// ENTER WATCH ROOM
async function enterRoom(roomId, embedUrl, adminToken, isHost) {
  currentRoom = { roomId, embedUrl, adminToken, isHost };

  // Save room state locally so if tab closes or user switches apps, they can resume
  saveRoom({
    roomId,
    embedUrl,
    adminToken,
    isHost,
    username: currentUser.username,
  });

  // Update URL hash
  window.location.hash = roomId;
  currentRoomCodeEl.textContent = roomId;

  // Toggle screens
  lobbyView.classList.add("hidden");
  roomView.classList.remove("hidden");
  browserLoader.classList.remove("hidden");

  // On mobile start with sidebar collapsed for full-screen video, on desktop start open
  if (window.innerWidth <= 768) {
    closeSidebar();
  } else {
    openSidebar();
  }

  // Show or hide host controls
  if (isHost) {
    controlModeGroup.classList.remove("hidden");
  } else {
    controlModeGroup.classList.add("hidden");
  }

  // Connect Socket.io
  initSocket(roomId, currentUser.username, isHost);

  // Initialize Hyperbeam Virtual Browser inside #hyperbeamContainer
  try {
    // Clear previous instance if any
    if (hbInstance) {
      hbInstance.destroy();
      hbInstance = null;
    }

    // Keep loader element while Hyperbeam mounts inside container
    const hbWrapper = document.createElement("div");
    hbWrapper.style.width = "100%";
    hbWrapper.style.height = "100%";
    hbContainer.appendChild(hbWrapper);

    hbInstance = await Hyperbeam(hbWrapper, embedUrl, {
      adminToken: adminToken || undefined,
      volume: 1.0,
      delegate: true, // Allows mouse/keyboard input
    });

    // Hide loader once connected
    setTimeout(() => {
      browserLoader.classList.add("hidden");
    }, 1000);

    showToast("🎉 Connected to virtual browser!");
  } catch (err) {
    console.error("Hyperbeam load error:", err);
    browserLoader.innerHTML = `
      <div style="color: #ef4444; font-size: 2rem;">⚠️</div>
      <h3 style="color: #ef4444;">Failed to Load Virtual Browser</h3>
      <p style="max-width: 400px; margin: 0 auto; color: #9aa0b4;">${err.message}</p>
      <button onclick="location.reload()" class="secondary-btn" style="margin-top: 14px;">Reload</button>
    `;
  }
}

// SOCKET.IO REALTIME CHAT & USERS
function initSocket(roomId, username, isHost) {
  socket = io();

  socket.emit("join-room", { roomId, username, isHost });

  // Update room users
  socket.on("room-users", (users) => {
    userCountEl.textContent = users.length;
    usersList.innerHTML = "";
    users.forEach((u) => {
      const item = document.createElement("div");
      item.className = "user-item";
      const initials = (u.username || "U").slice(0, 2).toUpperCase();
      item.innerHTML = `
        <div class="user-left">
          <div class="user-avatar">${initials}</div>
          <span class="user-name">${u.username}</span>
        </div>
        ${u.isHost ? '<span class="user-badge">HOST</span>' : ""}
      `;
      usersList.appendChild(item);
    });
  });

  // Chat message received
  socket.on("chat-message", (msg) => {
    appendChatMessage(msg);
  });

  // Control mode updated
  socket.on("control-mode-updated", ({ mode }) => {
    controlModeText.textContent = mode === "anyone" ? "Anyone Can Browse" : "Host Only";
    showToast(`Controls set to: ${mode === "anyone" ? "Everyone" : "Host only"}`);
  });
}

// Append Chat Message
function appendChatMessage(msg) {
  if (msg.system) {
    const sysEl = document.createElement("div");
    sysEl.className = "system-msg";
    sysEl.textContent = msg.text;
    chatMessages.appendChild(sysEl);
  } else {
    const isSelf = msg.sender === currentUser.username;
    const msgEl = document.createElement("div");
    msgEl.className = "chat-msg";
    msgEl.innerHTML = `
      <div class="msg-header">
        <span class="msg-author ${isSelf ? "is-self" : ""}">${msg.sender}</span>
        <span class="msg-time">${msg.timestamp}</span>
      </div>
      <div class="msg-text">${escapeHtml(msg.text)}</div>
    `;
    chatMessages.appendChild(msgEl);
  }

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Unread indicator if sidebar closed
  if (chatSidebar.classList.contains("collapsed")) {
    unreadBadge.classList.remove("hidden");
  }
}

// Send chat message
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !socket || !currentRoom) return;

  socket.emit("send-message", {
    roomId: currentRoom.roomId,
    text,
  });

  chatInput.value = "";
});

// Quick reaction emojis
reactionBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!socket || !currentRoom) return;
    socket.emit("send-message", {
      roomId: currentRoom.roomId,
      text: btn.dataset.emoji,
    });
  });
});

// Host Control Toggle
let currentControlMode = "anyone";
controlToggleBtn.addEventListener("click", () => {
  if (!currentUser.isHost || !socket || !currentRoom) return;
  currentControlMode = currentControlMode === "anyone" ? "host-only" : "anyone";
  socket.emit("set-control-mode", {
    roomId: currentRoom.roomId,
    mode: currentControlMode,
  });
});

// Leave Room
leaveRoomBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to leave the watch party?")) {
    clearSavedRoom();
    if (hbInstance) {
      hbInstance.destroy();
      hbInstance = null;
    }
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    currentRoom = null;
    window.location.hash = "";
    roomView.classList.add("hidden");
    lobbyView.classList.remove("hidden");
  }
});

// Helper HTML escape
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
