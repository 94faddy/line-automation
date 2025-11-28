/**
 * LINE BlueStacks Automation
 * ส่งข้อความหาเพื่อนทั้งหมดใน LINE
 */

const readline = require("readline");
const config = require("./config");
const ADBController = require("./adb");
const LineController = require("./line-controller");

// ========== Utility Functions ==========

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     LINE BlueStacks Automation v2.0                           ║
║     ─────────────────────────────────                         ║
║     Send messages to ALL friends automatically                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

function printMenu() {
  console.log(`
  ┌─────────────────────────────────────┐
  │           MAIN MENU                 │
  ├─────────────────────────────────────┤
  │  [1] Check connection status        │
  │  [2] Test send (first friend)       │
  │  [3] Send to ALL friends            │
  │  [4] Settings                       │
  │  [5] Exit                           │
  └─────────────────────────────────────┘
  `);
}

// ========== Main Functions ==========

async function checkConnection() {
  console.log("\n🔍 Checking connection...\n");
  
  const devices = ADBController.getDevices(config.bluestacks.adbPath);
  
  if (devices.length === 0) {
    console.log("  ❌ No BlueStacks instances found!");
    console.log("  💡 Make sure BlueStacks is running and ADB is enabled");
    console.log("     Settings > Advanced > Enable Android Debug Bridge (ADB)");
  } else {
    console.log(`  ✅ Found ${devices.length} device(s):`);
    devices.forEach((d, i) => {
      console.log(`     [${i + 1}] ${d.id} - ${d.status}`);
    });
    
    // Check LINE
    const adb = new ADBController(devices[0].id);
    const lineInstalled = adb.isLineInstalled();
    console.log(`\n  📱 LINE: ${lineInstalled ? "✅ Installed" : "❌ Not installed"}`);
    
    // Get screen size
    const screenSize = adb.getScreenSize();
    console.log(`  📐 Screen: ${screenSize.width}x${screenSize.height}`);
  }
  
  console.log();
}

async function testSend() {
  console.log("\n🧪 Test Mode - Send to First Friend\n");
  
  const devices = ADBController.getDevices(config.bluestacks.adbPath);
  if (devices.length === 0) {
    console.log("  ❌ No devices found! Start BlueStacks first.");
    return;
  }
  
  const adb = new ADBController(devices[0].id);
  const line = new LineController(adb);
  await line.init();
  
  // ถามข้อความ
  let message = await ask("  Enter message (or press Enter for default): ");
  if (!message.trim()) {
    message = config.message;
  }
  
  console.log(`\n  💬 Message: "${message}"`);
  const confirm = await ask("  Start test? (y/n): ");
  
  if (confirm.toLowerCase() === "y") {
    await line.testSendMessage(message);
  } else {
    console.log("  Cancelled.");
  }
}

async function sendToAll() {
  console.log("\n📤 Send to ALL Friends\n");
  
  const devices = ADBController.getDevices(config.bluestacks.adbPath);
  if (devices.length === 0) {
    console.log("  ❌ No devices found! Start BlueStacks first.");
    return;
  }
  
  const adb = new ADBController(devices[0].id);
  const line = new LineController(adb);
  await line.init();
  
  // ถามจำนวนเพื่อน
  console.log("  ─────────────────────────────────────────");
  console.log("  📋 Please check your LINE Friend list");
  console.log("     and count how many friends you have.");
  console.log("  ─────────────────────────────────────────\n");
  
  const totalInput = await ask("  How many friends do you have? ");
  const totalFriends = parseInt(totalInput);
  
  if (isNaN(totalFriends) || totalFriends <= 0) {
    console.log("  ❌ Invalid number!");
    return;
  }
  
  // ถามข้อความ
  let message = await ask("  Enter message (or press Enter for default): ");
  if (!message.trim()) {
    message = config.message;
  }
  
  // ถาม skip
  const skipInput = await ask("  Skip first N friends (default: 0): ");
  const skipFirst = parseInt(skipInput) || 0;
  
  // ถาม limit
  const limitInput = await ask("  Limit (0 = all, default: 0): ");
  const limit = parseInt(limitInput) || 0;
  
  // สรุป
  const sendCount = limit > 0 ? Math.min(limit, totalFriends - skipFirst) : (totalFriends - skipFirst);
  
  console.log(`
  ═══════════════════════════════════════════
  📊 SUMMARY
  ───────────────────────────────────────────
  📋 Total friends:  ${totalFriends}
  ⏭️  Skip first:     ${skipFirst}
  📨 Will send to:   ${sendCount} friends
  💬 Message:        "${message}"
  ═══════════════════════════════════════════
  `);
  
  const confirm = await ask("  Start sending? (y/n): ");
  
  if (confirm.toLowerCase() === "y") {
    await line.sendToAllFriends(message, totalFriends, {
      skipFirst,
      limit,
    });
  } else {
    console.log("  Cancelled.");
  }
}

function showSettings() {
  console.log(`
  ═══════════════════════════════════════════
  ⚙️  CURRENT SETTINGS (config.js)
  ═══════════════════════════════════════════
  
  Message:        "${config.message}"
  Friend limit:   ${config.friendLimit || "All"}
  Skip first:     ${config.skipFirst}
  
  Delays:
    After tap:      ${config.delays.afterTap}ms
    After type:     ${config.delays.afterType}ms
    After send:     ${config.delays.afterSend}ms
    Between friends: ${config.delays.betweenFriends}ms
  
  Coordinates:
    Friends button: (${config.coordinates.friendsButton.x}, ${config.coordinates.friendsButton.y})
    Friend start:   (${config.coordinates.friendListStart.x}, ${config.coordinates.friendListStart.y})
    Chat button:    (${config.coordinates.chatButton.x}, ${config.coordinates.chatButton.y})
    Chat input:     (${config.coordinates.chatInput.x}, ${config.coordinates.chatInput.y})
    Send button:    (${config.coordinates.sendButton.x}, ${config.coordinates.sendButton.y})
    Home button:    (${config.coordinates.homeFromChat.x}, ${config.coordinates.homeFromChat.y})
  
  ═══════════════════════════════════════════
  💡 Edit config.js to change settings
  ═══════════════════════════════════════════
  `);
}

// ========== Main ==========

async function main() {
  printBanner();
  
  let running = true;
  
  while (running) {
    printMenu();
    
    const choice = await ask("  Select option (1-5): ");
    
    switch (choice) {
      case "1":
        await checkConnection();
        break;
      case "2":
        await testSend();
        break;
      case "3":
        await sendToAll();
        break;
      case "4":
        showSettings();
        break;
      case "5":
        running = false;
        console.log("\n  👋 Goodbye!\n");
        break;
      default:
        console.log("\n  ❌ Invalid option!\n");
    }
    
    if (running && choice !== "5") {
      await ask("  Press Enter to continue...");
    }
  }
}

main().catch(console.error);