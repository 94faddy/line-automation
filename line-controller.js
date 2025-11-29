/**
 * LINE Controller Module v4.0
 * - State file แยกตาม deviceId
 * - รองรับ multi-instance progress tracking
 * - Thai/Emoji/URL ผ่าน file + clipper + paste
 */

const fs = require("fs");
const path = require("path");
const ADBController = require("./adb");

class LineController {
  constructor(config, io = null) {
    this.config = config;
    this.io = io;
    this.adb = new ADBController(config.adbPath, config.deviceId);
    this.deviceId = config.deviceId;
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentIndex = 0;
    this.totalFriends = 0;
    this.sentFriends = [];
    this.failedFriends = [];
    
    // State file แยกตาม deviceId
    const safeDeviceId = this.deviceId.replace(/[:.]/g, '_');
    this.stateFile = path.join(__dirname, "data", `state_${safeDeviceId}.json`);
    
    this.speedMultiplier = 1.0;
    this.debugMode = true;
    this.restartLineBeforeSend = true;
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message, deviceId: this.deviceId };
    
    console.log(`[${timestamp}] [${this.deviceId}] [${type.toUpperCase()}] ${message}`);
    
    if (this.io) {
      this.io.emit("log", logEntry);
    }

    const logDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `${new Date().toISOString().split("T")[0]}.log`);
    fs.appendFileSync(logFile, `[${timestamp}] [${this.deviceId}] [${type.toUpperCase()}] ${message}\n`);
  }

  emitStatus(data) {
    if (this.io) {
      // เพิ่ม deviceId ในทุก status event
      this.io.emit("instance-status", { 
        ...data, 
        deviceId: this.deviceId 
      });
    }
  }

  wait(ms) {
    const actualMs = Math.round(ms * this.speedMultiplier);
    return new Promise(resolve => setTimeout(resolve, actualMs));
  }

  setSpeed(speed) {
    switch (speed) {
      case 'turbo': this.speedMultiplier = 0.3; break;
      case 'fast': this.speedMultiplier = 0.5; break;
      case 'normal': default: this.speedMultiplier = 1.0; break;
    }
    this.log(`Speed set to ${speed} (${this.speedMultiplier}x)`, "info");
  }

  saveState() {
    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const state = {
      deviceId: this.deviceId,
      currentIndex: this.currentIndex,
      totalFriends: this.totalFriends,
      sentFriends: this.sentFriends,
      failedFriends: this.failedFriends,
      lastUpdated: new Date().toISOString(),
      isRunning: this.isRunning,
      isPaused: this.isPaused,
    };
    
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    return state;
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, "utf8");
        return JSON.parse(data);
      }
    } catch (e) {
      this.log(`Error loading state: ${e.message}`, "error");
    }
    return null;
  }

  clearState() {
    this.currentIndex = 0;
    this.sentFriends = [];
    this.failedFriends = [];
    if (fs.existsSync(this.stateFile)) {
      fs.unlinkSync(this.stateFile);
    }
  }

  async goHome() {
    this.adb.tap(this.config.coords.homeX, this.config.coords.homeY);
    await this.wait(500);
  }

  async goToFriendsList() {
    this.adb.tap(this.config.coords.friendsX, this.config.coords.friendsY);
    await this.wait(this.config.delays.pageLoad * 0.7);
  }

  async restartLine() {
    const linePackage = this.config.linePackage;
    
    this.log("🔄 Restarting LINE app...", "info");
    this.emitStatus({ type: "restarting" });
    
    this.log("   Stopping LINE...");
    this.adb.forceStopLine(linePackage);
    await this.wait(1500);
    
    this.log("   Starting LINE...");
    const startResult = this.adb.startLineAndWait(linePackage, 15000);
    
    if (!startResult.success) {
      this.log("   ⚠️ LINE may not have started properly", "warn");
    } else {
      this.log(`   ✓ LINE started in ${startResult.waitTime}ms`);
    }
    
    await this.wait(2000);
    
    this.log("   Going to LINE Home...");
    this.adb.tap(this.config.coords.homeX, this.config.coords.homeY);
    await this.wait(1500);
    
    this.adb.tap(this.config.coords.homeX, this.config.coords.homeY);
    await this.wait(1000);
    
    this.log("✓ LINE restarted and ready", "success");
    return true;
  }

  async ensureLineRunning() {
    const linePackage = this.config.linePackage;
    
    if (!this.adb.isLineRunning(linePackage)) {
      this.log("LINE is not running, starting...", "warn");
      await this.restartLine();
      return true;
    }
    return false;
  }

  checkConnection() {
    const devices = ADBController.getDevices(this.config.adbPath);
    if (devices.length === 0) {
      return { connected: false, message: "No BlueStacks instances found" };
    }

    const isConnected = this.adb.isConnected();
    if (!isConnected) {
      return { connected: false, message: "Device not connected" };
    }

    const screenSize = this.adb.getScreenSize();
    const lineInstalled = this.adb.isLineInstalled(this.config.linePackage);
    const lineRunning = this.adb.isLineRunning(this.config.linePackage);

    return { connected: true, deviceId: this.config.deviceId, screenSize, lineInstalled, lineRunning };
  }

  async sendToFriend(friendIndex, message) {
    const coords = this.config.coords;
    const d = this.config.delays;
    const friendNum = friendIndex + 1;
    
    try {
      this.log(`[#${friendNum}] Step 1: Going to LINE Home...`);
      this.adb.tap(coords.homeX, coords.homeY);
      await this.wait(600);
      
      this.log(`[#${friendNum}] Step 2: Opening Friend list...`);
      this.adb.tap(coords.friendsX, coords.friendsY);
      await this.wait(d.pageLoad * 0.8);

      const itemsPerScreen = 15;
      const screenIndex = Math.floor(friendIndex / itemsPerScreen);
      const positionInScreen = friendIndex % itemsPerScreen;

      if (screenIndex > 0) {
        this.log(`[#${friendNum}] Step 3: Scrolling to page ${screenIndex + 1}...`);
        for (let i = 0; i < screenIndex; i++) {
          this.adb.swipe(540, 1200, 540, 400, 200);
          await this.wait(600);
        }
        await this.wait(500);
      }

      const friendY = coords.friendStartY + (positionInScreen * coords.friendHeight);
      this.log(`[#${friendNum}] Step 4: Tapping friend at (${coords.friendStartX}, ${friendY})...`);
      this.adb.tap(coords.friendStartX, friendY);
      await this.wait(d.pageLoad * 0.8);

      this.log(`[#${friendNum}] Step 5: Tapping Chat button...`);
      this.adb.tap(coords.chatBtnX, coords.chatBtnY);
      await this.wait(d.pageLoad * 0.8);

      this.log(`[#${friendNum}] Step 6: Clearing old clipboard...`);
      this.adb.setClipboard("");
      await this.wait(200);

      this.log(`[#${friendNum}] Step 7: Tapping input field...`);
      this.adb.tap(coords.inputX, coords.inputY);
      await this.wait(400);
      this.adb.tap(coords.inputX, coords.inputY);
      await this.wait(500);

      this.log(`[#${friendNum}] Step 8: Typing message (${message.length} chars)...`);
      const typeResult = this.adb.type(message, { debug: this.debugMode });
      
      if (!typeResult.success) {
        this.log(`[#${friendNum}] ⚠️ Type failed: ${typeResult.error}`, "warn");
        await this.wait(500);
        this.adb.tap(coords.inputX, coords.inputY);
        await this.wait(400);
        this.adb.type(message);
      }

      this.log(`[#${friendNum}] Step 9: Waiting for text...`);
      await this.wait(800);

      this.log(`[#${friendNum}] Step 10: Pressing send button...`);
      this.adb.tap(coords.sendX, coords.sendY);
      await this.wait(d.afterSend * 0.7);

      this.log(`[#${friendNum}] Step 11: Going back to LINE home...`);
      this.adb.pressBack();
      await this.wait(600);
      this.adb.tap(coords.homeX, coords.homeY);
      await this.wait(600);

      this.log(`[#${friendNum}] ✅ Send sequence completed`, "success");
      return { success: true };

    } catch (error) {
      this.log(`[#${friendNum}] ❌ Error: ${error.message}`, "error");
      this.adb.tap(coords.homeX, coords.homeY);
      await this.wait(300);
      return { success: false, error: error.message };
    }
  }

  async sendToAllFriends(message, totalFriends, options = {}) {
    const { startFrom = 0, limit = 0, sendAll = false, speed = 'fast', forceRestart = false } = options;
    
    this.setSpeed(speed);
    this.isRunning = true;
    this.shouldStop = false;
    
    this.log("========== PREPARING TO SEND ==========", "info");
    this.emitStatus({ type: "preparing" });
    
    if (this.restartLineBeforeSend) {
      await this.restartLine();
    }
    
    this.log("Checking clipper service...");
    const clipperCheck = this.adb.checkClipperService();
    if (!clipperCheck.available) {
      this.log("⚠️ Clipper service may not be available!", "warn");
      this.emitStatus({ type: "error", message: "Clipper service not available" });
    } else {
      this.log("✓ Clipper service is available", "success");
    }

    let actualTotalFriends = totalFriends;
    
    if (sendAll || totalFriends >= 9999) {
      this.log("Detecting actual friends count...", "info");
      this.emitStatus({ type: "detecting-friends" });
      
      await this.goHome();
      await this.wait(700);
      await this.goToFriendsList();
      await this.wait(1500);
      
      const detectedCount = this.adb.getFriendsCount();
      this.adb.cleanupUIDump();
      
      if (detectedCount > 0) {
        actualTotalFriends = detectedCount;
        this.log(`✓ Detected ${actualTotalFriends} friends`, "success");
        this.emitStatus({ type: "friends-detected", count: actualTotalFriends });
      } else {
        this.log("Could not detect friends count", "error");
        this.isRunning = false;
        this.emitStatus({ type: "error", message: "Could not detect friends count" });
        return { total: 0, success: 0, failed: 0, error: "Could not detect friends count" };
      }
      
      this.adb.pressBack();
      await this.wait(700);
      await this.goHome();
      await this.wait(700);
    }

    const savedState = this.loadState();
    let resumeFromSaved = false;
    
    if (savedState && savedState.currentIndex > 0 && !forceRestart) {
      this.log(`📋 Found saved state: ${savedState.currentIndex}/${savedState.totalFriends}`, "info");
      
      if (savedState.currentIndex >= actualTotalFriends) {
        this.log(`✅ Previous session completed, starting fresh`, "success");
        this.currentIndex = 0;
        this.sentFriends = [];
        this.failedFriends = [];
        this.clearState();
      } else if (savedState.totalFriends !== actualTotalFriends) {
        if (actualTotalFriends < savedState.currentIndex) {
          this.log(`⚠️ Friends count changed, starting fresh`, "warn");
          this.currentIndex = 0;
          this.sentFriends = [];
          this.failedFriends = [];
          this.clearState();
        } else {
          this.log(`✓ Resuming from friend #${savedState.currentIndex + 1}`, "info");
          this.currentIndex = savedState.currentIndex;
          this.sentFriends = savedState.sentFriends || [];
          this.failedFriends = savedState.failedFriends || [];
          resumeFromSaved = true;
        }
      } else {
        this.currentIndex = savedState.currentIndex;
        this.sentFriends = savedState.sentFriends || [];
        this.failedFriends = savedState.failedFriends || [];
        resumeFromSaved = true;
      }
      
      if (resumeFromSaved) {
        this.log(`🔄 Resuming from friend #${this.currentIndex + 1}...`, "info");
        this.emitStatus({ 
          type: "resume", 
          currentIndex: this.currentIndex, 
          totalFriends: actualTotalFriends,
          sentCount: this.sentFriends.length,
          failedCount: this.failedFriends.length
        });
      }
    } else {
      this.currentIndex = startFrom;
      this.sentFriends = [];
      this.failedFriends = [];
    }
    
    this.totalFriends = actualTotalFriends;
    const endIndex = limit > 0 ? Math.min(this.currentIndex + limit, actualTotalFriends) : actualTotalFriends;
    const totalToSend = endIndex - this.currentIndex;

    if (totalToSend <= 0) {
      this.log("No friends to send to", "warn");
      this.isRunning = false;
      this.emitStatus({ type: "complete", summary: { total: 0, success: 0, failed: 0 } });
      return { total: 0, success: 0, failed: 0 };
    }

    this.log(`Starting to send messages to ${totalToSend} friends (speed: ${speed})`, "info");
    this.emitStatus({ type: "start", total: totalToSend, totalFriends: actualTotalFriends, current: 0 });

    const startIndex = this.currentIndex;
    const startTime = Date.now();

    for (let i = startIndex; i < endIndex; i++) {
      if (this.shouldStop) {
        this.log("Stopped by user", "warn");
        this.emitStatus({ type: "stopped" });
        break;
      }

      while (this.isPaused) {
        await this.wait(1000);
      }

      if (i % 10 === 0 && i > startIndex) {
        await this.ensureLineRunning();
      }

      const friendNum = i + 1;
      const progress = i - startIndex + 1;
      const percent = Math.round((progress / totalToSend) * 100);
      
      const elapsed = Date.now() - startTime;
      const avgTimePerFriend = elapsed / progress;
      const remaining = Math.round((totalToSend - progress) * avgTimePerFriend / 1000);

      this.log(`[${progress}/${totalToSend}] (${percent}%) Friend #${friendNum}`);

      const result = await this.sendToFriend(i, message);

      if (result.success) {
        this.sentFriends.push({ index: i, friendNum, sentAt: new Date().toISOString() });
        this.log(`✅ Friend #${friendNum} - SUCCESS`, "success");
        this.emitStatus({
          type: "sent", 
          current: progress, 
          total: totalToSend, 
          totalFriends: actualTotalFriends,
          percent, 
          friendNum,
          success: true, 
          eta: remaining,
          sentCount: this.sentFriends.length,
          failedCount: this.failedFriends.length
        });
      } else {
        this.failedFriends.push({ index: i, friendNum, error: result.error });
        this.log(`❌ Friend #${friendNum} - FAILED: ${result.error}`, "error");
        this.emitStatus({
          type: "sent", 
          current: progress, 
          total: totalToSend,
          totalFriends: actualTotalFriends,
          percent, 
          friendNum,
          success: false, 
          error: result.error,
          eta: remaining,
          sentCount: this.sentFriends.length,
          failedCount: this.failedFriends.length
        });
      }

      this.currentIndex = i + 1;
      this.saveState();

      if (i < endIndex - 1) {
        await this.wait(this.config.delays.betweenFriends * 0.5);
      }
    }

    this.isRunning = false;
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);

    const summary = {
      total: totalToSend,
      success: this.sentFriends.length,
      failed: this.failedFriends.length,
      sentFriends: this.sentFriends,
      failedFriends: this.failedFriends,
      totalTime,
      avgTimePerFriend: Math.round(totalTime / totalToSend * 10) / 10,
    };

    this.log(`========== COMPLETED ==========`, "info");
    this.log(`Total time: ${totalTime}s, Success: ${summary.success}, Failed: ${summary.failed}`, 
             summary.failed > 0 ? "warn" : "success");
    
    this.emitStatus({ type: "complete", summary });

    if (this.currentIndex >= this.totalFriends) {
      this.clearState();
    }

    return summary;
  }

  pause() {
    this.isPaused = true;
    this.log("Paused", "warn");
    this.emitStatus({ type: "paused" });
  }

  resume() {
    this.isPaused = false;
    this.log("Resumed", "info");
    this.emitStatus({ type: "resumed" });
  }

  stop() {
    this.shouldStop = true;
    this.isPaused = false;
    this.log("Stopping...", "warn");
    this.emitStatus({ type: "stopping" });
  }

  reset() {
    this.clearState();
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentIndex = 0;
    this.totalFriends = 0;
    this.sentFriends = [];
    this.failedFriends = [];
    this.log("Reset complete", "info");
    this.emitStatus({ type: "reset" });
  }

  getStatus() {
    const state = this.loadState();
    return {
      deviceId: this.deviceId,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentIndex: state?.currentIndex || 0,
      totalFriends: state?.totalFriends || 0,
      sentCount: state?.sentFriends?.length || 0,
      failedCount: state?.failedFriends?.length || 0,
      sentFriends: state?.sentFriends || [],
      failedFriends: state?.failedFriends || [],
      lastUpdated: state?.lastUpdated,
      hasSavedState: !!(state && state.currentIndex > 0),
    };
  }

  hasSavedState() {
    const state = this.loadState();
    return state && state.currentIndex > 0 && state.currentIndex < state.totalFriends;
  }

  getSavedStateInfo() {
    const state = this.loadState();
    if (!state || state.currentIndex === 0) {
      return null;
    }
    return {
      deviceId: this.deviceId,
      currentIndex: state.currentIndex,
      totalFriends: state.totalFriends,
      sentCount: state.sentFriends?.length || 0,
      failedCount: state.failedFriends?.length || 0,
      lastUpdated: state.lastUpdated,
      remaining: state.totalFriends - state.currentIndex
    };
  }
}

module.exports = LineController;