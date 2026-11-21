# 🍿 CineParty — Teleparty for the Open Web (No Extensions Required)

A full-featured watch-party web application powered by **Hyperbeam** and **Socket.io**.

Instead of requiring browser extensions or external apps, CineParty provides a **shared virtual browser** directly inside a webpage. You and your friends can browse any website together, search for movies, click play, and enjoy synchronized video & audio with real-time text chat.

---

## 🌟 Key Features

* **No Extensions or Apps Needed:** Users just open a web link in Chrome, Safari, Edge, Firefox, or on mobile.
* **Browse Any Website Together:** Navigate to any movie or video streaming website freely.
* **🛡️ Built-in Ad & Popup Blocker:** Automatically launches with **uBlock Origin enabled** inside the virtual browser to block sketchy popups, redirects, and ads from free streaming sites.
* **Sub-Second Audio/Video Sync:** Powered by low-latency WebRTC.
* **Live Group Chat:** Integrated real-time chat with emoji reactions and presence tracking.
* **Host & Shared Controls:** The host can allow everyone to browse and click, or lock controls to host-only.
* **One-Click Invite:** Easy room codes and shareable links (e.g. `http://localhost:3000/#cine-a1b2c3`).

---

## 🚀 Quick Start Guide

### 1. Get your Hyperbeam API Key (Free)
1. Go to [https://hyperbeam.com/developer](https://hyperbeam.com/developer).
2. Sign in and create a free developer project to get your **API Key** (Hyperbeam provides free credits for development/personal rooms).

### 2. Configure Environment
Open `.env` in the project root:
```env
PORT=3000
HYPERBEAM_API_KEY=your_actual_hyperbeam_api_key_here
```

### 3. Run the Server
```bash
npm start
```
Or for development with auto-reload:
```bash
npm run dev
```

### 4. Start Watching!
* Open `http://localhost:3000` in your browser.
* Pick a nickname, choose a starting URL (default: Google), and click **Launch Party Room**.
* Click **Share Link** to send the URL to your friends. They can join immediately with no sign-ups or extensions!

---

## 🛠️ Tech Stack
* **Backend:** Node.js (ES Modules), Express, Socket.io
* **Virtual Browser Engine:** Hyperbeam REST API (`POST /v0/vm` with `ublock: true`)
* **Client Frontend:** Vanilla Modern JS + CSS (Zero-build, served statically), `@hyperbeam/web` via ESM
