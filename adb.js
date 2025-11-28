/**
 * ADB Controller Module v3.2
 * รองรับ Unicode/Thai/Emoji/URL ผ่าน file + clipper.set + paste
 * แก้ปัญหาข้อความซ้ำโดย paste ทั้งข้อความในครั้งเดียว
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
      
      const devices = [];
      const seenPorts = new Set();
      
      for (const line of lines) {
        const [id] = line.split("\t");
        const deviceId = id.trim();
        
        let port = null;
        if (deviceId.includes(":")) {
          port = deviceId.split(":")[1];
        } else if (deviceId.startsWith("emulator-")) {
          continue;
        }
        
        if (port && seenPorts.has(port)) continue;
        if (port) seenPorts.add(port);
        
        devices.push({ id: deviceId, status: "device", port });
      }
      
      return devices;
    } catch (error) {
      return [];
    }
  }

  static async autoDetectInstances(adbPath) {
    let devices = ADBController.getDevices(adbPath);
    
    if (devices.length === 0) {
      try {
        execSync(`"${adbPath}" connect 127.0.0.1:5555`, { 
          encoding: "utf8", timeout: 2000, stdio: 'pipe'
        });
        await new Promise(resolve => setTimeout(resolve, 300));
        devices = ADBController.getDevices(adbPath);
      } catch (e) {}
    }
    
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

  // ============================================================
  // TEXT INPUT - ใช้ไฟล์ + clipper.set + paste (ทั้งข้อความในครั้งเดียว)
  // ============================================================

  /**
   * เขียนข้อความลงไฟล์บน device แล้วใช้ clipper อ่าน
   * วิธีนี้แก้ปัญหา space และ special characters
   */
  writeTextToDevice(text) {
    // เขียนข้อความเป็น base64 แล้ว decode บน device
    const base64 = Buffer.from(text, 'utf8').toString('base64');
    
    // เขียนลงไฟล์
    const writeResult = this.exec(`shell "echo '${base64}' | base64 -d > /data/local/tmp/msg.txt"`, { timeout: 5000 });
    
    if (!writeResult.success) {
      this.debug(`writeTextToDevice failed: ${writeResult.error}`);
      return { success: false, error: writeResult.error };
    }
    
    return { success: true };
  }

  /**
   * อ่านข้อความจากไฟล์แล้วส่งเข้า clipboard
   */
  setClipboardFromFile() {
    // ใช้ cat อ่านไฟล์แล้วส่งเข้า clipper
    const result = this.exec(`shell "am broadcast -a clipper.set -e text \\"$(cat /data/local/tmp/msg.txt)\\""`, { timeout: 5000 });
    
    if (result.success && result.output.includes("Broadcast completed")) {
      return { success: true, output: result.output };
    }
    
    return { success: false, error: result.error || 'Broadcast failed' };
  }

  /**
   * ส่งข้อความไปยัง clipboard โดยตรง (สำหรับข้อความสั้นๆ ไม่มี space)
   */
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

  /**
   * พิมพ์ข้อความ - รองรับ ไทย/English/Emoji/URL/Newline
   * ใช้วิธีเขียนไฟล์ + clipper + paste (ทั้งข้อความในครั้งเดียว)
   */
  type(text, options = {}) {
    const debug = options.debug || this.debugMode;
    const startTime = Date.now();
    
    if (!text || text.length === 0) {
      return { success: true, method: 'empty', details: 'Empty text' };
    }

    if (debug) console.log(`[TYPE] Input: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" (${text.length} chars)`);

    // วิธีที่ 1: ใช้ไฟล์ (รองรับทุกอย่างรวมถึง space และ newline)
    if (debug) console.log(`[TYPE] Method: File + Clipper (full message)`);
    
    // 1. เขียนข้อความลงไฟล์
    const writeResult = this.writeTextToDevice(text);
    if (!writeResult.success) {
      if (debug) console.log(`[TYPE] ❌ Write to file failed: ${writeResult.error}`);
      return { success: false, method: 'file', error: writeResult.error };
    }
    if (debug) console.log(`[TYPE] ✓ Text written to device file`);
    
    // รอให้ไฟล์เขียนเสร็จ
    this.sleep(100);
    
    // 2. ส่งเข้า clipboard จากไฟล์
    const clipResult = this.setClipboardFromFile();
    if (!clipResult.success) {
      if (debug) console.log(`[TYPE] ❌ Clipboard from file failed: ${clipResult.error}`);
      return { success: false, method: 'file', error: clipResult.error };
    }
    if (debug) console.log(`[TYPE] ✓ Text copied to clipboard`);
    
    // รอให้ clipboard พร้อม
    this.sleep(150);
    
    // 3. Paste
    const pasteResult = this.paste();
    if (!pasteResult.success) {
      if (debug) console.log(`[TYPE] ❌ Paste failed: ${pasteResult.error}`);
      return { success: false, method: 'file', error: pasteResult.error };
    }
    if (debug) console.log(`[TYPE] ✓ Text pasted`);
    
    // รอให้ paste เสร็จสมบูรณ์
    this.sleep(300);
    
    // 4. ลบไฟล์ชั่วคราว
    this.exec("shell rm -f /data/local/tmp/msg.txt");

    const elapsed = Date.now() - startTime;
    if (debug) console.log(`[TYPE] ✓ Complete in ${elapsed}ms`);
    
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

  /**
   * ตรวจสอบว่ามีข้อความในช่อง input หรือไม่
   */
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

  // ============================================================
  // LINE APP CONTROL
  // ============================================================

  /**
   * Force stop LINE app
   */
  forceStopLine(linePackage) {
    this.debug(`Force stopping ${linePackage}`);
    return this.exec(`shell am force-stop ${linePackage}`);
  }

  /**
   * Start LINE app และรอให้เปิดเสร็จ
   */
  startLineAndWait(linePackage, maxWaitMs = 10000) {
    this.debug(`Starting ${linePackage}`);
    
    // เปิด LINE
    this.exec(`shell monkey -p ${linePackage} 1`);
    
    // รอให้ LINE เปิดและมาอยู่ foreground
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

  /**
   * Restart LINE (force stop แล้วเปิดใหม่)
   */
  restartLine(linePackage) {
    this.debug(`Restarting LINE...`);
    
    // 1. Force stop
    this.forceStopLine(linePackage);
    this.sleep(1000);
    
    // 2. Start และรอ
    const result = this.startLineAndWait(linePackage, 10000);
    
    if (result.success) {
      // รอเพิ่มอีกนิดให้ UI โหลดเสร็จ
      this.sleep(2000);
    }
    
    return result;
  }

  isLineForeground(linePackage) {
    const result = this.exec("shell dumpsys window windows");
    if (result.success) {
      const lines = result.output.split('\n');
      for (const line of lines) {
        if (line.includes('mCurrentFocus') || line.includes('mFocusedApp')) {
          if (line.includes(linePackage)) {
            return true;
          }
        }
      }
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
    if (!dumpResult.success) return -1;

    const catResult = this.exec("shell cat /sdcard/ui.xml", { timeout: 10000 });
    if (!catResult.success) return -1;

    const xml = catResult.output;

    const engMatch = xml.match(/text="Friends\s+(\d+)"/i);
    if (engMatch) return parseInt(engMatch[1]);

    const thaiMatch = xml.match(/text="เพื่อน\s*(\d+)"/);
    if (thaiMatch) return parseInt(thaiMatch[1]);

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