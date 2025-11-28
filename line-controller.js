/**
 * LINE Controller Module
 * ควบคุม LINE app บน BlueStacks
 * รองรับการส่งข้อความหาเพื่อนทั้งหมด
 */

const fs = require("fs");
const path = require("path");
const config = require("./config");

class LineController {
  constructor(adb) {
    this.adb = adb;
    this.screenSize = null;
    this.friends = [];
    this.sentFriends = [];
  }

  /**
   * Initialize
   */
  async init() {
    this.screenSize = this.adb.getScreenSize();
    this.log(`Screen size: ${this.screenSize.width}x${this.screenSize.height}`);
    
    // Create log directory
    fs.mkdirSync(path.dirname(config.logging.logFile), { recursive: true });
    
    return this;
  }

  /**
   * Log message
   */
  log(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}`;
    console.log(logLine);
    
    try {
      fs.appendFileSync(config.logging.logFile, logLine + "\n");
    } catch (e) {}
  }

  /**
   * Wait for milliseconds
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * เปิด LINE app
   */
  async startLine() {
    this.log("Starting LINE app...");
    this.adb.exec(`shell am start -n ${config.linePackage}/.activity.SplashActivity`);
    await this.wait(3000);
    this.log("LINE app started");
  }

  /**
   * กลับไปหน้า Home อย่างปลอดภัย
   * กด Home ที่ด้านล่าง (ใช้ได้จากหน้า Chat list, Home)
   */
  async forceGoHome() {
    this.log("Going to Home...");
    const { homeButton } = config.coordinates;
    
    // กด Home 1 ครั้ง
    this.adb.tap(homeButton.x, homeButton.y);
    await this.wait(2000);
    
    this.log("Now at Home");
  }

  /**
   * กลับไปหน้า Home ของ LINE (จากหน้า Chat)
   */
  async goToHome() {
    this.log("Going to Home...");
    // กดปุ่ม Home ที่ด้านล่าง
    const { homeButton } = config.coordinates;
    this.adb.tap(homeButton.x, homeButton.y);
    await this.wait(config.delays.pageLoad);
  }

  /**
   * เปิดหน้า Friend lists
   */
  async openFriendList() {
    this.log("Opening Friend list...");
    
    // กด "Friends" ที่หน้า Home
    const { friendsButton } = config.coordinates;
    this.adb.tap(friendsButton.x, friendsButton.y);
    await this.wait(config.delays.pageLoad);
    
    this.log("Friend list opened");
  }

  /**
   * Scroll down ใน friend list
   */
  async scrollDown() {
    this.adb.swipe(540, 1200, 540, 400, 300);
    await this.wait(config.delays.scrollWait);
  }

  /**
   * Scroll up ใน friend list
   */
  async scrollUp() {
    this.adb.swipe(540, 400, 540, 1200, 300);
    await this.wait(config.delays.scrollWait);
  }

  /**
   * Scroll to top of friend list
   */
  async scrollToTop() {
    this.log("Scrolling to top...");
    for (let i = 0; i < 10; i++) {
      await this.scrollUp();
    }
    await this.wait(500);
  }

  /**
   * ส่งข้อความหาเพื่อนคนที่ index
   * Flow: (อยู่หน้า Home แล้ว) → Friends → Friend list → กดเพื่อน → Profile 
   *       → Chat → พิมพ์ → ส่ง → Back → Chat list → Home
   */
  async sendToFriend(friendIndex, message, totalFriends) {
    const { 
      friendListStart, 
      friendItemHeight, 
      chatButton, 
      chatInput, 
      sendButton, 
      backButton,
      homeButton,
      friendsButton 
    } = config.coordinates;
    
    // 1. เปิด Friend list (ต้องอยู่หน้า Home แล้ว)
    this.log(`Opening Friend list...`);
    this.adb.tap(friendsButton.x, friendsButton.y);
    await this.wait(config.delays.pageLoad);
    
    // คำนวณตำแหน่งเพื่อนบนหน้าจอ
    const itemsPerScreen = 15;
    const screenIndex = Math.floor(friendIndex / itemsPerScreen);
    const positionInScreen = friendIndex % itemsPerScreen;
    
    // 2. Scroll ไปหน้าที่ต้องการ (ถ้าจำเป็น)
    if (screenIndex > 0) {
      this.log(`Scrolling to page ${screenIndex + 1}...`);
      for (let i = 0; i < screenIndex; i++) {
        await this.scrollDown();
      }
      await this.wait(1000);
    }
    
    // 3. คำนวณ Y ของเพื่อนในหน้านั้น
    const friendY = friendListStart.y + (positionInScreen * friendItemHeight);
    
    this.log(`Tapping friend at (${friendListStart.x}, ${friendY})`);
    
    // 4. กดที่เพื่อน → เปิด Profile
    this.adb.tap(friendListStart.x, friendY);
    await this.wait(config.delays.pageLoad);
    
    // 5. กดปุ่ม Chat → เปิดหน้า Chat
    this.log(`Tapping Chat button at (${chatButton.x}, ${chatButton.y})`);
    this.adb.tap(chatButton.x, chatButton.y);
    await this.wait(config.delays.pageLoad);
    
    // 6. กดช่องพิมพ์
    this.log(`Tapping input at (${chatInput.x}, ${chatInput.y})`);
    this.adb.tap(chatInput.x, chatInput.y);
    await this.wait(config.delays.afterTap);
    
    // 7. พิมพ์ข้อความ
    this.log(`Typing: "${message}"`);
    this.adb.type(message);
    await this.wait(config.delays.afterType);
    
    // 8. กดส่ง
    this.log(`Tapping send at (${sendButton.x}, ${sendButton.y})`);
    this.adb.tap(sendButton.x, sendButton.y);
    await this.wait(config.delays.afterSend);
    
    // 9. กด Back → ไปหน้า Chat list
    this.log(`Pressing Back to go to Chat list...`);
    this.adb.tap(backButton.x, backButton.y);
    await this.wait(1000);
    
    // 10. กด Home → ไปหน้า Home
    this.log(`Pressing Home to go to Home...`);
    this.adb.tap(homeButton.x, homeButton.y);
    await this.wait(config.delays.pageLoad);
    
    return true;
  }

  /**
   * ส่งข้อความหาเพื่อนทั้งหมด
   */
  async sendToAllFriends(message, totalFriends, options = {}) {
    const { skipFirst = 0, limit = 0, onProgress = null } = options;
    
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      sent: [],
    };
    
    // คำนวณจำนวนที่จะส่ง
    const startIndex = skipFirst;
    const endIndex = limit > 0 ? Math.min(skipFirst + limit, totalFriends) : totalFriends;
    results.total = endIndex - startIndex;
    
    console.log("\n  ══════════════════════════════════════════════════════");
    console.log("  📤 SENDING MESSAGES TO ALL FRIENDS");
    console.log("  ══════════════════════════════════════════════════════");
    console.log(`  📋 Total friends: ${totalFriends}`);
    console.log(`  📨 Will send to: ${results.total} friends`);
    console.log(`  💬 Message: "${message}"`);
    console.log("  ══════════════════════════════════════════════════════\n");
    
    console.log("  ⚠️  Make sure LINE is on HOME screen before starting!");
    console.log("  🏠 Starting from Home...\n");
    
    // ส่งทีละคน (เริ่มจากหน้า Home)
    for (let i = startIndex; i < endIndex; i++) {
      const friendNum = i + 1;
      const progress = i - startIndex + 1;
      const percent = Math.round((progress / results.total) * 100);
      
      console.log(`\n  ────────────────────────────────────────`);
      console.log(`  [${progress}/${results.total}] (${percent}%) Sending to Friend #${friendNum}...`);
      
      try {
        await this.sendToFriend(i, message, totalFriends);
        
        results.success++;
        results.sent.push({
          index: i,
          name: `Friend #${friendNum}`,
          status: "✅ Sent",
        });
        
        console.log(`  ✅ Successfully sent to Friend #${friendNum}`);
        
        if (onProgress) {
          onProgress({
            current: progress,
            total: results.total,
            percent,
            friendIndex: i,
            success: true,
          });
        }
        
      } catch (error) {
        results.failed++;
        results.sent.push({
          index: i,
          name: `Friend #${friendNum}`,
          status: "❌ Failed",
          error: error.message,
        });
        
        console.log(`  ❌ Failed to send to Friend #${friendNum}: ${error.message}`);
        
        // พยายามกลับไปหน้า friend list
        await this.goToHome();
        await this.wait(1000);
        await this.openFriendList();
      }
      
      // รอก่อนส่งคนถัดไป
      if (i < endIndex - 1) {
        await this.wait(config.delays.betweenFriends);
      }
    }
    
    // สรุปผล
    console.log("\n\n  ══════════════════════════════════════════════════════");
    console.log("  📊 SUMMARY");
    console.log("  ══════════════════════════════════════════════════════");
    console.log(`  ✅ Success: ${results.success}/${results.total}`);
    console.log(`  ❌ Failed:  ${results.failed}/${results.total}`);
    console.log("  ──────────────────────────────────────────────────────");
    console.log("  📋 Sent to:");
    results.sent.forEach(f => {
      console.log(`     ${f.status} ${f.name}`);
    });
    console.log("  ══════════════════════════════════════════════════════\n");
    
    return results;
  }

  /**
   * Test: ส่งหาเพื่อนคนแรก
   */
  async testSendMessage(message) {
    console.log("\n  ══════════════════════════════════════");
    console.log("  🧪 TEST MODE - Send to First Friend");
    console.log("  ══════════════════════════════════════\n");
    
    const { 
      friendsButton,
      friendListStart, 
      chatButton, 
      chatInput, 
      sendButton,
      backButton,
      homeButton
    } = config.coordinates;
    
    // Step 1: บังคับกลับ Home ก่อน
    console.log(`  [1/10] Force going to Home first...`);
    await this.forceGoHome();
    
    // Step 2: เปิด Friend list
    console.log(`  [2/10] Opening Friend list (tap at ${friendsButton.x}, ${friendsButton.y})...`);
    this.adb.tap(friendsButton.x, friendsButton.y);
    await this.wait(2000);
    
    // Step 3: กดเพื่อนคนแรก
    console.log(`  [3/10] Tapping first friend at (${friendListStart.x}, ${friendListStart.y})...`);
    console.log("         👤 Target: Friend #1 (first in list)");
    this.adb.tap(friendListStart.x, friendListStart.y);
    await this.wait(2000);
    
    // Step 4: กดปุ่ม Chat
    console.log(`  [4/10] Tapping Chat button at (${chatButton.x}, ${chatButton.y})...`);
    this.adb.tap(chatButton.x, chatButton.y);
    await this.wait(2000);
    
    // Step 5: กดช่องพิมพ์
    console.log(`  [5/10] Tapping message input at (${chatInput.x}, ${chatInput.y})...`);
    this.adb.tap(chatInput.x, chatInput.y);
    await this.wait(1000);
    
    // Step 6: พิมพ์ข้อความ
    console.log(`  [6/10] Typing message: "${message}"`);
    this.adb.type(message);
    await this.wait(1000);
    
    // Step 7: กดส่ง
    console.log(`  [7/10] Tapping SEND button at (${sendButton.x}, ${sendButton.y})...`);
    this.adb.tap(sendButton.x, sendButton.y);
    await this.wait(2000);
    
    // Step 8: กด Back ไป Chat list
    console.log(`  [8/10] Pressing Back to Chat list (${backButton.x}, ${backButton.y})...`);
    this.adb.tap(backButton.x, backButton.y);
    await this.wait(1500);
    
    // Step 9: กด Home ไป Home
    console.log(`  [9/10] Pressing Home (${homeButton.x}, ${homeButton.y})...`);
    this.adb.tap(homeButton.x, homeButton.y);
    await this.wait(1500);
    
    // Step 10: สรุป
    console.log("  [10/10] Done!");
    
    console.log("\n  ══════════════════════════════════════");
    console.log("  📊 TEST COMPLETED");
    console.log("  ══════════════════════════════════════");
    console.log("  ");
    console.log("  👀 CHECK IN BLUESTACKS:");
    console.log("     1. ✓ Did it go to Home first?");
    console.log("     2. ✓ Did it open Friend list?");
    console.log("     3. ✓ Did it tap the first friend?");
    console.log("     4. ✓ Did it open the chat?");
    console.log("     5. ✓ Was the message typed?");
    console.log("     6. ✓ Was the message SENT?");
    console.log("     7. ✓ Did it go back to Chat list?");
    console.log("     8. ✓ Did it go back to Home?");
    console.log("  ");
    console.log("  ══════════════════════════════════════\n");
    
    return { success: true, message };
  }
}

module.exports = LineController;