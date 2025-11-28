/**
 * Multi-Instance Sender
 * ส่งข้อความจากหลาย BlueStacks instances พร้อมกัน
 */

const config = require("./config");
const BlueStacksManager = require("./bluestacks");
const ADBController = require("./adb");
const LineController = require("./line-controller");

class MultiSender {
  constructor() {
    this.bsManager = new BlueStacksManager();
    this.instances = [];
    this.controllers = [];
  }

  /**
   * Initialize - find all connected instances
   */
  async init() {
    console.log("\n🔍 Scanning for BlueStacks instances...\n");
    
    // Get running instances via ADB
    const running = this.bsManager.getRunningInstances();
    
    if (running.length === 0) {
      console.log("❌ No running BlueStacks instances found");
      console.log("   Please start BlueStacks first\n");
      return false;
    }
    
    console.log(`✅ Found ${running.length} running instance(s):\n`);
    
    // Connect to each instance
    for (const instance of running) {
      const adb = new ADBController(instance.deviceId);
      
      if (adb.isConnected()) {
        const deviceInfo = adb.getDeviceInfo();
        const lineInstalled = adb.isLineInstalled();
        
        console.log(`   📱 ${instance.deviceId}`);
        console.log(`      Android: ${deviceInfo.androidVersion}`);
        console.log(`      LINE: ${lineInstalled ? "✓ Installed" : "✗ Not installed"}`);
        console.log();
        
        if (lineInstalled) {
          const lineController = new LineController(adb);
          await lineController.init();
          
          this.instances.push({
            deviceId: instance.deviceId,
            adb,
            lineController,
            info: deviceInfo,
          });
        }
      }
    }
    
    console.log(`\n📊 ${this.instances.length} instance(s) ready for automation\n`);
    
    return this.instances.length > 0;
  }

  /**
   * Scan friends on all instances
   */
  async scanAllFriends() {
    console.log("\n📋 Scanning friends on all instances...\n");
    
    const results = [];
    
    for (const instance of this.instances) {
      console.log(`\n--- Instance: ${instance.deviceId} ---`);
      
      await instance.lineController.startLine();
      await this.sleep(3000);
      
      const friends = await instance.lineController.scanFriendsList();
      
      results.push({
        deviceId: instance.deviceId,
        friendCount: friends.length,
      });
      
      console.log(`   Found ~${friends.length} friends\n`);
    }
    
    return results;
  }

  /**
   * Send message from all instances simultaneously
   */
  async sendFromAllInstances(message, options = {}) {
    const {
      parallel = true,  // ส่งพร้อมกันทุก instance
      friendLimit = 0,  // 0 = ไม่จำกัด
      onInstanceProgress = null,
    } = options;
    
    console.log("\n📨 Starting multi-instance send...\n");
    console.log(`   Message: "${message}"`);
    console.log(`   Instances: ${this.instances.length}`);
    console.log(`   Mode: ${parallel ? "Parallel" : "Sequential"}`);
    console.log(`   Friend limit: ${friendLimit || "All"}`);
    console.log("\n");
    
    if (parallel) {
      // Send from all instances at the same time
      const promises = this.instances.map((instance, idx) => {
        return this.sendFromInstance(instance, message, {
          friendLimit,
          instanceIndex: idx,
          onProgress: (progress, result) => {
            if (onInstanceProgress) {
              onInstanceProgress(idx, instance.deviceId, progress, result);
            }
          },
        });
      });
      
      const results = await Promise.all(promises);
      return this.summarizeResults(results);
      
    } else {
      // Send one instance at a time
      const results = [];
      
      for (let idx = 0; idx < this.instances.length; idx++) {
        const instance = this.instances[idx];
        console.log(`\n=== Instance ${idx + 1}/${this.instances.length}: ${instance.deviceId} ===\n`);
        
        const result = await this.sendFromInstance(instance, message, {
          friendLimit,
          instanceIndex: idx,
          onProgress: (progress, result) => {
            if (onInstanceProgress) {
              onInstanceProgress(idx, instance.deviceId, progress, result);
            }
          },
        });
        
        results.push(result);
      }
      
      return this.summarizeResults(results);
    }
  }

  /**
   * Send from a single instance
   */
  async sendFromInstance(instance, message, options = {}) {
    const { friendLimit = 0, instanceIndex = 0, onProgress = null } = options;
    
    try {
      // Start LINE
      await instance.lineController.startLine();
      await this.sleep(3000);
      
      // Scan friends if not already done
      if (instance.lineController.friends.length === 0) {
        await instance.lineController.scanFriendsList();
      }
      
      // Send messages
      const sendOptions = {
        startIndex: config.skipFirst,
        count: friendLimit || instance.lineController.friends.length,
        onProgress,
      };
      
      const results = await instance.lineController.sendMessageToFriends(message, sendOptions);
      
      return {
        deviceId: instance.deviceId,
        instanceIndex,
        ...results,
      };
      
    } catch (error) {
      return {
        deviceId: instance.deviceId,
        instanceIndex,
        error: error.message,
        total: 0,
        success: 0,
        failed: 0,
      };
    }
  }

  /**
   * Summarize results from all instances
   */
  summarizeResults(results) {
    const summary = {
      totalInstances: results.length,
      successfulInstances: results.filter(r => !r.error).length,
      totalMessages: 0,
      successMessages: 0,
      failedMessages: 0,
      instanceResults: results,
    };
    
    for (const result of results) {
      summary.totalMessages += result.total || 0;
      summary.successMessages += result.success || 0;
      summary.failedMessages += result.failed || 0;
    }
    
    console.log("\n");
    console.log("╔════════════════════════════════════════╗");
    console.log("║           MULTI-INSTANCE SUMMARY        ║");
    console.log("╠════════════════════════════════════════╣");
    console.log(`║  Instances:  ${summary.successfulInstances}/${summary.totalInstances} successful            ║`);
    console.log(`║  Messages:   ${summary.successMessages}/${summary.totalMessages} sent                  ║`);
    console.log(`║  Failed:     ${summary.failedMessages}                         ║`);
    console.log("╚════════════════════════════════════════╝");
    console.log("\n");
    
    // Per-instance breakdown
    console.log("Instance Details:");
    for (const result of results) {
      const status = result.error ? "❌" : "✅";
      console.log(`  ${status} ${result.deviceId}: ${result.success || 0}/${result.total || 0} sent`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    }
    console.log("\n");
    
    return summary;
  }

  /**
   * Test send on all instances
   */
  async testAllInstances(message) {
    console.log("\n🧪 Running test on all instances...\n");
    
    const results = [];
    
    for (const instance of this.instances) {
      console.log(`Testing: ${instance.deviceId}`);
      
      await instance.lineController.startLine();
      await this.sleep(3000);
      
      const result = await instance.lineController.testSendMessage(message);
      results.push({
        deviceId: instance.deviceId,
        ...result,
      });
      
      console.log(`  Result: ${result.success ? "✅ Success" : "❌ Failed"}\n`);
    }
    
    return results;
  }

  /**
   * Get instance count
   */
  getInstanceCount() {
    return this.instances.length;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MultiSender;