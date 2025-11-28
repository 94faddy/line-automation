/**
 * Emoji Test - ทดสอบ Emoji
 */

const { execSync } = require("child_process");

const ADB = "C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe";
const DEV = "127.0.0.1:5555";

function run(cmd) {
  try {
    return execSync(`"${ADB}" -s ${DEV} ${cmd}`, { encoding: "utf8", timeout: 10000, stdio: 'pipe' }).trim();
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function clear() {
  for (let i = 0; i < 50; i++) run("shell input keyevent 67");
  sleep(300);
}

// ฟังก์ชันส่งข้อความแบบใหม่ (แยกคำ + keyevent 62)
function typeMessage(text) {
  const words = text.split(" ");
  
  for (let i = 0; i < words.length; i++) {
    if (words[i].length > 0) {
      run(`shell am broadcast -a clipper.set -e text "${words[i]}"`);
      sleep(80);
      run("shell input keyevent 279");
      sleep(100);
    }
    
    if (i < words.length - 1) {
      run("shell input keyevent 62"); // SPACE
      sleep(60);
    }
  }
}

console.log("=".repeat(50));
console.log("EMOJI TEST");
console.log("=".repeat(50));
console.log("\nกดที่ช่องพิมพ์ LINE ให้ cursor กระพริบ");
console.log("Starting in 3 seconds...\n");
sleep(3000);

// Test 1: Simple emoji
console.log("\n[1] Simple emoji...");
clear();
run(`shell am broadcast -a clipper.set -e text "😀"`);
sleep(100);
run("shell input keyevent 279");
sleep(1500);
console.log("→ เห็น 😀 ไหม?");

// Test 2: Multiple emojis
console.log("\n[2] Multiple emojis...");
clear();
run(`shell am broadcast -a clipper.set -e text "😀👋🎉"`);
sleep(100);
run("shell input keyevent 279");
sleep(1500);
console.log("→ เห็น 😀👋🎉 ไหม?");

// Test 3: Text + emoji
console.log("\n[3] Hello + emoji...");
clear();
typeMessage("Hello 😀");
sleep(1500);
console.log("→ เห็น 'Hello 😀' ไหม?");

// Test 4: Thai + emoji
console.log("\n[4] Thai + emoji...");
clear();
typeMessage("สวัสดี 👋");
sleep(1500);
console.log("→ เห็น 'สวัสดี 👋' ไหม?");

// Test 5: Full message
console.log("\n[5] Full message with emoji...");
clear();
typeMessage("สวัสดีครับ! 😀 ยินดีต้อนรับ 🎉");
sleep(1500);
console.log("→ เห็น 'สวัสดีครับ! 😀 ยินดีต้อนรับ 🎉' ไหม?");

// Test 6: Complex message
console.log("\n[6] Complex message...");
clear();
typeMessage("สวัสดี! 👋 ลิงก์: https://example.com 🔗");
sleep(1500);
console.log("→ เห็นข้อความครบไหม?");

console.log("\n" + "=".repeat(50));
console.log("บอกผลมาว่า Test ไหนเห็น emoji (1-6)");
console.log("=".repeat(50));