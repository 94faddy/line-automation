/**
 * LINE Web Automation Server v4.0
 * - รองรับเลือก instance ที่ต้องการส่ง
 * - Progress tracking แยกแต่ละ instance
 * - State file แยกแต่ละ instance
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

// Auto-refresh interval (วินาที)
const autoRefreshInterval = parseInt(process.env.AUTO_REFRESH_INTERVAL) || 5;

// Create directories
const dataDir = path.join(__dirname, "data");
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// สร้าง Multi-Instance Manager
let multiManager = new MultiInstanceManager(config, io);

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== ROUTES ====================

app.get("/", async (req, res) => {
  const instances = multiManager.getInstancesInfo();
  const status = multiManager.getCombinedStatus();
  res.render("index", { instances, status, config, autoRefreshInterval });
});

// ==================== API: INSTANCES ====================

app.get("/api/instances", async (req, res) => {
  const instances = await multiManager.autoDetect();
  res.json({ success: true, instances });
});

app.get("/api/instances/info", (req, res) => {
  const instances = multiManager.getInstancesInfo();
  res.json({ success: true, instances });
});

// API สำหรับ auto-refresh status (เบาๆ ไม่ detect ใหม่)
app.get("/api/instances/status", async (req, res) => {
  const instances = multiManager.getInstancesStatus();
  res.json({ success: true, instances });
});

app.get("/api/instances/:deviceId", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    res.json({ success: true, info: instance.info });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

app.get("/api/instances/:deviceId/status", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const status = multiManager.getInstanceStatus(deviceId);
  if (status) {
    res.json({ success: true, ...status });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// ==================== API: LINE APP ====================

app.post("/api/instances/:deviceId/start-line", async (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const result = await multiManager.startLineOnInstance(deviceId);
  res.json(result);
});

app.post("/api/instances/start-line-all", async (req, res) => {
  const results = await multiManager.startLineOnAll();
  res.json({ success: true, results });
});

// ==================== API: SENDING ====================

// ส่งไปยัง instance เดียว
app.post("/api/instances/:deviceId/send", async (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const { message, totalFriends, startFrom, limit, speed, sendAll } = req.body;

  if (!message) {
    return res.json({ success: false, error: "Missing message" });
  }

  const instance = multiManager.getInstance(deviceId);
  if (!instance) {
    return res.json({ success: false, error: "Instance not found" });
  }

  if (instance.lineController.isRunning) {
    return res.json({ success: false, error: "Already running" });
  }

  instance.lineController.sendToAllFriends(message, parseInt(totalFriends) || 9999, {
    startFrom: parseInt(startFrom) || 0,
    limit: parseInt(limit) || 0,
    speed: speed || 'fast',
    sendAll: sendAll === true || !totalFriends,
  });

  res.json({ success: true, message: "Started sending" });
});

// ส่งไปยัง instances ที่เลือก (API ใหม่)
app.post("/api/send-selected", async (req, res) => {
  const { message, selectedInstances, parallel, sendAll, speed } = req.body;

  if (!message) {
    return res.json({ success: false, error: "Missing message" });
  }

  if (!selectedInstances || Object.keys(selectedInstances).length === 0) {
    return res.json({ success: false, error: "No instances selected" });
  }

  multiManager.sendOnSelectedInstances(message, selectedInstances, {
    parallel: parallel !== false,
    sendAll: sendAll === true,
    speed: speed || 'fast',
  });

  res.json({ success: true, message: "Started multi-instance sending" });
});

// Legacy API (backward compatibility)
app.post("/api/send-all", async (req, res) => {
  const { message, friendsPerInstance, parallel, sendAll, speed } = req.body;

  if (!message || !friendsPerInstance) {
    return res.json({ success: false, error: "Missing message or friendsPerInstance" });
  }

  multiManager.sendOnAllInstances(message, friendsPerInstance, {
    parallel: parallel !== false,
    sendAll: sendAll === true,
    speed: speed || 'fast',
  });

  res.json({ success: true, message: "Started multi-instance sending" });
});

// ==================== API: CONTROL (Per Instance) ====================

app.post("/api/instances/:deviceId/pause", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const result = multiManager.pauseInstance(deviceId);
  res.json(result);
});

app.post("/api/instances/:deviceId/resume", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const result = multiManager.resumeInstance(deviceId);
  res.json(result);
});

app.post("/api/instances/:deviceId/stop", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const result = multiManager.stopInstance(deviceId);
  res.json(result);
});

app.post("/api/instances/:deviceId/reset", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const result = multiManager.resetInstance(deviceId);
  res.json(result);
});

// ==================== API: CONTROL (All Instances) ====================

app.post("/api/pause-all", (req, res) => {
  multiManager.pauseAll();
  res.json({ success: true });
});

app.post("/api/resume-all", (req, res) => {
  multiManager.resumeAll();
  res.json({ success: true });
});

app.post("/api/stop-all", (req, res) => {
  multiManager.stopAll();
  res.json({ success: true });
});

app.post("/api/reset-all", (req, res) => {
  multiManager.resetAll();
  res.json({ success: true });
});

// ==================== API: STATUS ====================

app.get("/api/status", (req, res) => {
  const status = multiManager.getCombinedStatus();
  res.json({ success: true, ...status });
});

// ==================== API: SAVED STATE ====================

app.get("/api/instances/:deviceId/saved-state", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    const stateInfo = instance.lineController.getSavedStateInfo();
    res.json({ 
      success: true, 
      hasSavedState: !!stateInfo,
      state: stateInfo 
    });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

app.post("/api/instances/:deviceId/clear-state", (req, res) => {
  const deviceId = decodeURIComponent(req.params.deviceId);
  const instance = multiManager.getInstance(deviceId);
  if (instance) {
    instance.lineController.clearState();
    res.json({ success: true, message: "State cleared" });
  } else {
    res.json({ success: false, error: "Instance not found" });
  }
});

// ==================== API: LOGS ====================

app.get("/api/logs", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join(logsDir, `${today}.log`);

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

  const instances = await multiManager.autoDetect();
  const status = multiManager.getCombinedStatus();
  
  socket.emit("init", {
    instances,
    status,
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });

  socket.on("refresh-instances", async () => {
    const instances = await multiManager.autoDetect();
    socket.emit("instances", instances);
  });
  
  // Auto-refresh status (เบาๆ ไม่ detect ใหม่)
  socket.on("refresh-status", () => {
    const now = new Date().toLocaleTimeString();
    console.log(`[${now}] refresh-status requested (interval: ${autoRefreshInterval}s)`);
    const instances = multiManager.getInstancesStatus();
    socket.emit("status-update", { instances });
  });
});

// ==================== START SERVER ====================

server.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     LINE Web Automation v4.0                                  ║
║     ─────────────────────────────────────────                 ║
║     Server running at http://${config.host}:${config.port}                  ║
║                                                               ║
║     New Features:                                             ║
║     • เลือก instance ที่ต้องการส่งได้                          ║
║     • Progress bar แยกแต่ละ instance                          ║
║     • State file แยกแต่ละ instance                            ║
║     • ควบคุมแต่ละ instance แยกกันได้                          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});