/**
 * Multi-Instance Manager
 * จัดการหลาย BlueStacks instances พร้อมกัน
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
        
        // เช็ค clipper service แทน ADBKeyboard
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
            statusText = "Active (Foreground)";
            statusType = "ready";
            break;
          case "background":
            statusText = "Background";
            statusType = "background";
            break;
          case "stopped":
            statusText = "Stopped";
            statusType = "stopped";
            break;
          case "not_installed":
            statusText = "Not Installed";
            statusType = "no-line";
            break;
        }
        
        const info = {
          deviceId: device.id,
          port: device.port,
          model,
          screenSize,
          lineInstalled,
          lineStatus,
          lineStatusText: statusText,
          status: statusType,
          clipperAvailable: clipperCheck.available,
        };
        
        this.instances.set(device.id, {
          adb,
          lineController,
          info,
        });
        
        instanceList.push(info);
        
        const clipperStatus = clipperCheck.available ? "✓ Clipper" : "⚠ No Clipper";
        this.log(`Instance ${device.id}: ${model}, LINE: ${statusText}, ${clipperStatus}`, "info", device.id);
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
      
      let statusText = "Unknown";
      let statusType = "stopped";
      switch (lineStatus) {
        case "foreground":
          statusText = "Active (Foreground)";
          statusType = "ready";
          break;
        case "background":
          statusText = "Background";
          statusType = "background";
          break;
        case "stopped":
          statusText = "Stopped";
          statusType = "stopped";
          break;
        case "not_installed":
          statusText = "Not Installed";
          statusType = "no-line";
          break;
      }
      
      instance.info.lineStatus = lineStatus;
      instance.info.lineStatusText = statusText;
      instance.info.status = statusType;
      list.push(instance.info);
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
    this.log(`Command result: ${result.output || result.error || 'OK'}`, "info", deviceId);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    this.log(`Tapping LINE Home button...`, "info", deviceId);
    instance.adb.tap(this.config.coords.homeX, this.config.coords.homeY);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newStatus = instance.adb.getLineStatus(this.config.linePackage);
    this.log(`LINE status: ${newStatus}`, "info", deviceId);
    
    instance.info.lineStatus = newStatus;
    if (newStatus === "foreground") {
      instance.info.lineStatusText = "Active (Foreground)";
      instance.info.status = "ready";
      this.log(`LINE opened successfully!`, "success", deviceId);
    } else {
      instance.info.lineStatusText = newStatus === "background" ? "Background" : "Stopped";
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

  async sendOnInstance(deviceId, message, totalFriends, options = {}) {
    const instance = this.instances.get(deviceId);
    if (!instance) {
      return { success: false, error: "Instance not found" };
    }

    return await instance.lineController.sendToAllFriends(message, totalFriends, options);
  }

  async sendOnAllInstances(message, friendsPerInstance, options = {}) {
    const { parallel = true, speed = 'fast' } = options;
    
    this.log(`Starting multi-instance send (${parallel ? "parallel" : "sequential"} mode, speed: ${speed})`);
    
    const results = {
      totalInstances: this.instances.size,
      successInstances: 0,
      failedInstances: 0,
      totalMessages: 0,
      successMessages: 0,
      failedMessages: 0,
      instanceResults: [],
    };

    if (this.io) {
      this.io.emit("multi-start", {
        totalInstances: this.instances.size,
        mode: parallel ? "parallel" : "sequential",
        speed,
      });
    }

    if (parallel) {
      const promises = [];
      
      for (const [deviceId, instance] of this.instances) {
        const totalFriends = friendsPerInstance[deviceId] || friendsPerInstance.default || 0;
        if (totalFriends > 0) {
          promises.push(
            instance.lineController.sendToAllFriends(message, totalFriends, { ...options, speed })
              .then(result => ({ deviceId, ...result }))
              .catch(error => ({ deviceId, success: false, error: error.message }))
          );
        }
      }

      const instanceResults = await Promise.all(promises);
      
      for (const result of instanceResults) {
        results.instanceResults.push(result);
        if (result.success !== false) {
          results.successInstances++;
          results.totalMessages += result.total || 0;
          results.successMessages += result.success || 0;
          results.failedMessages += result.failed || 0;
        } else {
          results.failedInstances++;
        }
      }

    } else {
      for (const [deviceId, instance] of this.instances) {
        const totalFriends = friendsPerInstance[deviceId] || friendsPerInstance.default || 0;
        if (totalFriends > 0) {
          try {
            const result = await instance.lineController.sendToAllFriends(message, totalFriends, { ...options, speed });
            results.instanceResults.push({ deviceId, ...result });
            results.successInstances++;
            results.totalMessages += result.total || 0;
            results.successMessages += result.success || 0;
            results.failedMessages += result.failed || 0;
          } catch (error) {
            results.instanceResults.push({ deviceId, success: false, error: error.message });
            results.failedInstances++;
          }
        }
      }
    }

    this.log(`Multi-instance send completed: ${results.successMessages}/${results.totalMessages} messages sent`);
    
    if (this.io) {
      this.io.emit("multi-complete", results);
    }

    return results;
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