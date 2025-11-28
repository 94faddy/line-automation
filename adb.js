/**
 * ADB Controller Module
 */

const { execSync } = require("child_process");

class ADBController {
  constructor(adbPath, deviceId = null) {
    this.adbPath = adbPath;
    this.deviceId = deviceId;
  }

  exec(command, options = {}) {
    const deviceArg = this.deviceId ? `-s ${this.deviceId}` : "";
    const fullCommand = `"${this.adbPath}" ${deviceArg} ${command}`;
    
    try {
      const result = execSync(fullCommand, {
        encoding: "utf8",
        timeout: options.timeout || 10000,
        stdio: 'pipe',
        ...options,
      });
      return { success: true, output: result.trim() };
    } catch (error) {
      return { success: false, error: error.message, output: error.stdout || "" };
    }
  }

  /**
   * Auto-detect ทุก BlueStacks instances ที่เปิดอยู่
   * กรอง duplicate devices ออก
   */
  static getDevices(adbPath) {
    try {
      const result = execSync(`"${adbPath}" devices`, { encoding: "utf8" });
      const lines = result.split("\n").filter(line => line.includes("\tdevice"));
      
      const devices = [];
      const seenPorts = new Set();
      
      for (const line of lines) {
        const [id] = line.split("\t");
        const deviceId = id.trim();
        
        // ดึง port จาก device ID
        let port = null;
        if (deviceId.includes(":")) {
          // Format: 127.0.0.1:5555
          port = deviceId.split(":")[1];
        } else if (deviceId.startsWith("emulator-")) {
          // Format: emulator-5554 → port จริงคือ 5555 (5554 + 1 สำหรับ adb)
          port = deviceId.replace("emulator-", "");
        }
        
        // ข้าม emulator-xxxx ถ้ามี 127.0.0.1:xxxx แล้ว (เป็น device เดียวกัน)
        if (deviceId.startsWith("emulator-")) {
          // Skip emulator format, prefer IP format
          continue;
        }
        
        // เช็ค duplicate port
        if (port && seenPorts.has(port)) {
          continue;
        }
        
        if (port) {
          seenPorts.add(port);
        }
        
        devices.push({ id: deviceId, status: "device", port });
      }
      
      return devices;
    } catch (error) {
      return [];
    }
  }

  /**
   * Auto-detect และ connect ทุก instances
   * แบบเร็ว - ใช้ devices ที่ connect อยู่แล้ว
   */
  static async autoDetectInstances(adbPath) {
    // ดึงรายการ devices ที่ connect อยู่แล้วก่อน (เร็ว)
    let devices = ADBController.getDevices(adbPath);
    
    // ถ้าไม่เจอ ค่อยลอง connect port 5555 (default)
    if (devices.length === 0) {
      try {
        execSync(`"${adbPath}" connect 127.0.0.1:5555`, { 
          encoding: "utf8",
          timeout: 2000,
          stdio: 'pipe'
        });
        await new Promise(resolve => setTimeout(resolve, 300));
        devices = ADBController.getDevices(adbPath);
      } catch (e) {
        // Ignore
      }
    }
    
    return devices;
  }

  /**
   * Scan หา instances ใหม่ (ช้ากว่า แต่ครบ)
   */
  static async scanAllInstances(adbPath) {
    const commonPorts = [5555, 5565, 5575, 5585, 5595];
    
    // Connect แบบ parallel ให้เร็วขึ้น
    await Promise.all(commonPorts.map(port => {
      return new Promise(resolve => {
        try {
          execSync(`"${adbPath}" connect 127.0.0.1:${port}`, { 
            encoding: "utf8",
            timeout: 1500,
            stdio: 'pipe'
          });
        } catch (e) {}
        resolve();
      });
    }));
    
    await new Promise(resolve => setTimeout(resolve, 300));
    return ADBController.getDevices(adbPath);
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

  type(text) {
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

  pressBack() {
    return this.exec("shell input keyevent 4");
  }

  pressHome() {
    return this.exec("shell input keyevent 3");
  }

  /**
   * เช็คว่า LINE app กำลังแสดงอยู่บนหน้าจอไหม (Foreground)
   * ไม่ใช่แค่ process running
   */
  isLineForeground(linePackage) {
    // เช็คจาก mCurrentFocus (วิธีที่แม่นยำที่สุด)
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

  /**
   * เช็คว่า LINE process กำลังทำงานอยู่ไหม (Background หรือ Foreground)
   */
  isLineRunning(linePackage) {
    const result = this.exec(`shell pidof ${linePackage}`);
    return result.success && result.output.length > 0;
  }

  /**
   * เช็คสถานะ LINE แบบละเอียด
   * @returns {string} "foreground" | "background" | "stopped" | "not_installed"
   */
  getLineStatus(linePackage) {
    // เช็คว่าติดตั้งไหม
    if (!this.isLineInstalled(linePackage)) {
      return "not_installed";
    }
    
    // เช็คว่าเปิดอยู่บน foreground ไหม
    if (this.isLineForeground(linePackage)) {
      return "foreground";
    }
    
    // เช็คว่า process running อยู่ไหม (background)
    if (this.isLineRunning(linePackage)) {
      return "background";
    }
    
    return "stopped";
  }

  // เปิด LINE App ด้วย monkey
  startLine(linePackage) {
    // ใช้ monkey -p package 1 (วิธีที่ทดสอบแล้วใช้งานได้)
    return this.exec(`shell monkey -p ${linePackage} 1`);
  }

  // ปิด LINE App
  stopLine(linePackage) {
    return this.exec(`shell am force-stop ${linePackage}`);
  }

  // เช็คว่า LINE ติดตั้งอยู่ไหม
  isLineInstalled(linePackage) {
    const result = this.exec(`shell pm list packages ${linePackage}`);
    return result.success && result.output.includes(linePackage);
  }

  // ถ่าย screenshot
  screenshot(localPath) {
    const remotePath = "/sdcard/screenshot.png";
    const captureResult = this.exec(`shell screencap -p ${remotePath}`);
    if (!captureResult.success) return captureResult;
    
    const pullResult = this.exec(`pull ${remotePath} "${localPath}"`);
    this.exec(`shell rm ${remotePath}`);
    return pullResult;
  }

  // Get current activity
  getCurrentActivity() {
    const result = this.exec("shell dumpsys activity activities | grep mResumedActivity");
    return result;
  }

  // Get device model/name
  getDeviceModel() {
    const result = this.exec("shell getprop ro.product.model", { timeout: 3000 });
    return result.success ? result.output : "Unknown";
  }

  /**
   * ดึงจำนวนเพื่อนจากหน้า Friend lists
   * รองรับทั้งภาษาอังกฤษ (Friends 2) และภาษาไทย (เพื่อน 2)
   * @returns {number} จำนวนเพื่อน หรือ -1 ถ้าหาไม่เจอ
   */
  getFriendsCount() {
    // Dump UI hierarchy
    const dumpResult = this.exec("shell uiautomator dump /sdcard/ui.xml", { timeout: 10000 });
    if (!dumpResult.success) {
      return -1;
    }

    // อ่านไฟล์ XML
    const catResult = this.exec("shell cat /sdcard/ui.xml", { timeout: 10000 });
    if (!catResult.success) {
      return -1;
    }

    const xml = catResult.output;

    // หา pattern: "Friends X" หรือ "เพื่อน X" จาก home_row_title_name
    // Pattern 1: English - "Friends 123"
    const engMatch = xml.match(/text="Friends\s+(\d+)"/i);
    if (engMatch) {
      return parseInt(engMatch[1]);
    }

    // Pattern 2: Thai - "เพื่อน 123"
    const thaiMatch = xml.match(/text="เพื่อน\s*(\d+)"/);
    if (thaiMatch) {
      return parseInt(thaiMatch[1]);
    }

    // Pattern 3: หา home_row_title_name ที่มีตัวเลข
    const titleMatch = xml.match(/resource-id="jp\.naver\.line\.android:id\/home_row_title_name"[^>]*text="[^"]*?(\d+)[^"]*"/);
    if (titleMatch) {
      return parseInt(titleMatch[1]);
    }

    return -1;
  }

  /**
   * ลบไฟล์ UI dump
   */
  cleanupUIDump() {
    this.exec("shell rm -f /sdcard/ui.xml");
  }
}

module.exports = ADBController;