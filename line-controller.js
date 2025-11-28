/**
 * LINE Controller Module
 * ควบคุมการส่งข้อความ LINE ผ่าน ADB
 */

const fs = require("fs");
const path = require("path");
const ADBController = require("./adb");

class LineController {
  constructor(config, io = null) {
    this.config = config;
    this.io = io; // Socket.IO for real-time updates
    this.adb = new ADBController(config.adbPath, config.deviceId);
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentIndex = 0;
    this.totalFriends = 0;
    this.sentFriends = [];
    this.failedFriends = [];
    this.stateFile = path.join(__dirname, "data", "state.json");
  }

  // ส่ง log ไปยัง client
  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message };
    
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
    
    if (this.io) {
      this.io.emit("log", logEntry);
    }

    // บันทึกลงไฟล์
    const logFile = path.join(__dirname, "logs", `${new Date().toISOString().split("T")[0]}.log`);
    fs.appendFileSync(logFile, `[${timestamp}] [${type.toUpperCase()}] ${message}\n`);
  }

  // ส่ง status update
  emitStatus(data) {
    if (this.io) {
      this.io.emit("status", data);
    }
  }

  // รอ
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // บันทึก state
  saveState() {
    const state = {
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

  // โหลด state
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

  // ลบ state (เริ่มใหม่)
  clearState() {
    this.currentIndex = 0;
    this.sentFriends = [];
    this.failedFriends = [];
    if (fs.existsSync(this.stateFile)) {
      fs.unlinkSync(this.stateFile);
    }
  }

  // ไปหน้า Home ของ LINE
  async goHome() {
    this.adb.tap(this.config.coords.homeX, this.config.coords.homeY);
    await this.wait(1000);
  }

  // ไปหน้า Friend lists
  async goToFriendsList() {
    // กด Friends button
    this.adb.tap(this.config.coords.friendsX, this.config.coords.friendsY);
    await this.wait(this.config.delays.pageLoad);
  }

  // เช็คและเปิด LINE
  async ensureLineRunning() {
    const linePackage = this.config.linePackage;
    
    if (!this.adb.isLineRunning(linePackage)) {
      this.log("LINE is not running, starting...", "warn");
      this.adb.startLine(linePackage);
      await this.wait(5000); // รอ LINE เปิด
      
      // กด Home เพื่อไปหน้า Home ของ LINE
      await this.wait(2000);
      this.adb.tap(this.config.coords.homeX, this.config.coords.homeY);
      await this.wait(2000);
      
      return true;
    }
    return false;
  }

  // เช็ค connection
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

    return {
      connected: true,
      deviceId: this.config.deviceId,
      screenSize,
      lineInstalled,
      lineRunning,
    };
  }

  // ส่งข้อความหาเพื่อนคนที่ index
  async sendToFriend(friendIndex, message) {
    const coords = this.config.coords;
    
    try {
      // 1. เปิด Friend list
      this.log(`Opening Friend list...`);
      this.adb.tap(coords.friendsX, coords.friendsY);
      await this.wait(this.config.delays.pageLoad);

      // 2. คำนวณตำแหน่งเพื่อน
      const itemsPerScreen = 15;
      const screenIndex = Math.floor(friendIndex / itemsPerScreen);
      const positionInScreen = friendIndex % itemsPerScreen;

      // 3. Scroll ถ้าจำเป็น
      if (screenIndex > 0) {
        this.log(`Scrolling to page ${screenIndex + 1}...`);
        for (let i = 0; i < screenIndex; i++) {
          this.adb.swipe(540, 1200, 540, 400, 300);
          await this.wait(1000);
        }
        await this.wait(1000);
      }

      // 4. คำนวณ Y
      const friendY = coords.friendStartY + (positionInScreen * coords.friendHeight);
      
      this.log(`Tapping friend at (${coords.friendStartX}, ${friendY})`);
      this.adb.tap(coords.friendStartX, friendY);
      await this.wait(this.config.delays.pageLoad);

      // 5. กด Chat
      this.log(`Tapping Chat button`);
      this.adb.tap(coords.chatBtnX, coords.chatBtnY);
      await this.wait(this.config.delays.pageLoad);

      // 6. กดช่องพิมพ์
      this.log(`Tapping input`);
      this.adb.tap(coords.inputX, coords.inputY);
      await this.wait(this.config.delays.afterTap);

      // 7. พิมพ์
      this.log(`Typing message`);
      this.adb.type(message);
      await this.wait(this.config.delays.afterType);

      // 8. กดส่ง
      this.log(`Sending message`);
      this.adb.tap(coords.sendX, coords.sendY);
      await this.wait(this.config.delays.afterSend);

      // 9. กด Back
      this.log(`Going back to Chat list`);
      this.adb.tap(coords.backX, coords.backY);
      await this.wait(1000);

      // 10. กด Home
      this.log(`Going to Home`);
      this.adb.tap(coords.homeX, coords.homeY);
      await this.wait(this.config.delays.pageLoad);

      return { success: true };

    } catch (error) {
      this.log(`Error sending to friend #${friendIndex + 1}: ${error.message}`, "error");
      return { success: false, error: error.message };
    }
  }

  // ส่งข้อความหาเพื่อนทั้งหมด
  async sendToAllFriends(message, totalFriends, options = {}) {
    const { startFrom = 0, limit = 0, sendAll = false } = options;
    
    this.isRunning = true;
    this.shouldStop = false;
    
    // เช็คและเปิด LINE
    await this.ensureLineRunning();

    // ถ้าเลือก sendAll ให้ไปหน้า Friend lists และเช็คจำนวนจริง
    let actualTotalFriends = totalFriends;
    if (sendAll || totalFriends >= 9999) {
      this.log("Detecting actual friends count...", "info");
      
      // ไปหน้า Home ก่อน
      await this.goHome();
      await this.wait(1000);
      
      // ไปหน้า Friend lists เพื่อเช็คจำนวน
      await this.goToFriendsList();
      await this.wait(2000); // รอให้โหลดเสร็จ
      
      // ดึงจำนวนเพื่อนจาก UI
      const detectedCount = this.adb.getFriendsCount();
      this.adb.cleanupUIDump();
      
      if (detectedCount > 0) {
        actualTotalFriends = detectedCount;
        this.log(`Detected ${actualTotalFriends} friends`, "success");
        
        // ส่ง event แจ้งจำนวนเพื่อนจริง
        this.emitStatus({
          type: "friends-detected",
          count: actualTotalFriends,
        });
      } else {
        this.log("Could not detect friends count, please check Friend lists screen", "error");
        this.isRunning = false;
        this.emitStatus({
          type: "error",
          message: "Could not detect friends count",
        });
        return { total: 0, success: 0, failed: 0, error: "Could not detect friends count" };
      }
      
      // กลับไปหน้า Home ก่อนเริ่มส่ง
      this.adb.pressBack();
      await this.wait(1000);
      await this.goHome();
      await this.wait(1000);
      
      // เมื่อเป็น sendAll ให้เริ่มใหม่เสมอ
      this.currentIndex = 0;
      this.sentFriends = [];
      this.failedFriends = [];
      this.clearState();
    } else {
      // ถ้าไม่ใช่ sendAll ให้เช็ค state เดิม
      const savedState = this.loadState();
      if (savedState && savedState.currentIndex > 0 && startFrom === 0) {
        if (savedState.currentIndex < totalFriends) {
          this.currentIndex = savedState.currentIndex;
          this.sentFriends = savedState.sentFriends || [];
          this.failedFriends = savedState.failedFriends || [];
          this.log(`Resuming from friend #${this.currentIndex + 1}`, "info");
        } else {
          this.currentIndex = startFrom;
          this.sentFriends = [];
          this.failedFriends = [];
          this.clearState();
        }
      } else {
        this.currentIndex = startFrom;
        this.sentFriends = [];
        this.failedFriends = [];
      }
    }
    
    this.totalFriends = actualTotalFriends;
    const endIndex = limit > 0 ? Math.min(this.currentIndex + limit, actualTotalFriends) : actualTotalFriends;
    const totalToSend = endIndex - this.currentIndex;

    // เช็คว่ามีอะไรให้ส่งไหม
    if (totalToSend <= 0) {
      this.log("No friends to send to", "warn");
      this.isRunning = false;
      this.emitStatus({
        type: "complete",
        summary: { total: 0, success: 0, failed: 0 },
      });
      return { total: 0, success: 0, failed: 0 };
    }

    this.log(`Starting to send messages to ${totalToSend} friends`, "info");
    this.emitStatus({
      type: "start",
      total: totalToSend,
      current: 0,
    });

    // เก็บค่าเริ่มต้นไว้ เพราะ currentIndex จะเปลี่ยนระหว่าง loop
    const startIndex = this.currentIndex;

    for (let i = startIndex; i < endIndex; i++) {
      // เช็คว่าต้องหยุดไหม
      if (this.shouldStop) {
        this.log("Stopped by user", "warn");
        break;
      }

      // รอถ้า paused
      while (this.isPaused) {
        await this.wait(1000);
      }

      // เช็ค LINE ทุก 5 คน
      if (i % 5 === 0 && i > startIndex) {
        await this.ensureLineRunning();
      }

      const friendNum = i + 1;
      const progress = i - startIndex + 1;
      const percent = Math.round((progress / totalToSend) * 100);

      this.log(`[${progress}/${totalToSend}] (${percent}%) Sending to Friend #${friendNum}...`);

      const result = await this.sendToFriend(i, message);

      if (result.success) {
        this.sentFriends.push({ index: i, friendNum, sentAt: new Date().toISOString() });
        this.log(`✅ Successfully sent to Friend #${friendNum}`, "success");
        // Emit เฉพาะตอนส่งเสร็จ
        this.emitStatus({
          type: "sent",
          current: progress,
          total: totalToSend,
          percent: percent,
          friendNum: friendNum,
          success: true,
        });
      } else {
        this.failedFriends.push({ index: i, friendNum, error: result.error });
        this.log(`❌ Failed to send to Friend #${friendNum}: ${result.error}`, "error");
        this.emitStatus({
          type: "sent",
          current: progress,
          total: totalToSend,
          percent: percent,
          friendNum: friendNum,
          success: false,
          error: result.error,
        });
      }

      // อัพเดท currentIndex และบันทึก state
      this.currentIndex = i + 1;
      this.saveState();

      // รอก่อนส่งคนถัดไป
      if (i < endIndex - 1) {
        await this.wait(this.config.delays.betweenFriends);
      }
    }

    this.isRunning = false;

    const summary = {
      total: totalToSend,
      success: this.sentFriends.length,
      failed: this.failedFriends.length,
      sentFriends: this.sentFriends,
      failedFriends: this.failedFriends,
    };

    this.log(`Completed! Success: ${summary.success}, Failed: ${summary.failed}`, "info");
    
    this.emitStatus({
      type: "complete",
      summary: summary,
    });

    // ถ้าส่งครบแล้ว ลบ state
    if (this.currentIndex >= totalFriends) {
      this.clearState();
    }

    return summary;
  }

  // หยุดชั่วคราว
  pause() {
    this.isPaused = true;
    this.log("Paused", "warn");
    this.emitStatus({ type: "paused" });
  }

  // เล่นต่อ
  resume() {
    this.isPaused = false;
    this.log("Resumed", "info");
    this.emitStatus({ type: "resumed" });
  }

  // หยุดเลย
  stop() {
    this.shouldStop = true;
    this.isPaused = false;
    this.log("Stopping...", "warn");
    this.emitStatus({ type: "stopping" });
  }

  // รีเซ็ตเริ่มใหม่
  reset() {
    this.clearState();
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentIndex = 0;
    this.log("Reset complete", "info");
    this.emitStatus({ type: "reset" });
  }

  // ดึงข้อมูล status ปัจจุบัน
  getStatus() {
    const state = this.loadState();
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentIndex: state?.currentIndex || 0,
      totalFriends: state?.totalFriends || 0,
      sentCount: state?.sentFriends?.length || 0,
      failedCount: state?.failedFriends?.length || 0,
      sentFriends: state?.sentFriends || [],
      failedFriends: state?.failedFriends || [],
      lastUpdated: state?.lastUpdated,
    };
  }
}

module.exports = LineController;