/**
 * Thai Clipboard Test - ทดสอบ clipper กับภาษาไทย
 */

const { execSync } = require("child_process");

const ADB = "C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe";
const DEV = "127.0.0.1:5555";

function run(cmd) {
  console.log(`> ${cmd}`);
  try {
    const result = execSync(`"${ADB}" -s ${DEV} ${cmd}`, { encoding: "utf8", timeout: 10000, stdio: 'pipe' }).trim();
    if (result) console.log(`  ${result}`);
    return result;
  } catch (e) {
    console.log(`  ERROR`);
    return null;
  }
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

console.log("=".repeat(50));
console.log("THAI CLIPBOARD TEST");
console.log("=".repeat(50));
console.log("\nกรุณาเปิด LINE กดที่ช่องพิมพ์ให้ cursor กระพริบ");
console.log("Starting in 3 seconds...\n");
sleep(3000);

// Clear
console.log("Clearing...");
for (let i = 0; i < 20; i++) run("shell input keyevent 67");
sleep(500);

// === TEST 1: Thai via clipper ===
console.log("\n[TEST 1] Thai text via clipper...");
const thai1 = "สวัสดีครับ";
// ต้อง escape สำหรับ shell
run(`shell am broadcast -a clipper.set -e text "${thai1}"`);
sleep(300);
run("shell input keyevent 279"); // Paste
sleep(1500);
console.log(`→ เห็น '${thai1}' ไหม?`);

// Clear
console.log("\nClearing...");
for (let i = 0; i < 20; i++) run("shell input keyevent 67");
sleep(500);

// === TEST 2: Thai + English ===
console.log("\n[TEST 2] Mixed Thai + English...");
const mixed = "Hello สวัสดี World";
run(`shell am broadcast -a clipper.set -e text "${mixed}"`);
sleep(300);
run("shell input keyevent 279");
sleep(1500);
console.log(`→ เห็น '${mixed}' ไหม?`);

// Clear
console.log("\nClearing...");
for (let i = 0; i < 20; i++) run("shell input keyevent 67");
sleep(500);

// === TEST 3: Emoji ===
console.log("\n[TEST 3] Emoji via clipper...");
const emoji = "Hello 😀👋";
run(`shell am broadcast -a clipper.set -e text "${emoji}"`);
sleep(300);
run("shell input keyevent 279");
sleep(1500);
console.log(`→ เห็น '${emoji}' ไหม?`);

// Clear
console.log("\nClearing...");
for (let i = 0; i < 20; i++) run("shell input keyevent 67");
sleep(500);

// === TEST 4: Full message ===
console.log("\n[TEST 4] Full message with URL...");
const fullMsg = "สวัสดีครับ! ลิงก์: https://example.com";
run(`shell am broadcast -a clipper.set -e text "${fullMsg}"`);
sleep(300);
run("shell input keyevent 279");
sleep(1500);
console.log(`→ เห็นข้อความเต็มไหม?`);

// === TEST 5: Multi-line ===
console.log("\n[TEST 5] Multi-line message...");
// Clear first
for (let i = 0; i < 50; i++) run("shell input keyevent 67");
sleep(500);

// สำหรับ multi-line ต้องเขียนลงไฟล์ก่อน
const multiLine = `สวัสดีครับ!
นี่คือข้อความหลายบรรทัด
Line 3`;

// เขียนลงไฟล์
const base64 = Buffer.from(multiLine, 'utf8').toString('base64');
run(`shell "echo '${base64}' | base64 -d > /data/local/tmp/msg.txt"`);
sleep(200);

// ใช้ cat ส่งเข้า clipper
run(`shell am broadcast -a clipper.set -e text "$(cat /data/local/tmp/msg.txt)"`);
sleep(300);
run("shell input keyevent 279");
sleep(1500);
console.log(`→ เห็นข้อความหลายบรรทัดไหม?`);

console.log("\n" + "=".repeat(50));
console.log("RESULTS");
console.log("=".repeat(50));
console.log(`
บอกผลมา:
- TEST 1 (สวัสดีครับ): ___
- TEST 2 (Hello สวัสดี World): ___  
- TEST 3 (Hello 😀👋): ___
- TEST 4 (สวัสดีครับ! ลิงก์:...): ___
- TEST 5 (หลายบรรทัด): ___
`);