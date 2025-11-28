/**
 * LINE Web Automation Server
 * Express + Socket.IO + EJS + Multi-Instance Support
 */

require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const ADBController = require("./adb");
const LineController = require("./line-controller");
const MultiInstanceManager = require("./multi-instance");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Config from .env
const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || "localhost",
  adbPath: process.env.ADB_PATH,
  linePackage: process.env.LINE_PACKAGE,
  multiSendMode: process.env.MULTI_SEND_MODE || "parallel",
  delays: {
    afterTap: parseInt(process.env.DELAY_AFTER_TAP) || 1000,
    afterType: parseInt(process.env.DELAY_AFTER_TYPE) || 500,
    afterSend: parseInt(process.env.DELAY_AFTER_SEND) || 2000,
    betweenFriends: parseInt(process.env.DELAY_BETWEEN_FRIENDS) || 3000,
    pageLoad: parseInt(process.env.DELAY_PAGE_LOAD) || 2000,
  },
  coords: {
    friendsX: parseInt(process.env.COORD_FRIENDS_X) || 143,
    friendsY: parseInt(process.env.COORD_FRIENDS_Y) || 399,
    friendStartX: parseInt(process.env.COORD_FRIEND_START_X) || 300,
    friendStartY: parseInt(process.env.COORD_FRIEND_START_Y) || 351,
    friendHeight: parseInt(process.env.COORD_FRIEND_HEIGHT) || 89,
    chatBtnX: parseInt(process.env.COORD_CHAT_BTN_X) || 252,
    chatBtnY: parseInt(process.env.COORD_CHAT_BTN_Y) || 1715,
    inputX: parseInt(process.env.COORD_INPUT_X) || 400,
    inputY: parseInt(process.env.COORD_INPUT_Y) || 1881,
    sendX: parseInt(process.env.COORD_SEND_X) || 1040,
    sendY: parseInt(process.env.COORD_SEND_Y) || 1881,
    backX: parseInt(process.env.COORD_BACK_X) || 33,
    backY: parseInt(process.env.COORD_BACK_Y) || 76,
    homeX: parseInt(process.env.COORD_HOME_X) || 108,
    homeY: parseInt(process.env.COORD_HOME_Y) || 1869,
  },
};

// สร้าง Multi-Instance Manager
let multiManager = new MultiInstanceManager(config, io);

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== ROUTES ====================

// หน้าแรก
app.get("/", async (req, res) => {
  const instances = await multiManager.autoDetect();
  const status = multiManager.getCombinedStatus();
  res.render("index", { instances, status, config });
});

// ==================== API: INSTANCES ====================

// Auto-detect instances
app.get("/api/instances", async (req, res) => {
  const instances = await multiManager.autoDetect();
  res.json({ success: true, instances });
});

// Get instances info
app.get("/api/instances/info", (req, res) => {
  const instances = multiManager.getInstancesInfo();
  res.json({ success: true, instances });
});

// Get single instance info
app.get("/api/instances/:deviceId", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    res.json({ success: true, info: instance.info });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// ==================== API: LINE APP ====================

// Start LINE on specific instance
app.post("/api/instances/:deviceId/start-line", async (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const result = await multiManager.startLineOnInstance(deviceId);
  res.json(result);
});

// Start LINE on all instances
app.post("/api/instances/start-line-all", async (req, res) => {
  const results = await multiManager.startLineOnAll();
  res.json({ success: true, results });
});

// ==================== API: SENDING ====================

// Send on specific instance
app.post("/api/instances/:deviceId/send", async (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const { message, totalFriends, startFrom, limit } = req.body;

  if (!message || !totalFriends) {
    return res.json({ success: false, error: "Missing message or totalFriends" });
  }

  const instance = multiManager.getInstance(deviceId);
  if (!instance) {
    return res.json({ success: false, error: "Instance not found" });
  }

  if (instance.lineController.isRunning) {
    return res.json({ success: false, error: "Already running" });
  }

  // เริ่มส่งใน background
  instance.lineController.sendToAllFriends(message, parseInt(totalFriends), {
    startFrom: parseInt(startFrom) || 0,
    limit: parseInt(limit) || 0,
  });

  res.json({ success: true, message: "Started sending" });
});

// Send on ALL instances
app.post("/api/send-all", async (req, res) => {
  const { message, friendsPerInstance, parallel, sendAll } = req.body;

  if (!message || !friendsPerInstance) {
    return res.json({ success: false, error: "Missing message or friendsPerInstance" });
  }

  // เริ่มส่งใน background
  multiManager.sendOnAllInstances(message, friendsPerInstance, {
    parallel: parallel !== false,
    sendAll: sendAll === true,
  });

  res.json({ success: true, message: "Started multi-instance sending" });
});

// ==================== API: CONTROL ====================

// Pause specific instance
app.post("/api/instances/:deviceId/pause", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    instance.lineController.pause();
    res.json({ success: true });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// Resume specific instance
app.post("/api/instances/:deviceId/resume", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    instance.lineController.resume();
    res.json({ success: true });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// Stop specific instance
app.post("/api/instances/:deviceId/stop", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    instance.lineController.stop();
    res.json({ success: true });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// Reset specific instance
app.post("/api/instances/:deviceId/reset", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    instance.lineController.reset();
    res.json({ success: true });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// Pause all
app.post("/api/pause-all", (req, res) => {
  multiManager.pauseAll();
  res.json({ success: true });
});

// Resume all
app.post("/api/resume-all", (req, res) => {
  multiManager.resumeAll();
  res.json({ success: true });
});

// Stop all
app.post("/api/stop-all", (req, res) => {
  multiManager.stopAll();
  res.json({ success: true });
});

// Reset all
app.post("/api/reset-all", (req, res) => {
  multiManager.resetAll();
  res.json({ success: true });
});

// ==================== API: STATUS ====================

// Get combined status
app.get("/api/status", (req, res) => {
  const status = multiManager.getCombinedStatus();
  res.json({ success: true, ...status });
});

// Get specific instance status
app.get("/api/instances/:deviceId/status", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    const status = instance.lineController.getStatus();
    res.json({ success: true, ...status });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// ==================== API: LOGS ====================

app.get("/api/logs", (req, res) => {
  const logDir = path.join(__dirname, "logs");
  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join(logDir, `${today}.log`);

  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, "utf8");
    const lines = logs.split("\n").filter(Boolean).slice(-200);
    res.json({ success: true, logs: lines });
  } else {
    res.json({ success: true, logs: [] });
  }
});

// ==================== SOCKET.IO ====================

io.on("connection", async (socket) => {
  console.log("Client connected");

  // Auto-detect และส่ง instances
  const instances = await multiManager.autoDetect();
  const status = multiManager.getCombinedStatus();
  
  socket.emit("init", {
    instances,
    status,
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });

  // Refresh instances
  socket.on("refresh-instances", async () => {
    const instances = await multiManager.autoDetect();
    socket.emit("instances", instances);
  });
});

// ==================== START SERVER ====================

server.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     LINE Web Automation v2.0 (Multi-Instance)                 ║
║     ─────────────────────────────────────────                 ║
║     Server running at http://${config.host}:${config.port}                  ║
║                                                               ║
║     Features:                                                 ║
║     • Auto-detect BlueStacks instances                        ║
║     • Send from multiple LINE accounts                        ║
║     • Parallel or Sequential mode                             ║
║     • Real-time progress tracking                             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});