/**
 * ADB Controller Module
 * ควบคุม BlueStacks ผ่าน ADB commands
 */

const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const config = require("./config");

class ADBController {
  constructor(deviceId = null) {
    this.adbPath = config.bluestacks.adbPath;
    this.deviceId = deviceId;
    this.connected = false;
  }

  /**
   * Execute ADB command
   */
  exec(command, options = {}) {
    const deviceArg = this.deviceId ? `-s ${this.deviceId}` : "";
    const fullCommand = `"${this.adbPath}" ${deviceArg} ${command}`;
    
    try {
      const result = execSync(fullCommand, {
        encoding: "utf8",
        timeout: options.timeout || 30000,
        ...options,
      });
      return { success: true, output: result.trim() };
    } catch (error) {
      return { success: false, error: error.message, output: error.stdout || "" };
    }
  }

  /**
   * Execute ADB command async
   */
  execAsync(command) {
    return new Promise((resolve, reject) => {
      const deviceArg = this.deviceId ? `-s ${this.deviceId}` : "";
      const fullCommand = `"${this.adbPath}" ${deviceArg} ${command}`;
      
      exec(fullCommand, { encoding: "utf8", timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: error.message, output: stdout });
        } else {
          resolve({ success: true, output: stdout.trim() });
        }
      });
    });
  }

  /**
   * Get list of connected devices
   */
  static getDevices(adbPath) {
    try {
      const result = execSync(`"${adbPath}" devices`, { encoding: "utf8" });
      const lines = result.split("\n").filter(line => line.includes("\tdevice"));
      
      return lines.map(line => {
        const [id] = line.split("\t");
        return { id: id.trim(), status: "device" };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Connect to BlueStacks instance
   */
  connect(port = 5555) {
    const result = this.exec(`connect 127.0.0.1:${port}`);
    if (result.success && result.output.includes("connected")) {
      this.deviceId = `127.0.0.1:${port}`;
      this.connected = true;
      return true;
    }
    return false;
  }

  /**
   * Check if device is connected
   */
  isConnected() {
    const result = this.exec("get-state");
    return result.success && result.output === "device";
  }

  /**
   * Get device screen resolution
   */
  getScreenSize() {
    const result = this.exec("shell wm size");
    if (result.success) {
      const match = result.output.match(/(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1]), height: parseInt(match[2]) };
      }
    }
    return { width: 1080, height: 1920 }; // default
  }

  /**
   * Tap on screen
   */
  tap(x, y) {
    return this.exec(`shell input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  /**
   * Long press on screen
   */
  longPress(x, y, duration = 1000) {
    return this.exec(`shell input swipe ${x} ${y} ${x} ${y} ${duration}`);
  }

  /**
   * Swipe on screen
   */
  swipe(x1, y1, x2, y2, duration = 300) {
    return this.exec(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
  }

  /**
   * Scroll down
   */
  scrollDown(amount = 500) {
    const screenSize = this.getScreenSize();
    const centerX = screenSize.width / 2;
    const startY = screenSize.height / 2;
    const endY = startY - amount;
    return this.swipe(centerX, startY, centerX, endY, 200);
  }

  /**
   * Scroll up
   */
  scrollUp(amount = 500) {
    const screenSize = this.getScreenSize();
    const centerX = screenSize.width / 2;
    const startY = screenSize.height / 2;
    const endY = startY + amount;
    return this.swipe(centerX, startY, centerX, endY, 200);
  }

  /**
   * Type text
   */
  type(text) {
    // Escape special characters for shell
    const escaped = text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/ /g, "%s")
      .replace(/&/g, "\\&")
      .replace(/</g, "\\<")
      .replace(/>/g, "\\>")
      .replace(/\|/g, "\\|")
      .replace(/;/g, "\\;");
    
    return this.exec(`shell input text "${escaped}"`);
  }

  /**
   * Type text using broadcast (better for Thai/Unicode)
   */
  typeUnicode(text) {
    // Use ADB broadcast for unicode text
    const base64Text = Buffer.from(text).toString("base64");
    return this.exec(`shell am broadcast -a ADB_INPUT_TEXT --es msg "${base64Text}"`);
  }

  /**
   * Input text via clipboard (best for Thai)
   */
  async typeViaClipboard(text) {
    // This requires a helper app on Android
    // Alternative: use input keyevent with character codes
    const result = this.exec(`shell input text "${encodeURIComponent(text)}"`);
    return result;
  }

  /**
   * Press key
   */
  keyEvent(keyCode) {
    return this.exec(`shell input keyevent ${keyCode}`);
  }

  /**
   * Common key events
   */
  pressBack() { return this.keyEvent(4); }
  pressHome() { return this.keyEvent(3); }
  pressEnter() { return this.keyEvent(66); }
  pressDelete() { return this.keyEvent(67); }
  pressTab() { return this.keyEvent(61); }

  /**
   * Take screenshot
   */
  screenshot(localPath) {
    const remotePath = "/sdcard/screenshot.png";
    
    // Capture screenshot
    const captureResult = this.exec(`shell screencap -p ${remotePath}`);
    if (!captureResult.success) return captureResult;
    
    // Pull to local
    const pullResult = this.exec(`pull ${remotePath} "${localPath}"`);
    
    // Clean up
    this.exec(`shell rm ${remotePath}`);
    
    return pullResult;
  }

  /**
   * Get screenshot as buffer
   */
  async screenshotBuffer() {
    const tempPath = path.join(process.cwd(), `temp_screenshot_${Date.now()}.png`);
    const result = this.screenshot(tempPath);
    
    if (result.success && fs.existsSync(tempPath)) {
      const buffer = fs.readFileSync(tempPath);
      fs.unlinkSync(tempPath);
      return buffer;
    }
    return null;
  }

  /**
   * Start an app
   */
  startApp(packageName, activityName = null) {
    if (activityName) {
      return this.exec(`shell am start -n ${packageName}/${activityName}`);
    }
    return this.exec(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
  }

  /**
   * Stop an app
   */
  stopApp(packageName) {
    return this.exec(`shell am force-stop ${packageName}`);
  }

  /**
   * Check if app is running
   */
  isAppRunning(packageName) {
    const result = this.exec(`shell pidof ${packageName}`);
    return result.success && result.output.length > 0;
  }

  /**
   * Get current activity
   */
  getCurrentActivity() {
    const result = this.exec("shell dumpsys activity activities | grep mResumedActivity");
    return result;
  }

  /**
   * Wait for element (by taking screenshots and comparing)
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear app data
   */
  clearAppData(packageName) {
    return this.exec(`shell pm clear ${packageName}`);
  }

  /**
   * Install APK
   */
  installApk(apkPath) {
    return this.exec(`install "${apkPath}"`);
  }

  /**
   * Get device info
   */
  getDeviceInfo() {
    const model = this.exec("shell getprop ro.product.model");
    const android = this.exec("shell getprop ro.build.version.release");
    const sdk = this.exec("shell getprop ro.build.version.sdk");
    
    return {
      model: model.output,
      androidVersion: android.output,
      sdkVersion: sdk.output,
      deviceId: this.deviceId,
    };
  }

  /**
   * List installed packages
   */
  listPackages(filter = "") {
    const result = this.exec(`shell pm list packages ${filter}`);
    if (result.success) {
      return result.output.split("\n").map(line => line.replace("package:", "").trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Check if LINE is installed
   */
  isLineInstalled() {
    const packages = this.listPackages(config.linePackage);
    return packages.includes(config.linePackage);
  }
}

module.exports = ADBController;