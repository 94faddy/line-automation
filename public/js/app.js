// LINE Web Automation Frontend v4.0
// - เลือก instance ที่ต้องการส่ง
// - Progress bar แยกแต่ละ instance
// - ควบคุมแต่ละ instance แยกกัน

const socket = io();
let instances = [];
let instanceProgress = {}; // { deviceId: { isRunning, current, total, sent, failed, ... } }
let instanceChecked = {}; // { deviceId: true/false } - เก็บสถานะ checkbox

// ==================== SOCKET EVENTS ====================

socket.on("connect", () => {
  addLog("เชื่อมต่อ server สำเร็จ", "info");
});

socket.on("disconnect", () => {
  addLog("หลุดการเชื่อมต่อจาก server", "error");
});

socket.on("init", (data) => {
  instances = data.instances || [];
  renderInstanceCards();
  updateGlobalButtons();
});

socket.on("instances", (data) => {
  instances = data;
  renderInstanceCards();
});

socket.on("log", (data) => {
  addLog(data.message, data.type);
});

// Event สำหรับ progress แต่ละ instance
socket.on("instance-status", (data) => {
  handleInstanceStatus(data);
});

socket.on("multi-start", (data) => {
  addLog(`เริ่มส่ง ${data.totalInstances} instance(s) (${data.mode}, ${data.speed})`, "info");
});

socket.on("multi-complete", (data) => {
  addLog(`เสร็จสิ้น: ${data.successInstances}/${data.totalInstances} instances สำเร็จ`, "success");
  updateGlobalButtons();
});

// ==================== INSTANCE STATUS HANDLER ====================

function handleInstanceStatus(data) {
  const { deviceId, type } = data;
  
  if (!instanceProgress[deviceId]) {
    instanceProgress[deviceId] = {
      isRunning: false,
      isPaused: false,
      current: 0,
      total: 0,
      totalFriends: 0,
      sent: 0,
      failed: 0,
      eta: '--',
      status: 'idle'
    };
  }
  
  const progress = instanceProgress[deviceId];
  
  switch (type) {
    case "preparing":
    case "restarting":
    case "detecting-friends":
      progress.isRunning = true;
      progress.status = type;
      break;
      
    case "friends-detected":
      progress.totalFriends = data.count;
      progress.total = data.count;
      break;
      
    case "start":
      progress.isRunning = true;
      progress.total = data.total;
      progress.totalFriends = data.totalFriends || data.total;
      progress.current = 0;
      progress.sent = 0;
      progress.failed = 0;
      progress.status = 'running';
      break;
      
    case "resume":
      progress.isRunning = true;
      progress.current = data.currentIndex;
      progress.totalFriends = data.totalFriends;
      progress.sent = data.sentCount;
      progress.failed = data.failedCount;
      progress.status = 'running';
      break;
      
    case "sent":
      progress.current = data.current;
      progress.total = data.total;
      progress.totalFriends = data.totalFriends || data.total;
      progress.sent = data.sentCount;
      progress.failed = data.failedCount;
      progress.eta = data.eta;
      progress.status = 'running';
      addInstanceActivity(deviceId, data.friendNum, data.success);
      addLog(`[${getInstanceName(deviceId)}] เพื่อน #${data.friendNum} ${data.success ? '✓' : '✗'}`, data.success ? "success" : "error");
      break;
      
    case "paused":
      progress.isPaused = true;
      progress.status = 'paused';
      break;
      
    case "resumed":
      progress.isPaused = false;
      progress.status = 'running';
      break;
      
    case "stopping":
    case "stopped":
      progress.isRunning = false;
      progress.isPaused = false;
      progress.status = 'stopped';
      // Refresh status หลังหยุด
      setTimeout(() => requestStatusRefresh(), 500);
      break;
      
    case "complete":
      progress.isRunning = false;
      progress.isPaused = false;
      progress.status = 'complete';
      if (data.summary) {
        progress.sent = data.summary.success;
        progress.failed = data.summary.failed;
      }
      // Refresh status หลังเสร็จ
      setTimeout(() => requestStatusRefresh(), 500);
      break;
      
    case "error":
      progress.status = 'error';
      progress.error = data.message;
      progress.isRunning = false; // หยุดการทำงานเมื่อ error
      addLog(`[${getInstanceName(deviceId)}] Error: ${data.message}`, "error");
      // Refresh status หลัง error
      setTimeout(() => requestStatusRefresh(), 500);
      break;
      
    case "reset":
      progress.isRunning = false;
      progress.isPaused = false;
      progress.current = 0;
      progress.total = 0;
      progress.sent = 0;
      progress.failed = 0;
      progress.status = 'idle';
      // Refresh status หลัง reset
      setTimeout(() => requestStatusRefresh(), 500);
      break;
  }
  
  renderInstanceProgress(deviceId);
  updateGlobalButtons();
}

// ==================== RENDER FUNCTIONS ====================

function getInstanceIndex(deviceId) {
  return instances.findIndex(i => i.deviceId === deviceId);
}

function getInstanceName(deviceId) {
  const idx = getInstanceIndex(deviceId);
  return idx >= 0 ? `#${idx + 1}` : deviceId;
}

function renderInstanceCards() {
  const container = document.getElementById("instance-cards");
  
  if (instances.length === 0) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle"></i> ไม่พบ BlueStacks instance - กด Refresh
      </div>
    `;
    return;
  }

  container.innerHTML = instances.map((inst, idx) => {
    const deviceId = inst.deviceId;
    const progress = instanceProgress[deviceId] || {};
    const savedState = inst.savedState;
    
    // ใช้ statusType สำหรับแสดง badge (หรือ fallback จาก lineStatus)
    const displayStatus = inst.statusType || inst.lineStatus;
    let statusBadge = '';
    switch (displayStatus) {
      case "ready":
      case "foreground":
        statusBadge = '<span class="badge bg-success">พร้อม</span>'; break;
      case "background":
        statusBadge = '<span class="badge bg-warning text-dark">เบื้องหลัง</span>'; break;
      case "stopped":
        statusBadge = '<span class="badge bg-danger">ปิดอยู่</span>'; break;
      case "no-line":
      case "not_installed":
        statusBadge = '<span class="badge bg-dark">ไม่มี LINE</span>'; break;
      default: 
        statusBadge = '<span class="badge bg-secondary">ออฟไลน์</span>';
    }
    
    const isRunning = progress.isRunning || false;
    const isPaused = progress.isPaused || false;
    
    // Saved state info
    let savedStateHtml = '';
    if (savedState && savedState.remaining > 0) {
      savedStateHtml = `
        <div class="alert alert-info py-2 mb-2">
          <small><i class="bi bi-clock-history"></i> ส่งค้าง: ${savedState.currentIndex}/${savedState.totalFriends} (เหลือ ${savedState.remaining})</small>
        </div>
      `;
    }
    
    // Friend count input (แสดงเมื่อไม่ได้เลือก "ส่งให้เพื่อนทั้งหมด")
    const sendAllChecked = document.getElementById("sendAllFriends")?.checked !== false;
    const friendCountHtml = `
      <div class="friend-count-wrapper mb-2" style="display: ${sendAllChecked ? 'none' : 'block'};">
        <div class="input-group input-group-sm">
          <span class="input-group-text"><i class="bi bi-people"></i></span>
          <input type="number" class="form-control friend-count-input" 
                 data-device-id="${deviceId}" placeholder="จำนวนเพื่อน" min="1" value="10">
          <span class="input-group-text">คน</span>
        </div>
      </div>
    `;
    
    // ตรวจสอบสถานะ checkbox (default = true ถ้าไม่เคยตั้งค่า)
    const isChecked = instanceChecked[deviceId] !== false;
    
    return `
      <div class="card instance-card mb-3" data-device-id="${deviceId}">
        <div class="card-header d-flex justify-content-between align-items-center py-2">
          <div class="d-flex align-items-center gap-2">
            <div class="form-check mb-0">
              <input class="form-check-input instance-checkbox" type="checkbox" 
                     id="check-${idx}" data-device-id="${deviceId}" ${isChecked ? 'checked' : ''} onchange="onCheckboxChange('${deviceId}', this.checked)">
            </div>
            <strong>Instance #${idx + 1}</strong>
            ${statusBadge}
            ${inst.clipperAvailable ? '<i class="bi bi-clipboard-check text-success" title="Clipper OK"></i>' : '<i class="bi bi-clipboard-x text-danger" title="No Clipper"></i>'}
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-warning" onclick="pauseInstance('${deviceId}')" ${!isRunning || isPaused ? 'disabled' : ''}>
              <i class="bi bi-pause-fill"></i>
            </button>
            <button class="btn btn-outline-info" onclick="resumeInstance('${deviceId}')" ${!isPaused ? 'disabled' : ''}>
              <i class="bi bi-play-fill"></i>
            </button>
            <button class="btn btn-outline-danger" onclick="stopInstance('${deviceId}')" ${!isRunning ? 'disabled' : ''}>
              <i class="bi bi-stop-fill"></i>
            </button>
            <button class="btn btn-outline-secondary" onclick="resetInstance('${deviceId}')" ${isRunning ? 'disabled' : ''}>
              <i class="bi bi-arrow-counterclockwise"></i>
            </button>
          </div>
        </div>
        <div class="card-body py-2">
          ${savedStateHtml}
          ${friendCountHtml}
          
          <!-- Progress Section -->
          <div class="instance-progress mb-2" id="progress-${idx}">
            <div class="d-flex justify-content-between mb-1">
              <small class="text-muted">
                <span class="progress-status">${getStatusText(progress.status)}</span>
              </small>
              <small>
                <span class="text-success">${progress.sent || 0}</span> ✓ / 
                <span class="text-danger">${progress.failed || 0}</span> ✗
                <span class="ms-2 text-muted">ETA: ${progress.eta || '--'}s</span>
              </small>
            </div>
            <div class="progress" style="height: 20px;">
              <div class="progress-bar ${getProgressBarClass(progress.status)} progress-bar-striped ${isRunning && !isPaused ? 'progress-bar-animated' : ''}" 
                   style="width: ${getProgressPercent(progress)}%">
                ${progress.current || 0}/${progress.total || 0}
              </div>
            </div>
          </div>
          
          <!-- Activity Log - ซ่อนไว้จนกว่าจะเริ่มทำงาน -->
          <div class="instance-activity mt-2" id="activity-${idx}" style="display: ${isRunning || progress.sent > 0 ? 'block' : 'none'}; max-height: 150px; overflow-y: auto;">
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderInstanceProgress(deviceId) {
  const idx = getInstanceIndex(deviceId);
  if (idx < 0) return;
  
  const progress = instanceProgress[deviceId] || {};
  const isRunning = progress.isRunning || false;
  const isPaused = progress.isPaused || false;
  
  const progressEl = document.getElementById(`progress-${idx}`);
  if (!progressEl) return;
  
  // Update progress bar
  const progressBar = progressEl.querySelector('.progress-bar');
  if (progressBar) {
    const percent = getProgressPercent(progress);
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${progress.current || 0}/${progress.total || 0}`;
    progressBar.className = `progress-bar ${getProgressBarClass(progress.status)} progress-bar-striped ${isRunning && !isPaused ? 'progress-bar-animated' : ''}`;
  }
  
  // Update status text
  const statusEl = progressEl.querySelector('.progress-status');
  if (statusEl) {
    statusEl.textContent = getStatusText(progress.status);
  }
  
  // Update counters
  const countersEl = progressEl.querySelector('small:last-child');
  if (countersEl) {
    countersEl.innerHTML = `
      <span class="text-success">${progress.sent || 0}</span> ✓ / 
      <span class="text-danger">${progress.failed || 0}</span> ✗
      <span class="ms-2 text-muted">ETA: ${progress.eta || '--'}s</span>
    `;
  }
  
  // Update buttons
  const card = document.querySelector(`.instance-card[data-device-id="${deviceId}"]`);
  if (card) {
    const pauseBtn = card.querySelector('.btn-outline-warning');
    const resumeBtn = card.querySelector('.btn-outline-info');
    const stopBtn = card.querySelector('.btn-outline-danger');
    const resetBtn = card.querySelector('.btn-outline-secondary');
    
    if (pauseBtn) pauseBtn.disabled = !isRunning || isPaused;
    if (resumeBtn) resumeBtn.disabled = !isPaused;
    if (stopBtn) stopBtn.disabled = !isRunning;
    if (resetBtn) resetBtn.disabled = isRunning;
  }
}

function addInstanceActivity(deviceId, friendNum, success) {
  const idx = getInstanceIndex(deviceId);
  if (idx < 0) return;
  
  const container = document.getElementById(`activity-${idx}`);
  if (!container) return;
  
  // แสดง activity container เมื่อเริ่มมีกิจกรรม
  container.style.display = 'block';
  
  // อัพเดทแสดงแค่รายการเดียว (แทนที่เดิม)
  container.innerHTML = `
    <div class="d-flex justify-content-between py-1 ${success ? 'text-success' : 'text-danger'}">
      <span><i class="bi bi-${success ? 'check' : 'x'}-circle"></i> กำลังส่งเพื่อน #${friendNum}</span>
      <small class="text-muted">${new Date().toLocaleTimeString()}</small>
    </div>
  `;
}

function getStatusText(status) {
  switch (status) {
    case 'preparing': return '🔄 กำลังเตรียม...';
    case 'restarting': return '🔄 รีสตาร์ท LINE...';
    case 'detecting-friends': return '🔍 นับเพื่อน...';
    case 'running': return '▶️ กำลังส่ง';
    case 'paused': return '⏸️ พัก';
    case 'stopped': return '⏹️ หยุด';
    case 'complete': return '✅ เสร็จสิ้น';
    case 'error': return '❌ ผิดพลาด';
    default: return '⏳ รอ';
  }
}

function getProgressBarClass(status) {
  switch (status) {
    case 'running': return 'bg-primary';
    case 'paused': return 'bg-warning';
    case 'complete': return 'bg-success';
    case 'error': return 'bg-danger';
    case 'stopped': return 'bg-secondary';
    default: return 'bg-info';
  }
}

function getProgressPercent(progress) {
  if (!progress.total || progress.total === 0) return 0;
  return Math.round((progress.current / progress.total) * 100);
}

// ==================== GLOBAL BUTTON STATE ====================

function updateGlobalButtons() {
  const isAnyRunning = Object.values(instanceProgress).some(p => p.isRunning);
  const isAnyPaused = Object.values(instanceProgress).some(p => p.isPaused);
  
  const btnStart = document.getElementById("btn-start");
  const btnPauseAll = document.getElementById("btn-pause-all");
  const btnResumeAll = document.getElementById("btn-resume-all");
  const btnStopAll = document.getElementById("btn-stop-all");
  const btnResetAll = document.getElementById("btn-reset-all");
  const btnRefresh = document.getElementById("btn-refresh");
  
  if (btnStart) btnStart.disabled = isAnyRunning;
  if (btnPauseAll) btnPauseAll.disabled = !isAnyRunning || isAnyPaused;
  if (btnResumeAll) btnResumeAll.disabled = !isAnyPaused;
  if (btnStopAll) btnStopAll.disabled = !isAnyRunning;
  if (btnResetAll) btnResetAll.disabled = isAnyRunning;
  if (btnRefresh) btnRefresh.disabled = isAnyRunning;
}

// ==================== API FUNCTIONS ====================

async function refreshInstances() {
  addLog("กำลังตรวจหา instances...", "info");
  try {
    const res = await fetch("/api/instances");
    const data = await res.json();
    if (data.success) {
      instances = data.instances;
      renderInstanceCards();
      addLog(`พบ ${instances.length} instance(s)`, "success");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function startSending() {
  const message = document.getElementById("message").value;
  const parallel = document.getElementById("send-mode").value === "parallel";
  const sendAll = document.getElementById("sendAllFriends").checked;
  const speed = document.querySelector('input[name="speed"]:checked')?.value || 'fast';
  
  if (!message) {
    alert("กรุณาใส่ข้อความ");
    return;
  }

  if (instances.length === 0) {
    alert("ไม่พบ instance กด Refresh ก่อน");
    return;
  }

  // รวบรวม instances ที่เลือก และตรวจสอบสถานะ
  const selectedInstances = {};
  let hasSelected = false;
  const notReadyInstances = [];
  
  document.querySelectorAll('.instance-checkbox').forEach(checkbox => {
    const deviceId = checkbox.dataset.deviceId;
    if (checkbox.checked) {
      // หา instance data
      const inst = instances.find(i => i.deviceId === deviceId);
      
      // ตรวจสอบสถานะพร้อมหรือไม่
      if (!inst) {
        notReadyInstances.push({ deviceId, reason: "ไม่พบ instance" });
        return;
      }
      
      if (inst.lineStatus === "not_installed") {
        notReadyInstances.push({ deviceId, reason: "ไม่ได้ติดตั้ง LINE" });
        return;
      }
      
      if (inst.lineStatus === "offline" || inst.status !== "device") {
        notReadyInstances.push({ deviceId, reason: "อุปกรณ์ออฟไลน์" });
        return;
      }
      
      if (!inst.clipperAvailable) {
        notReadyInstances.push({ deviceId, reason: "ไม่พบ Clipper (จำเป็นสำหรับวางข้อความ)" });
        return;
      }
      
      hasSelected = true;
      
      // ดึงจำนวนเพื่อนจาก input (ถ้ามี)
      let friendCount = 9999;
      if (!sendAll) {
        const input = document.querySelector(`.friend-count-input[data-device-id="${deviceId}"]`);
        friendCount = input ? (parseInt(input.value) || 9999) : 9999;
      }
      
      selectedInstances[deviceId] = {
        enabled: true,
        friendCount: friendCount
      };
      
      // Reset progress for this instance
      instanceProgress[deviceId] = {
        isRunning: true,
        isPaused: false,
        current: 0,
        total: 0,
        sent: 0,
        failed: 0,
        status: 'preparing'
      };
    }
  });

  // แจ้งเตือน instances ที่ไม่พร้อม
  if (notReadyInstances.length > 0) {
    const errorMsg = notReadyInstances.map((item, idx) => {
      const instIdx = instances.findIndex(i => i.deviceId === item.deviceId) + 1;
      return `• Instance #${instIdx}: ${item.reason}`;
    }).join("\n");
    
    alert(`⚠️ Instance ต่อไปนี้ไม่พร้อมใช้งาน:\n\n${errorMsg}\n\nกรุณาแก้ไขหรือยกเลิกการเลือก`);
    return;
  }

  if (!hasSelected) {
    alert("กรุณาเลือกอย่างน้อย 1 instance");
    return;
  }

  // Update UI
  renderInstanceCards();
  updateGlobalButtons();
  
  addLog(`เริ่มส่งให้ ${Object.keys(selectedInstances).length} instance(s) (${speed})...`, "info");

  try {
    const res = await fetch("/api/send-selected", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, selectedInstances, parallel, sendAll, speed }),
    });
    
    const data = await res.json();
    if (!data.success) {
      addLog("ล้มเหลว: " + data.error, "error");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

// Per-instance controls
async function pauseInstance(deviceId) {
  try {
    await fetch(`/api/instances/${encodeURIComponent(deviceId)}/pause`, { method: "POST" });
    addLog(`[${getInstanceName(deviceId)}] หยุดชั่วคราว`, "warn");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function resumeInstance(deviceId) {
  try {
    await fetch(`/api/instances/${encodeURIComponent(deviceId)}/resume`, { method: "POST" });
    addLog(`[${getInstanceName(deviceId)}] ดำเนินการต่อ`, "info");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function stopInstance(deviceId) {
  if (!confirm(`หยุด Instance ${getInstanceName(deviceId)}?`)) return;
  try {
    await fetch(`/api/instances/${encodeURIComponent(deviceId)}/stop`, { method: "POST" });
    addLog(`[${getInstanceName(deviceId)}] หยุดแล้ว`, "warn");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function resetInstance(deviceId) {
  if (!confirm(`รีเซ็ต Instance ${getInstanceName(deviceId)}?`)) return;
  try {
    await fetch(`/api/instances/${encodeURIComponent(deviceId)}/reset`, { method: "POST" });
    addLog(`[${getInstanceName(deviceId)}] รีเซ็ตแล้ว`, "info");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

// All instances controls
async function pauseAll() {
  try {
    await fetch("/api/pause-all", { method: "POST" });
    addLog("หยุดชั่วคราวทั้งหมด", "warn");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function resumeAll() {
  try {
    await fetch("/api/resume-all", { method: "POST" });
    addLog("ดำเนินการต่อทั้งหมด", "info");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function stopAll() {
  if (!confirm("แน่ใจว่าต้องการหยุดทั้งหมด?")) return;
  try {
    await fetch("/api/stop-all", { method: "POST" });
    addLog("หยุดทั้งหมดแล้ว", "warn");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function resetAll() {
  if (!confirm("แน่ใจว่าต้องการรีเซ็ตทั้งหมด?")) return;
  try {
    await fetch("/api/reset-all", { method: "POST" });
    instanceProgress = {};
    renderInstanceCards();
    addLog("รีเซ็ตทั้งหมดแล้ว", "info");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

// Checkbox change handler - เก็บสถานะไว้
function onCheckboxChange(deviceId, checked) {
  instanceChecked[deviceId] = checked;
}

// Select all / none
function selectAllInstances() {
  document.querySelectorAll('.instance-checkbox').forEach(cb => {
    cb.checked = true;
    instanceChecked[cb.dataset.deviceId] = true;
  });
}

function selectNoneInstances() {
  document.querySelectorAll('.instance-checkbox').forEach(cb => {
    cb.checked = false;
    instanceChecked[cb.dataset.deviceId] = false;
  });
}

// ==================== LOG FUNCTIONS ====================

function addLog(message, type = "info") {
  const logBox = document.getElementById("log-box");
  if (!logBox) return;
  
  if (logBox.querySelector(".text-muted")) {
    logBox.innerHTML = "";
  }
  
  const p = document.createElement("p");
  p.className = `log-${type}`;
  p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBox.appendChild(p);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLogs() {
  const logBox = document.getElementById("log-box");
  if (logBox) {
    logBox.innerHTML = '<p class="text-muted">รอ logs...</p>';
  }
}

// ==================== INIT ====================

// Auto-refresh instance status ทุก 5 วินาที ผ่าน Socket
let autoRefreshInterval = null;

function requestStatusRefresh() {
  // ไม่ refresh ถ้ากำลังทำงานอยู่
  if (Object.values(instanceProgress).some(p => p.isRunning)) return;
  
  // ส่ง request ผ่าน socket
  socket.emit("refresh-status");
}

// รับ status update จาก server
socket.on("status-update", (data) => {
  if (data && data.instances) {
    data.instances.forEach(newInst => {
      const idx = instances.findIndex(i => i.deviceId === newInst.deviceId);
      if (idx >= 0) {
        // ไม่อัพเดท status ถ้า instance นั้นกำลังทำงานอยู่
        const progress = instanceProgress[newInst.deviceId];
        if (progress && progress.isRunning) {
          return; // ข้าม instance นี้
        }
        
        instances[idx].lineStatus = newInst.lineStatus;
        instances[idx].statusType = newInst.statusType;
        instances[idx].status = newInst.status;
        instances[idx].clipperAvailable = newInst.clipperAvailable;
      }
    });
    updateInstanceStatusBadges();
  }
});

function updateInstanceStatusBadges() {
  instances.forEach((inst, idx) => {
    // ไม่อัพเดท badge ถ้า instance กำลังทำงานอยู่
    const progress = instanceProgress[inst.deviceId];
    if (progress && progress.isRunning) {
      return; // ข้าม instance นี้
    }
    
    const card = document.querySelector(`.instance-card[data-device-id="${inst.deviceId}"]`);
    if (!card) return;
    
    // หา badge (เป็น span.badge)
    const badge = card.querySelector('.card-header .badge');
    if (badge) {
      const { className, text } = getStatusBadgeInfo(inst.lineStatus);
      badge.className = `badge ${className}`;
      badge.textContent = text;
    }
    
    // อัพเดท clipper icon
    const clipperIcon = card.querySelector('.bi-clipboard-check, .bi-clipboard-x');
    if (clipperIcon) {
      if (inst.clipperAvailable) {
        clipperIcon.className = 'bi bi-clipboard-check text-success';
        clipperIcon.title = 'Clipper OK';
      } else {
        clipperIcon.className = 'bi bi-clipboard-x text-danger';
        clipperIcon.title = 'No Clipper';
      }
    }
  });
}

function getStatusBadgeInfo(lineStatus) {
  switch (lineStatus) {
    case "foreground":
      return { className: "bg-success", text: "พร้อม" };
    case "background":
      return { className: "bg-warning text-dark", text: "เบื้องหลัง" };
    case "stopped":
      return { className: "bg-danger", text: "ปิดอยู่" };
    case "not_installed":
      return { className: "bg-dark", text: "ไม่มี LINE" };
    default:
      return { className: "bg-secondary", text: "ออฟไลน์" };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Setup send all toggle
  const toggle = document.getElementById("sendAllFriends");
  if (toggle) {
    toggle.addEventListener("change", () => {
      const info = document.getElementById("send-all-info");
      if (info) {
        info.style.display = toggle.checked ? "block" : "none";
      }
      // Toggle friend count inputs
      document.querySelectorAll('.friend-count-wrapper').forEach(wrapper => {
        wrapper.style.display = toggle.checked ? 'none' : 'block';
      });
    });
  }
  
  // Speed button highlight
  document.querySelectorAll('input[name="speed"]').forEach(radio => {
    radio.addEventListener('change', function() {
      document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
      this.nextElementSibling.classList.add('active');
    });
  });
  document.querySelector('input[name="speed"]:checked')?.nextElementSibling?.classList.add('active');
  
  // Initial state
  updateGlobalButtons();
  
  // เริ่ม auto-refresh status (อ่านค่าจาก config หรือ default 5 วินาที)
  const refreshInterval = (window.APP_CONFIG?.autoRefreshInterval || 5) * 1000;
  autoRefreshInterval = setInterval(requestStatusRefresh, refreshInterval);
});