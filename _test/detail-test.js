/**
 * Detailed Test - ทดสอบแยกทีละอย่าง
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
  for (let i = 0; i < 30; i++) run("shell input keyevent 67");
  sleep(300);
}

function testClipboard(label, text) {
  console.log(`\n[${label}] Testing: "${text}"`);
  clear();
  run(`shell am broadcast -a clipper.set -e text "${text}"`);
  sleep(200);
  run("shell input keyevent 279");
  sleep(1500);
}

console.log("=".repeat(50));
console.log("DETAILED CLIPBOARD TEST");
console.log("=".repeat(50));
console.log("\nกดที่ช่องพิมพ์ LINE ให้ cursor กระพริบ");
console.log("Starting in 3 seconds...\n");
sleep(3000);

// Test each component
testClipboard("1", "สวัสดี");
testClipboard("2", "สวัสดีครับ");
testClipboard("3", "Hello");
testClipboard("4", "Hello World");
testClipboard("5", "สวัสดี Hello");
testClipboard("6", "ทดสอบ123");
testClipboard("7", "test!");
testClipboard("8", "ทดสอบ!");
testClipboard("9", "https://example.com");
testClipboard("10", "ลิงก์ https://example.com");

console.log("\n" + "=".repeat(50));
console.log("บอกผลมาว่า Test ไหนเห็นข้อความ (1-10)");
console.log("=".repeat(50));