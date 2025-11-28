/**
 * Clipboard Test - ทดสอบ copy/paste
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
    console.log(`  ERROR: ${e.message}`);
    return null;
  }
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

console.log("=".repeat(50));
console.log("CLIPBOARD TEST");
console.log("=".repeat(50));
console.log("\nกรุณาเปิด LINE กดที่ช่องพิมพ์ให้ cursor กระพริบ");
console.log("Starting in 3 seconds...\n");
sleep(3000);

// Clear
for (let i = 0; i < 15; i++) run("shell input keyevent 67");
sleep(300);

// === TEST 1: service call clipboard ===
console.log("\n[TEST 1] service call clipboard (Android method)...");

// เขียนข้อความลงไฟล์ก่อน
const thaiText = "สวัสดีไทย";
const base64 = Buffer.from(thaiText, 'utf8').toString('base64');
run(`shell "echo '${base64}' | base64 -d > /data/local/tmp/clip.txt"`);

// ลองใช้ service call
run('shell service call clipboard 2 i32 1 i64 0 s16 "TestClip"');
sleep(300);

// Paste (Ctrl+V = keyevent 279)
console.log("Pasting with keyevent 279...");
run("shell input keyevent 279");
sleep(1000);

console.log("→ เห็น 'TestClip' ไหม?");
sleep(2000);

// Clear
for (let i = 0; i < 15; i++) run("shell input keyevent 67");
sleep(300);

// === TEST 2: am broadcast clipper ===
console.log("\n[TEST 2] am broadcast clipper.set...");
run('shell am broadcast -a clipper.set -e text "ClipperTest"');
sleep(300);
run("shell input keyevent 279");
sleep(1000);

console.log("→ เห็น 'ClipperTest' ไหม?");
sleep(2000);

// Clear
for (let i = 0; i < 15; i++) run("shell input keyevent 67");
sleep(300);

// === TEST 3: content provider ===
console.log("\n[TEST 3] content provider clipboard...");
run('shell content call --uri content://clipboard --method set --arg "ContentTest"');
sleep(300);
run("shell input keyevent 279");
sleep(1000);

console.log("→ เห็น 'ContentTest' ไหม?");
sleep(2000);

// Clear
for (let i = 0; i < 15; i++) run("shell input keyevent 67");
sleep(300);

// === TEST 4: appops + clipboard manager ===
console.log("\n[TEST 4] Direct clipboard via am...");
run('shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "SendTest"');
sleep(2000);
// กด back เพื่อปิด share dialog
run("shell input keyevent 4");
sleep(500);

// === TEST 5: ใช้ input text กับ URL encoded ===
console.log("\n[TEST 5] input text with special chars...");
// ลอง URL ดู
run('shell input text "https://test.com/path"');
sleep(1000);

console.log("→ เห็น URL ไหม?");

console.log("\n" + "=".repeat(50));
console.log("บอกผลมาว่า Test ไหนที่เห็นข้อความ");
console.log("=".repeat(50));