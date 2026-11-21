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
const reloadStreamBtn = document.getElementById("reloadStreamBtn");
const toggleChatBtn = document.getElementById("toggleChatBtn");
const unreadBadge = document.getElementById("unreadBadge");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const hbContainer = document.getElementById("hyperbeamContainer");
const hbMount = document.getElementById("hbMount");
const clickToPlayOverlay = document.getElementById("clickToPlayOverlay");
const resumeStreamBtn = document.getElementById("resumeStreamBtn");
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
const modalTitle = document.getElementById("modalTitle");
const modalDesc = document.getElementById("modalDesc");
const modalRoomCode = document.getElementById("modalRoomCode");
const modalNormalActions = document.getElementById("modalNormalActions");
const closeRequestWaiting = document.getElementById("closeRequestWaiting");
const requestCountdown = document.getElementById("requestCountdown");
const cancelRequestBtn = document.getElementById("cancelRequestBtn");
const rejoinActiveRoomBtn = document.getElementById("rejoinActiveRoomBtn");
const closeOldAndCreateBtn = document.getElementById("closeOldAndCreateBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");

// Host Approval Modal Elements (Device A)
const hostApprovalModal = document.getElementById("hostApprovalModal");
const requesterNameSpan = document.getElementById("requesterNameSpan");
const hostCountdown = document.getElementById("hostCountdown");
const denyCloseBtn = document.getElementById("denyCloseBtn");
const allowCloseBtn = document.getElementById("allowCloseBtn");

let currentPromptRoomId = null;
let activeRequestTimer = null;
let activeHostTimer = null;
let incomingRequestId = null;
let lobbySocket = null;

// Name validation - user MUST enter their own name
function validateUsername() {
  const name = usernameInput.value.trim();
  if (!name) {
    usernameInput.focus();
    usernameInput.style.borderColor = "var(--accent)";
    usernameInput.style.boxShadow = "0 0 0 3px var(--accent-glow)";
    showToast("⚠️ Please enter your name to continue!");
    return null;
  }
  localStorage.setItem("cineparty_username", name);
  return name;
}

// Reset error border on typing
usernameInput.addEventListener("input", () => {
  usernameInput.style.borderColor = "";
  usernameInput.style.boxShadow = "";
});

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

// Check if an active room already exists (either from this device or another device)
async function checkActiveRoom() {
  const saved = getSavedRoom();

  // First check if this specific device had a saved room
  if (saved && saved.roomId) {
    if (!window.location.hash || window.location.hash.replace("#", "").trim() === saved.roomId) {
      try {
        const res = await fetch(`/api/rooms/${saved.roomId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            currentPromptRoomId = saved.roomId;
            modalTitle.textContent = "Party Already Live!";
            modalDesc.innerHTML = `Room <span class="modal-code">${saved.roomId}</span> is currently active. Would you like to join it?`;
            activeRoomModal.classList.remove("hidden");
            return;
          }
        }
      } catch {}
    }
  }

  // Cross-device check: see if ANY room is running on the server
  try {
    const res = await fetch("/api/active-room");
    if (res.ok) {
      const data = await res.json();
      if (data.hasActive) {
        currentPromptRoomId = data.roomId;
        if (!roomCodeInput.value) {
          roomCodeInput.value = data.roomId;
        }
      }
    }
  } catch {}
}

// Initial Setup: load previously saved name if the user entered one before
const savedName = localStorage.getItem("cineparty_username") || "";
usernameInput.value = savedName;

// Check if URL has a room hash (e.g. #7K4M)
if (window.location.hash) {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash) {
    roomCodeInput.value = hash;
    // Switch to Join tab
    switchTab("joinTab");
  }
}

checkApiStatus();
checkActiveRoom();

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

// CREATE ROOM ACTION (Checks for active room across all devices first)
createRoomBtn.addEventListener("click", async () => {
  const username = validateUsername();
  if (!username) return;

  // Cross-device check: Is a VM already active on the server from another device?
  try {
    const res = await fetch("/api/active-room");
    if (res.ok) {
      const data = await res.json();
      if (data.hasActive) {
        currentPromptRoomId = data.roomId;
        modalTitle.textContent = "Party Already Live!";
        modalDesc.innerHTML = `Room <span class="modal-code">${data.roomId}</span> is already active on another device. Would you like to join it?`;
        activeRoomModal.classList.remove("hidden");
        return;
      }
    }
  } catch {}

  executeCreateRoom(null);
});

// Modal Actions: Join Active Party OR Close Old & Start Fresh
rejoinActiveRoomBtn.addEventListener("click", async () => {
  const username = validateUsername();
  if (!username) return;

  activeRoomModal.classList.add("hidden");
  const saved = getSavedRoom();
  const targetRoomId = currentPromptRoomId || (saved ? saved.roomId : null);
  if (!targetRoomId) return;

  currentUser.username = username;

  // If this device created this exact room earlier, preserve host token:
  if (saved && saved.roomId === targetRoomId && saved.embedUrl) {
    currentUser.isHost = saved.isHost;
    await enterRoom(saved.roomId, saved.embedUrl, saved.adminToken, saved.isHost);
    return;
  }

  // Otherwise, join existing room on the other device as a participant:
  currentUser.isHost = false;
  try {
    const res = await fetch(`/api/rooms/${targetRoomId}`);
    const data = await res.json();
    if (data.success) {
      await enterRoom(data.roomId, data.embedUrl, null, false);
    } else {
      alert("Active room expired or closed.");
    }
  } catch (err) {
    alert("Error joining active party: " + err.message);
  }
});

function getLobbySocket() {
  if (!lobbySocket) {
    lobbySocket = io();
  }
  return lobbySocket;
}

// Device B asks permission to close & restart room
closeOldAndCreateBtn.addEventListener("click", () => {
  const username = validateUsername();
  if (!username) return;

  const saved = getSavedRoom();
  const targetRoomId = currentPromptRoomId || (saved ? saved.roomId : null);
  if (!targetRoomId) {
    activeRoomModal.classList.add("hidden");
    executeCreateRoom(null);
    return;
  }

  // Show waiting state on Device B
  modalNormalActions.classList.add("hidden");
  closeRequestWaiting.classList.remove("hidden");

  let remaining = 30;
  requestCountdown.textContent = remaining;
  if (activeRequestTimer) clearInterval(activeRequestTimer);
  activeRequestTimer = setInterval(() => {
    remaining--;
    requestCountdown.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(activeRequestTimer);
      activeRequestTimer = null;
    }
  }, 1000);

  const sock = getLobbySocket();

  // Send permission request to host on Device A
  sock.emit("request-close-room", {
    roomId: targetRoomId,
    requesterName: username,
  });

  // Listen once for host response
  sock.off("close-request-response");
  sock.once("close-request-response", ({ approved, reason }) => {
    if (activeRequestTimer) clearInterval(activeRequestTimer);
    activeRequestTimer = null;
    modalNormalActions.classList.remove("hidden");
    closeRequestWaiting.classList.add("hidden");

    if (approved) {
      activeRoomModal.classList.add("hidden");
      clearSavedRoom();
      showToast("🎉 Host approved! Starting your new party room...");
      setTimeout(() => {
        executeCreateRoom(targetRoomId);
      }, 1200);
    } else {
      showToast(reason || "❌ Request denied by host.");
    }
  });
});

cancelRequestBtn.addEventListener("click", () => {
  if (activeRequestTimer) clearInterval(activeRequestTimer);
  activeRequestTimer = null;
  modalNormalActions.classList.remove("hidden");
  closeRequestWaiting.classList.add("hidden");
  if (lobbySocket) {
    lobbySocket.emit("cancel-close-request", { requestId: currentPromptRoomId });
  }
});

cancelModalBtn.addEventListener("click", () => {
  activeRoomModal.classList.add("hidden");
});

async function executeCreateRoom(closeRoomId = null) {
  const username = validateUsername();
  if (!username) return;

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
      body: JSON.stringify({ startUrl, closeRoomId, forceNew: Boolean(closeRoomId) }),
    });

    const data = await res.json();
    if (!data.success) {
      if (data.alreadyRunning && data.activeRoomId) {
        currentPromptRoomId = data.activeRoomId;
        modalTitle.textContent = "Party Already Live!";
        modalDesc.innerHTML = `Room <span class="modal-code">${data.activeRoomId}</span> is already running. Would you like to join it?`;
        activeRoomModal.classList.remove("hidden");
        return;
      }
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
  const username = validateUsername();
  if (!username) return;

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
  inputCode = inputCode.trim().toUpperCase();

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

  // Initialize Hyperbeam Virtual Browser inside #hbMount
  try {
    // Clear previous instance if any
    if (hbInstance) {
      try { hbInstance.destroy(); } catch {}
      hbInstance = null;
    }

    // Clean previous elements from mount container
    hbMount.innerHTML = "";
    clickToPlayOverlay.classList.add("hidden");
    browserLoader.classList.remove("hidden");

    hbInstance = await Hyperbeam(hbMount, embedUrl, {
      adminToken: adminToken || undefined,
      volume: 1.0,
      delegate: true, // Allows mouse/keyboard input
      playoutDelay: true, // Smoother playback & prevents dropped frames / black screen on second devices
      timeout: 30000,
      onConnectionStateChange: (state) => {
        console.log("Hyperbeam stream connection state:", state);
        if (state === "connected" || state === "playing") {
          browserLoader.classList.add("hidden");
          clickToPlayOverlay.classList.add("hidden");
        }
      },
    });

    // Check after mount if browser autoplay policy blocked the video element
    setTimeout(() => {
      browserLoader.classList.add("hidden");
      const videoEl = hbMount.querySelector("video");
      if (videoEl && videoEl.paused) {
        console.warn("Autoplay blocked by browser policy. Displaying resume overlay.");
        clickToPlayOverlay.classList.remove("hidden");
      }
    }, 1200);

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

// User-activation unblock for browser autoplay policies
resumeStreamBtn.addEventListener("click", () => {
  clickToPlayOverlay.classList.add("hidden");
  if (hbInstance) {
    hbInstance.volume = 1.0;
  }
  const videoEl = hbMount.querySelector("video");
  if (videoEl) {
    videoEl.play().catch(() => {});
  }
});

// Quick 1-click Reload Stream button in navbar
reloadStreamBtn.addEventListener("click", () => {
  if (!currentRoom) return;
  showToast("🔄 Reconnecting video stream...");
  enterRoom(currentRoom.roomId, currentRoom.embedUrl, currentRoom.adminToken, currentRoom.isHost);
});

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

  // Handle incoming close permission request from Device B (appears on Device A)
  socket.on("incoming-close-request", ({ requestId, requesterName, timeoutSeconds }) => {
    incomingRequestId = requestId;
    requesterNameSpan.textContent = requesterName;
    hostApprovalModal.classList.remove("hidden");

    let remaining = timeoutSeconds || 30;
    hostCountdown.textContent = remaining;
    if (activeHostTimer) clearInterval(activeHostTimer);
    activeHostTimer = setInterval(() => {
      remaining--;
      hostCountdown.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(activeHostTimer);
        activeHostTimer = null;
        hostApprovalModal.classList.add("hidden");
        showToast("🛡️ Close request timed out. Kept your room active.");
      }
    }, 1000);
  });

  // Host denies closing (keeps room open)
  denyCloseBtn.onclick = () => {
    if (activeHostTimer) clearInterval(activeHostTimer);
    activeHostTimer = null;
    hostApprovalModal.classList.add("hidden");
    if (incomingRequestId) {
      socket.emit("respond-close-request", { requestId: incomingRequestId, approved: false });
      incomingRequestId = null;
    }
    showToast("🛡️ Kept your watch room active. Request denied.");
  };

  // Host allows closing
  allowCloseBtn.onclick = () => {
    if (activeHostTimer) clearInterval(activeHostTimer);
    activeHostTimer = null;
    hostApprovalModal.classList.add("hidden");
    if (incomingRequestId) {
      socket.emit("respond-close-request", { requestId: incomingRequestId, approved: true });
      incomingRequestId = null;
    }
    // Instantly close room on Device A and return to lobby
    teardownCurrentRoom("You approved closing this party room.");
  };

  // If room was closed by host approval
  socket.on("room-closed-by-host", () => {
    teardownCurrentRoom("This watch room was closed to start a new session.");
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

// Gracefully exit and teardown the active room
function teardownCurrentRoom(message) {
  clearSavedRoom();
  if (hbInstance) {
    try { hbInstance.destroy(); } catch {}
    hbInstance = null;
  }
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  currentRoom = null;
  window.location.hash = "";
  roomView.classList.add("hidden");
  lobbyView.classList.remove("hidden");
  if (message) {
    showToast(message);
  }
}

// Leave Room
leaveRoomBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to leave the watch party?")) {
    teardownCurrentRoom();
  }
});

// Helper HTML escape
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
