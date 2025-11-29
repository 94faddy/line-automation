/**
 * Multi-Instance Manager v4.0
 * - รองรับการเลือก instance ที่ต้องการส่ง
 * - Progress tracking แยกแต่ละ instance
 * - State file แยกแต่ละ instance
 */

const fs = require("fs");
const path = require("path");
const ADBController = require("./adb");
const LineController = require("./line-controller");

class MultiInstanceManager {
  constructor(config, io = null) {
    this.config = config;
    this.io = io;
    this.instances = new Map();
    this.stateFile = path.join(__dirname, "data", "multi-state.json");
  }

  log(message, type = "info", deviceId = null) {
    const timestamp = new Date().toISOString();
    const prefix = deviceId ? `[${deviceId}]` : "[MULTI]";
    console.log(`[${timestamp}] ${prefix} [${type.toUpperCase()}] ${message}`);
    
    if (this.io) {
      this.io.emit("log", { timestamp, type, message: `${prefix} ${message}`, deviceId });
    }
  }

  async autoDetect() {
    this.log("Auto-detecting BlueStacks instances...");
    
    const devices = await ADBController.autoDetectInstances(this.config.adbPath);
    
    if (devices.length === 0) {
      this.log("No BlueStacks instances found", "warn");
      return [];
    }

    this.log(`Found ${devices.length} instance(s)`);
    
    const instanceList = [];
    
    for (const device of devices) {
      const adb = new ADBController(this.config.adbPath, device.id);
      
      if (adb.isConnected()) {
        const screenSize = adb.getScreenSize();
        const lineInstalled = adb.isLineInstalled(this.config.linePackage);
        const lineStatus = adb.getLineStatus(this.config.linePackage);
        const model = adb.getDeviceModel();
        const clipperCheck = adb.checkClipperService();
        
        const instanceConfig = {
          ...this.config,
          deviceId: device.id,
        };
        
        const lineController = new LineController(instanceConfig, this.io);
        lineController.instanceId = device.id;
        
        let statusText = "Unknown";
        let statusType = "stopped";
        switch (lineStatus) {
          case "foreground":
            statusText = "LINE เปิดอยู่";
            statusType = "ready";
            break;
          case "background":
            statusText = "LINE อยู่เบื้องหลัง";
            statusType = "background";
            break;
          case "stopped":
            statusText = "LINE ปิดอยู่";
            statusType = "stopped";
            break;
          case "not_installed":
            statusText = "ไม่ได้ติดตั้ง LINE";
            statusType = "no-line";
            break;
        }
        
        // ดึง saved state ของ instance นี้
        const savedState = lineController.getSavedStateInfo();
        
        const info = {
          deviceId: device.id,
          port: device.port,
          model,
          screenSize,
          lineInstalled,
          lineStatus,
          lineStatusText: statusText,
          statusType: statusType, // สำหรับแสดง badge
          status: "device", // สำหรับตรวจสอบ (ถ้า detect ได้ = device)
          clipperAvailable: clipperCheck.available,
          savedState: savedState,
          isRunning: lineController.isRunning,
          isPaused: lineController.isPaused,
        };
        
        this.instances.set(device.id, {
          adb,
          lineController,
          info,
        });
        
        instanceList.push(info);
        
        const clipperStatus = clipperCheck.available ? "✓ Clipper" : "⚠ No Clipper";
        const stateInfo = savedState ? ` (${savedState.currentIndex}/${savedState.totalFriends} sent)` : "";
        this.log(`Instance ${device.id}: ${model}, LINE: ${statusText}, ${clipperStatus}${stateInfo}`, "info", device.id);
      }
    }

    if (this.io) {
      this.io.emit("instances", instanceList);
    }

    return instanceList;
  }

  getInstancesInfo() {
    const list = [];
    for (const [deviceId, instance] of this.instances) {
      const lineStatus = instance.adb.getLineStatus(this.config.linePackage);
      const isConnected = instance.adb.isConnected();
      
      let statusText = "Unknown";
      let statusType = "stopped";
      switch (lineStatus) {
        case "foreground":
          statusText = "LINE เปิดอยู่";
          statusType = "ready";
          break;
        case "background":
          statusText = "LINE อยู่เบื้องหลัง";
          statusType = "background";
          break;
        case "stopped":
          statusText = "LINE ปิดอยู่";
          statusType = "stopped";
          break;
        case "not_installed":
          statusText = "ไม่ได้ติดตั้ง LINE";
          statusType = "no-line";
          break;
      }
      
      // ดึง saved state
      const savedState = instance.lineController.getSavedStateInfo();
      
      instance.info.lineStatus = lineStatus;
      instance.info.lineStatusText = statusText;
      instance.info.statusType = statusType; // สำหรับแสดง badge
      instance.info.status = isConnected ? "device" : "offline"; // สำหรับตรวจสอบ
      instance.info.savedState = savedState;
      instance.info.isRunning = instance.lineController.isRunning;
      instance.info.isPaused = instance.lineController.isPaused;
      
      list.push(instance.info);
    }
    return list;
  }

  // สำหรับ auto-refresh status เบาๆ (ไม่โหลด savedState ใหม่)
  getInstancesStatus() {
    const list = [];
    for (const [deviceId, instance] of this.instances) {
      const lineStatus = instance.adb.getLineStatus(this.config.linePackage);
      const clipperCheck = instance.adb.checkClipperService();
      
      // คำนวณ statusType จาก lineStatus
      let statusType = "stopped";
      switch (lineStatus) {
        case "foreground": statusType = "ready"; break;
        case "background": statusType = "background"; break;
        case "stopped": statusType = "stopped"; break;
        case "not_installed": statusType = "no-line"; break;
      }
      
      list.push({
        deviceId: deviceId,
        lineStatus: lineStatus,
        statusType: statusType,
        status: instance.adb.isConnected() ? "device" : "offline",
        clipperAvailable: clipperCheck.available,
        isRunning: instance.lineController.isRunning,
        isPaused: instance.lineController.isPaused
      });
    }
    return list;
  }

  getInstance(deviceId) {
    return this.instances.get(deviceId);
  }

  async startLineOnInstance(deviceId) {
    const instance = this.instances.get(deviceId);
    if (!instance) {
      return { success: false, error: "Instance not found" };
    }

    this.log(`Opening LINE app...`, "info", deviceId);
    
    const result = instance.adb.exec(`shell monkey -p ${this.config.linePackage} 1`);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    instance.adb.tap(this.config.coords.homeX, this.config.coords.homeY);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newStatus = instance.adb.getLineStatus(this.config.linePackage);
    
    instance.info.lineStatus = newStatus;
    if (newStatus === "foreground") {
      instance.info.lineStatusText = "LINE เปิดอยู่";
      instance.info.status = "ready";
      this.log(`LINE opened successfully!`, "success", deviceId);
    } else {
      instance.info.lineStatusText = newStatus === "background" ? "LINE อยู่เบื้องหลัง" : "LINE ปิดอยู่";
      instance.info.status = newStatus === "background" ? "background" : "stopped";
    }
    
    if (this.io) {
      this.io.emit("instance-updated", instance.info);
    }
    
    return { success: true, status: newStatus };
  }

  async startLineOnAll() {
    const results = [];
    for (const [deviceId] of this.instances) {
      const result = await this.startLineOnInstance(deviceId);
      results.push({ deviceId, ...result });
    }
    return results;
  }

  /**
   * ส่งข้อความไปยัง instances ที่เลือก
   * @param {string} message - ข้อความที่จะส่ง
   * @param {Object} selectedInstances - { deviceId: { enabled: true, friendCount: 9999 }, ... }
   * @param {Object} options - { parallel, sendAll, speed }
   */
  async sendOnSelectedInstances(message, selectedInstances, options = {}) {
    const { parallel = true, sendAll = false, speed = 'fast' } = options;
    
    // กรองเฉพาะ instance ที่เลือก
    const enabledInstances = Object.entries(selectedInstances)
      .filter(([deviceId, config]) => config.enabled && this.instances.has(deviceId))
      .map(([deviceId, config]) => ({
        deviceId,
        friendCount: sendAll ? 9999 : (config.friendCount || 0)
      }));
    
    if (enabledInstances.length === 0) {
      this.log("No instances selected", "warn");
      return { success: false, error: "No instances selected" };
    }
    
    this.log(`Starting send on ${enabledInstances.length} instance(s) (${parallel ? "parallel" : "sequential"} mode, speed: ${speed})`);
    
    const results = {
      totalInstances: enabledInstances.length,
      successInstances: 0,
      failedInstances: 0,
      instanceResults: [],
    };

    if (this.io) {
      this.io.emit("multi-start", {
        totalInstances: enabledInstances.length,
        instances: enabledInstances.map(i => i.deviceId),
        mode: parallel ? "parallel" : "sequential",
        speed,
      });
    }

    if (parallel) {
      const promises = enabledInstances.map(({ deviceId, friendCount }) => {
        const instance = this.instances.get(deviceId);
        if (!instance || friendCount <= 0) {
          return Promise.resolve({ deviceId, success: false, error: "Invalid config" });
        }
        
        return instance.lineController.sendToAllFriends(message, friendCount, { 
          sendAll: friendCount >= 9999, 
          speed 
        })
          .then(result => ({ deviceId, ...result }))
          .catch(error => ({ deviceId, success: false, error: error.message }));
      });

      const instanceResults = await Promise.all(promises);
      
      for (const result of instanceResults) {
        results.instanceResults.push(result);
        if (result.error) {
          results.failedInstances++;
        } else {
          results.successInstances++;
        }
      }

    } else {
      for (const { deviceId, friendCount } of enabledInstances) {
        const instance = this.instances.get(deviceId);
        if (!instance || friendCount <= 0) {
          results.instanceResults.push({ deviceId, success: false, error: "Invalid config" });
          results.failedInstances++;
          continue;
        }
        
        try {
          const result = await instance.lineController.sendToAllFriends(message, friendCount, { 
            sendAll: friendCount >= 9999, 
            speed 
          });
          results.instanceResults.push({ deviceId, ...result });
          results.successInstances++;
        } catch (error) {
          results.instanceResults.push({ deviceId, success: false, error: error.message });
          results.failedInstances++;
        }
      }
    }

    this.log(`Multi-instance send completed: ${results.successInstances}/${results.totalInstances} instances`);
    
    if (this.io) {
      this.io.emit("multi-complete", results);
    }

    return results;
  }

  // Legacy method for backward compatibility
  async sendOnAllInstances(message, friendsPerInstance, options = {}) {
    const { parallel = true, sendAll = false, speed = 'fast' } = options;
    
    // แปลง friendsPerInstance เป็น selectedInstances format
    const selectedInstances = {};
    for (const [deviceId] of this.instances) {
      const friendCount = friendsPerInstance[deviceId] || friendsPerInstance.default || 0;
      if (friendCount > 0) {
        selectedInstances[deviceId] = { enabled: true, friendCount };
      }
    }
    
    return this.sendOnSelectedInstances(message, selectedInstances, { parallel, sendAll, speed });
  }

  pauseInstance(deviceId) {
    const instance = this.instances.get(deviceId);
    if (instance) {
      instance.lineController.pause();
      return { success: true };
    }
    return { success: false, error: "Instance not found" };
  }

  resumeInstance(deviceId) {
    const instance = this.instances.get(deviceId);
    if (instance) {
      instance.lineController.resume();
      return { success: true };
    }
    return { success: false, error: "Instance not found" };
  }

  stopInstance(deviceId) {
    const instance = this.instances.get(deviceId);
    if (instance) {
      instance.lineController.stop();
      return { success: true };
    }
    return { success: false, error: "Instance not found" };
  }

  resetInstance(deviceId) {
    const instance = this.instances.get(deviceId);
    if (instance) {
      instance.lineController.reset();
      return { success: true };
    }
    return { success: false, error: "Instance not found" };
  }

  pauseAll() {
    for (const [deviceId, instance] of this.instances) {
      instance.lineController.pause();
    }
    this.log("All instances paused");
  }

  resumeAll() {
    for (const [deviceId, instance] of this.instances) {
      instance.lineController.resume();
    }
    this.log("All instances resumed");
  }

  stopAll() {
    for (const [deviceId, instance] of this.instances) {
      instance.lineController.stop();
    }
    this.log("All instances stopped");
  }

  resetAll() {
    for (const [deviceId, instance] of this.instances) {
      instance.lineController.reset();
    }
    this.log("All instances reset");
  }

  getCombinedStatus() {
    const statuses = [];
    let totalSent = 0;
    let totalFailed = 0;
    let isAnyRunning = false;
    let isAnyPaused = false;

    for (const [deviceId, instance] of this.instances) {
      const status = instance.lineController.getStatus();
      statuses.push({
        deviceId,
        ...status,
        lineRunning: instance.adb.isLineRunning(this.config.linePackage),
      });
      totalSent += status.sentCount || 0;
      totalFailed += status.failedCount || 0;
      if (status.isRunning) isAnyRunning = true;
      if (status.isPaused) isAnyPaused = true;
    }

    return {
      instances: statuses,
      totalInstances: this.instances.size,
      totalSent,
      totalFailed,
      isAnyRunning,
      isAnyPaused,
    };
  }

  getInstanceStatus(deviceId) {
    const instance = this.instances.get(deviceId);
    if (!instance) {
      return null;
    }
    return instance.lineController.getStatus();
  }

  saveState() {
    const state = {
      lastUpdated: new Date().toISOString(),
      instances: {},
    };

    for (const [deviceId, instance] of this.instances) {
      state.instances[deviceId] = instance.lineController.getStatus();
    }

    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

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
      this.log(`Error loading multi-state: ${e.message}`, "error");
    }
    return null;
  }
}

module.exports = MultiInstanceManager;