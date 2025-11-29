/**
 * ADB Controller Module v4.0
 * - เรียงลำดับ instances ตาม port (5555 = #1, 5565 = #2, ...)
 * - Auto-detect เร็ว (timeout 500ms, parallel connect)
 * - กรอง duplicate instances
 */

const { execSync } = require("child_process");

class ADBController {
  constructor(adbPath, deviceId = null) {
    this.adbPath = adbPath;
    this.deviceId = deviceId;
    this.debugMode = false;
  }

  setDebug(enabled) {
    this.debugMode = enabled;
  }

  debug(msg) {
    if (this.debugMode) {
      console.log(`[ADB DEBUG] ${msg}`);
    }
  }

  exec(command, options = {}) {
    const deviceArg = this.deviceId ? `-s ${this.deviceId}` : "";
    const fullCommand = `"${this.adbPath}" ${deviceArg} ${command}`;
    
    this.debug(`exec: ${command}`);
    
    try {
      const result = execSync(fullCommand, {
        encoding: "utf8",
        timeout: options.timeout || 15000,
        stdio: 'pipe',
        ...options,
      });
      this.debug(`result: ${result.trim().substring(0, 100)}`);
      return { success: true, output: result.trim() };
    } catch (error) {
      this.debug(`error: ${error.message}`);
      return { success: false, error: error.message, output: error.stdout || "" };
    }
  }

  static getDevices(adbPath) {
    try {
      const result = execSync(`"${adbPath}" devices`, { encoding: "utf8" });
      const lines = result.split("\n").filter(line => line.includes("\tdevice"));
      
      const deviceMap = new Map();
      
      for (const line of lines) {
        const [id] = line.split("\t");
        const deviceId = id.trim();
        
        let port = null;
        let isIpFormat = false;
        
        if (deviceId.includes(":")) {
          port = deviceId.split(":")[1];
          isIpFormat = true;
        } else if (deviceId.startsWith("emulator-")) {
          const emulatorPort = parseInt(deviceId.replace("emulator-", ""));
          port = String(emulatorPort + 1);
          isIpFormat = false;
        }
        
        if (port) {
          if (deviceMap.has(port)) {
            if (isIpFormat) {
              deviceMap.set(port, { id: deviceId, port: parseInt(port), isIpFormat });
            }
          } else {
            deviceMap.set(port, { id: deviceId, port: parseInt(port), isIpFormat });
          }
        }
      }
      
      const devices = Array.from(deviceMap.values())
        .sort((a, b) => a.port - b.port)
        .map(d => ({
          id: d.id,
          status: "device",
          port: String(d.port)
        }));
      
      console.log(`[ADB] Found ${devices.length} device(s):`, devices.map(d => `${d.id}`).join(", "));
      return devices;
    } catch (error) {
      console.log(`[ADB] Error getting devices: ${error.message}`);
      return [];
    }
  }

  static async autoDetectInstances(adbPath) {
    console.log("[ADB] Auto-detecting BlueStacks instances...");
    
    const possiblePorts = [5555, 5565, 5575, 5585];
    
    const connectPromises = possiblePorts.map(port => {
      return new Promise(resolve => {
        try {
          execSync(`"${adbPath}" connect 127.0.0.1:${port}`, { 
            encoding: "utf8", 
            timeout: 500,
            stdio: 'pipe'
          });
        } catch (e) {}
        resolve();
      });
    });
    
    await Promise.all(connectPromises);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const devices = ADBController.getDevices(adbPath);
    console.log(`[ADB] Total: ${devices.length} instance(s)`);
    return devices;
  }

  isConnected() {
    const result = this.exec("get-state");
    return result.success && result.output === "device";
  }

  getScreenSize() {
    const result = this.exec("shell wm size");
    if (result.success) {
      const match = result.output.match(/(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1]), height: parseInt(match[2]) };
      }
    }
    return { width: 1080, height: 1920 };
  }

  tap(x, y) {
    return this.exec(`shell input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  swipe(x1, y1, x2, y2, duration = 300) {
    return this.exec(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
  }

  pressBack() {
    return this.exec("shell input keyevent 4");
  }

  pressHome() {
    return this.exec("shell input keyevent 3");
  }

  pressSpace() {
    return this.exec("shell input keyevent 62");
  }

  pressBackspace() {
    return this.exec("shell input keyevent 67");
  }

  pressPaste() {
    return this.exec("shell input keyevent 279");
  }

  writeTextToDevice(text) {
    const base64 = Buffer.from(text, 'utf8').toString('base64');
    const writeResult = this.exec(`shell "echo '${base64}' | base64 -d > /data/local/tmp/msg.txt"`, { timeout: 5000 });
    
    if (!writeResult.success) {
      this.debug(`writeTextToDevice failed: ${writeResult.error}`);
      return { success: false, error: writeResult.error };
    }
    
    return { success: true };
  }

  setClipboardFromFile() {
    const result = this.exec(`shell "am broadcast -a clipper.set -e text \\"$(cat /data/local/tmp/msg.txt)\\""`, { timeout: 5000 });
    
    if (result.success && result.output.includes("Broadcast completed")) {
      return { success: true, output: result.output };
    }
    
    return { success: false, error: result.error || 'Broadcast failed' };
  }

  setClipboard(text) {
    this.debug(`setClipboard: "${text}"`);
    const result = this.exec(`shell am broadcast -a clipper.set -e text "${text}"`);
    
    if (result.success && result.output.includes("Broadcast completed")) {
      return { success: true, output: result.output };
    }
    
    return result;
  }

  paste() {
    return this.exec("shell input keyevent 279");
  }

  type(text, options = {}) {
    const debug = options.debug || this.debugMode;
    const startTime = Date.now();
    
    if (!text || text.length === 0) {
      return { success: true, method: 'empty', details: 'Empty text' };
    }

    if (debug) console.log(`[TYPE] Input: "${text.substring(0, 50)}..." (${text.length} chars)`);
    
    const writeResult = this.writeTextToDevice(text);
    if (!writeResult.success) {
      return { success: false, method: 'file', error: writeResult.error };
    }
    
    this.sleep(100);
    
    const clipResult = this.setClipboardFromFile();
    if (!clipResult.success) {
      return { success: false, method: 'file', error: clipResult.error };
    }
    
    this.sleep(150);
    
    const pasteResult = this.paste();
    if (!pasteResult.success) {
      return { success: false, method: 'file', error: pasteResult.error };
    }
    
    this.sleep(300);
    this.exec("shell rm -f /data/local/tmp/msg.txt");

    const elapsed = Date.now() - startTime;
    
    return {
      success: true,
      method: 'file-clipper-paste',
      textLength: text.length,
      elapsed: elapsed
    };
  }

  typeWithDebug(text) {
    return this.type(text, { debug: true });
  }

  sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }

  checkInputHasText() {
    const dumpResult = this.exec("shell uiautomator dump /sdcard/ui_check.xml", { timeout: 5000 });
    if (!dumpResult.success) {
      return { success: false, error: 'Failed to dump UI' };
    }

    const catResult = this.exec("shell cat /sdcard/ui_check.xml", { timeout: 5000 });
    this.exec("shell rm -f /sdcard/ui_check.xml");
    
    if (!catResult.success) {
      return { success: false, error: 'Failed to read UI dump' };
    }

    const xml = catResult.output;
    const editTextMatch = xml.match(/class="android\.widget\.EditText"[^>]*text="([^"]*)"/);
    
    if (editTextMatch) {
      const text = editTextMatch[1];
      return { 
        success: true, 
        hasText: text.length > 0, 
        text: text,
        length: text.length 
      };
    }

    return { success: true, hasText: false, text: '', note: 'No EditText found' };
  }

  forceStopLine(linePackage) {
    this.debug(`Force stopping ${linePackage}`);
    return this.exec(`shell am force-stop ${linePackage}`);
  }

  startLineAndWait(linePackage, maxWaitMs = 10000) {
    this.debug(`Starting ${linePackage}`);
    
    this.exec(`shell monkey -p ${linePackage} 1`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      this.sleep(500);
      if (this.isLineForeground(linePackage)) {
        this.debug(`LINE is now in foreground`);
        return { success: true, waitTime: Date.now() - startTime };
      }
    }
    
    return { success: false, error: 'Timeout waiting for LINE to start' };
  }

  restartLine(linePackage) {
    this.debug(`Restarting LINE...`);
    
    this.forceStopLine(linePackage);
    this.sleep(1000);
    
    const result = this.startLineAndWait(linePackage, 10000);
    
    if (result.success) {
      this.sleep(2000);
    }
    
    return result;
  }

  isLineForeground(linePackage) {
    // วิธีที่ 1: ตรวจสอบ visible window
    const result = this.exec("shell dumpsys window windows");
    if (result.success) {
      const lines = result.output.split('\n');
      for (const line of lines) {
        // ตรวจสอบหลาย field ไม่ใช่แค่ mCurrentFocus
        if (line.includes('mCurrentFocus') || 
            line.includes('mFocusedApp') || 
            line.includes('mTopFullscreenOpaqueWindowState') ||
            line.includes('mTopFullscreenOpaqueOrDimmingWindowState')) {
          if (line.includes(linePackage)) {
            return true;
          }
        }
      }
    }
    
    // วิธีที่ 2: ตรวจสอบ resumed activity
    const actResult = this.exec("shell dumpsys activity activities | grep mResumedActivity");
    if (actResult.success && actResult.output.includes(linePackage)) {
      return true;
    }
    
    return false;
  }

  isLineRunning(linePackage) {
    const result = this.exec(`shell pidof ${linePackage}`);
    return result.success && result.output.length > 0;
  }

  getLineStatus(linePackage) {
    if (!this.isLineInstalled(linePackage)) return "not_installed";
    if (this.isLineForeground(linePackage)) return "foreground";
    if (this.isLineRunning(linePackage)) return "background";
    return "stopped";
  }

  startLine(linePackage) {
    return this.exec(`shell monkey -p ${linePackage} 1`);
  }

  stopLine(linePackage) {
    return this.exec(`shell am force-stop ${linePackage}`);
  }

  isLineInstalled(linePackage) {
    const result = this.exec(`shell pm list packages ${linePackage}`);
    return result.success && result.output.includes(linePackage);
  }

  screenshot(localPath) {
    const remotePath = "/sdcard/screenshot.png";
    const captureResult = this.exec(`shell screencap -p ${remotePath}`);
    if (!captureResult.success) return captureResult;
    
    const pullResult = this.exec(`pull ${remotePath} "${localPath}"`);
    this.exec(`shell rm ${remotePath}`);
    return pullResult;
  }

  getDeviceModel() {
    const result = this.exec("shell getprop ro.product.model", { timeout: 3000 });
    return result.success ? result.output : "Unknown";
  }

  getFriendsCount() {
    const dumpResult = this.exec("shell uiautomator dump /sdcard/ui.xml", { timeout: 10000 });
    if (!dumpResult.success) {
      console.log("[getFriendsCount] dump failed:", dumpResult.error);
      return -1;
    }

    const catResult = this.exec("shell cat /sdcard/ui.xml", { timeout: 10000 });
    if (!catResult.success) {
      console.log("[getFriendsCount] cat failed:", catResult.error);
      return -1;
    }

    const xml = catResult.output;

    const engMatch = xml.match(/text="Friends\s+(\d+)"/i);
    if (engMatch) {
      return parseInt(engMatch[1]);
    }

    const thaiMatch = xml.match(/text="เพื่อน\s*(\d+)"/);
    if (thaiMatch) {
      return parseInt(thaiMatch[1]);
    }

    const rowMatch = xml.match(/home_row_title_name"[^>]*text="[A-Za-z\u0E00-\u0E7F]+\s*(\d+)"/);
    if (rowMatch) {
      return parseInt(rowMatch[1]);
    }

    console.log("[getFriendsCount] No pattern matched");
    return -1;
  }

  cleanupUIDump() {
    this.exec("shell rm -f /sdcard/ui.xml");
    this.exec("shell rm -f /sdcard/ui_check.xml");
  }

  checkClipperService() {
    const result = this.exec('shell am broadcast -a clipper.get');
    return {
      available: result.success && result.output.includes('Broadcast completed'),
      output: result.output
    };
  }
}

module.exports = ADBController;