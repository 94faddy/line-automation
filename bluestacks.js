/**
 * BlueStacks Manager Module
 * จัดการ BlueStacks Multi-Instance
 */

const { execSync, exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const ADBController = require("./adb");

class BlueStacksManager {
  constructor() {
    this.installPath = config.bluestacks.installPath;
    this.playerPath = config.bluestacks.playerPath;
    this.multiInstanceManager = config.bluestacks.multiInstanceManager;
    this.instances = [];
  }

  /**
   * Check if BlueStacks is installed
   */
  isInstalled() {
    return fs.existsSync(this.playerPath);
  }

  /**
   * Get BlueStacks instances from config
   */
  getInstances() {
    const configPath = path.join(
      process.env.PROGRAMDATA || "C:\\ProgramData",
      "BlueStacks_nxt",
      "bluestacks.conf"
    );

    const instances = [];

    // ลองอ่านจาก bluestacks.conf
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf8");
        const lines = content.split("\n");
        
        for (const line of lines) {
          // หา instance names
          const match = line.match(/bst\.instance\.(\w+)\.status/);
          if (match) {
            const name = match[1];
            if (!instances.find(i => i.name === name)) {
              instances.push({
                name,
                displayName: name === "Nougat64" ? "BlueStacks (Default)" : name,
              });
            }
          }
        }
      } catch (e) {
        console.error("Error reading BlueStacks config:", e.message);
      }
    }

    // ถ้าไม่เจอ ลองใช้ MultiInstanceManager
    if (instances.length === 0) {
      try {
        // Default instance
        instances.push({
          name: "Nougat64",
          displayName: "BlueStacks (Default)",
        });
      } catch (e) {}
    }

    this.instances = instances;
    return instances;
  }

  /**
   * Get running instances via ADB
   */
  getRunningInstances() {
    const devices = ADBController.getDevices(config.bluestacks.adbPath);
    return devices.map(d => ({
      deviceId: d.id,
      port: d.id.includes(":") ? parseInt(d.id.split(":")[1]) : 5555,
    }));
  }

  /**
   * Start BlueStacks instance
   */
  startInstance(instanceName = "Nougat64") {
    return new Promise((resolve, reject) => {
      try {
        const args = ["--instance", instanceName];
        
        const process = spawn(this.playerPath, args, {
          detached: true,
          stdio: "ignore",
        });
        
        process.unref();
        
        // Wait for instance to start
        setTimeout(() => {
          resolve(true);
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start multiple instances
   */
  async startMultipleInstances(instanceNames) {
    const results = [];
    
    for (const name of instanceNames) {
      try {
        await this.startInstance(name);
        results.push({ name, success: true });
        
        // Wait between starting instances
        await this.sleep(3000);
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Wait for ADB connection
   */
  async waitForADB(port = 5555, timeout = 60000) {
    const startTime = Date.now();
    const adb = new ADBController();
    
    while (Date.now() - startTime < timeout) {
      if (adb.connect(port)) {
        return adb;
      }
      await this.sleep(2000);
    }
    
    return null;
  }

  /**
   * Get ADB port for instance
   */
  getInstancePort(instanceName) {
    // BlueStacks uses different ports for different instances
    // Default: 5555, 5565, 5575, etc.
    const instances = this.getInstances();
    const index = instances.findIndex(i => i.name === instanceName);
    
    if (index === -1) return 5555;
    return 5555 + (index * 10);
  }

  /**
   * Connect to all running instances
   */
  async connectToAllInstances() {
    const running = this.getRunningInstances();
    const controllers = [];
    
    for (const instance of running) {
      const adb = new ADBController(instance.deviceId);
      if (adb.isConnected()) {
        controllers.push({
          deviceId: instance.deviceId,
          port: instance.port,
          adb,
        });
      }
    }
    
    return controllers;
  }

  /**
   * Open Multi Instance Manager
   */
  openMultiInstanceManager() {
    if (fs.existsSync(this.multiInstanceManager)) {
      spawn(this.multiInstanceManager, [], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return true;
    }
    return false;
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BlueStacksManager;