// LINE Web Automation Frontend - Multi Instance with Progress Modal
// รองรับ Unicode/Thai/Emoji/URL และ Speed Settings

const socket = io();
let instances = [];
let sendingProgress = {
  isRunning: false,
  current: 0,
  total: 0,
  sent: [],
  failed: []
};

// ==================== SOCKET EVENTS ====================

socket.on("connect", () => {
  addLog("เชื่อมต่อ server สำเร็จ", "info");
});

socket.on("disconnect", () => {
  addLog("หลุดการเชื่อมต่อจาก server", "error");
});

socket.on("init", (data) => {
  instances = data.instances || [];
  renderInstances();
  renderInstanceSettings();
});

socket.on("instances", (data) => {
  instances = data;
  renderInstances();
  renderInstanceSettings();
});

socket.on("log", (data) => {
  addLog(data.message, data.type);
});

socket.on("status", (data) => {
  handleStatusUpdate(data);
});

socket.on("multi-start", (data) => {
  addLog(`เริ่มส่งจาก ${data.totalInstances} instances`, "info");
});

socket.on("multi-complete", (data) => {
  addLog(`เสร็จสิ้น: ${data.successMessages}/${data.totalMessages} ข้อความ`, "success");
  completeProgress();
});

socket.on("instance-updated", (data) => {
  const idx = instances.findIndex(i => i.deviceId === data.deviceId);
  if (idx !== -1) {
    instances[idx] = data;
    renderInstances();
    renderInstanceSettings();
  }
});

// ==================== RENDER FUNCTIONS ====================

function renderInstances() {
  const container = document.getElementById("instances-list");
  
  if (instances.length === 0) {
    container.innerHTML = `
      <div class="text-center p-3 text-muted">
        <i class="bi bi-phone-vibrate"></i>
        <p class="mb-0">ไม่พบ instance</p>
        <small>เปิด BlueStacks แล้วกด Refresh</small>
      </div>
    `;
    return;
  }

  container.innerHTML = instances.map((inst, idx) => {
    let statusClass = "bg-secondary";
    let statusText = inst.lineStatusText || "Unknown";
    
    switch (inst.status) {
      case "ready":
        statusClass = "bg-success";
        break;
      case "background":
        statusClass = "bg-warning";
        break;
      case "stopped":
        statusClass = "bg-secondary";
        break;
      case "no-line":
        statusClass = "bg-danger";
        break;
    }
    
    return `
      <div class="instance-item" data-device="${inst.deviceId}">
        <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
          <div>
            <strong><i class="bi bi-phone"></i> #${idx + 1}</strong>
            <br>
            <small class="text-muted">${inst.deviceId}</small>
          </div>
          <div class="text-end">
            <span class="badge ${statusClass}">${statusText}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("total-instances").textContent = instances.length;
}

function renderInstanceSettings() {
  const container = document.getElementById("instance-settings");
  
  if (instances.length === 0) {
    container.innerHTML = `<p class="text-muted text-center">ไม่พบ instance กด Refresh</p>`;
    return;
  }

  container.innerHTML = `
    <div class="row">
      ${instances.map((inst, idx) => {
        const isReady = inst.status === "ready";
        const needsOpen = inst.status === "background" || inst.status === "stopped";
        
        let statusBadge = '';
        if (isReady) {
          statusBadge = '<span class="badge bg-success ms-1">พร้อม</span>';
        } else if (inst.status === "background") {
          statusBadge = '<span class="badge bg-warning ms-1">Background</span>';
        } else if (inst.status === "stopped") {
          statusBadge = '<span class="badge bg-secondary ms-1">ปิดอยู่</span>';
        } else {
          statusBadge = '<span class="badge bg-danger ms-1">ไม่มี LINE</span>';
        }
        
        return `
        <div class="col-md-6 mb-2">
          <div class="input-group input-group-sm">
            <span class="input-group-text">
              <i class="bi bi-phone"></i> #${idx + 1}
            </span>
            <input type="number" class="form-control friends-count" 
                   data-device="${inst.deviceId}" 
                   placeholder="จำนวนเพื่อน" min="1" value="10">
            <button class="btn ${needsOpen ? 'btn-success' : 'btn-outline-secondary'}" type="button" 
                    onclick="startLineInstance('${inst.deviceId}')"
                    title="เปิด LINE App">
              <i class="bi bi-play-fill"></i>
            </button>
          </div>
          <small class="text-muted">${inst.deviceId} ${statusBadge}</small>
        </div>
      `}).join("")}
    </div>
  `;
}

function setupSendAllToggle() {
  const toggle = document.getElementById("sendAllFriends");
  const sendAllInfo = document.getElementById("send-all-info");
  const instanceSettings = document.getElementById("instance-settings");
  
  if (!toggle) return;
  
  toggle.addEventListener("change", () => {
    if (toggle.checked) {
      sendAllInfo.style.display = "block";
      instanceSettings.style.display = "none";
    } else {
      sendAllInfo.style.display = "none";
      instanceSettings.style.display = "block";
    }
  });
}

// ==================== PROGRESS MODAL ====================

function showProgressModal(total) {
  const isAll = total === "All";
  
  sendingProgress = {
    isRunning: true,
    current: 0,
    total: isAll ? 0 : total,
    isAll: isAll,
    sent: [],
    failed: []
  };
  
  const modalHtml = `
    <div class="modal fade" id="progressModal" data-bs-backdrop="static" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">
              <i class="bi bi-send-fill"></i> กำลังส่งข้อความ...
            </h5>
          </div>
          <div class="modal-body">
            <div class="text-center mb-3">
              <div class="display-4 fw-bold text-primary" id="progress-number">
                ${isAll ? '0' : `0 / ${total}`}
              </div>
              <small class="text-muted">${isAll ? 'ข้อความที่ส่ง (ส่งให้เพื่อนทั้งหมด)' : 'ข้อความที่ส่ง'}</small>
              <div class="mt-2" id="eta-display">
                <small class="text-muted"><i class="bi bi-clock"></i> กำลังคำนวณเวลา...</small>
              </div>
            </div>
            
            <div class="progress mb-3" style="height: 25px;">
              <div class="progress-bar progress-bar-striped progress-bar-animated" 
                   role="progressbar" style="width: ${isAll ? '100%' : '0%'}" id="progress-bar">
                ${isAll ? 'กำลังส่ง...' : '0%'}
              </div>
            </div>
            
            <div class="d-flex justify-content-center gap-4 mb-3">
              <div class="text-center">
                <div class="fs-4 text-success fw-bold" id="modal-success-count">0</div>
                <small class="text-muted">สำเร็จ</small>
              </div>
              <div class="text-center">
                <div class="fs-4 text-danger fw-bold" id="modal-failed-count">0</div>
                <small class="text-muted">ล้มเหลว</small>
              </div>
            </div>
            
            <div class="alert alert-info mb-0" id="current-action">
              <i class="bi bi-hourglass-split"></i> เตรียมส่ง...
            </div>
            
            <div class="mt-3" style="max-height: 200px; overflow-y: auto;" id="progress-list">
            </div>
          </div>
          <div class="modal-footer" id="modal-footer" style="display: none;">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const existingModal = document.getElementById("progressModal");
  if (existingModal) {
    existingModal.remove();
  }
  
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById("progressModal"));
  modal.show();
}

function updateProgress(current, total, friendNum, success, eta) {
  sendingProgress.current = current;
  
  if (success) {
    sendingProgress.sent.push(friendNum);
  } else {
    sendingProgress.failed.push(friendNum);
  }
  
  const numberEl = document.getElementById("progress-number");
  if (numberEl) {
    if (sendingProgress.isAll) {
      numberEl.textContent = `${sendingProgress.sent.length + sendingProgress.failed.length}`;
    } else {
      numberEl.textContent = `${current} / ${total}`;
    }
  }
  
  // Update ETA
  const etaEl = document.getElementById("eta-display");
  if (etaEl && eta !== undefined) {
    const mins = Math.floor(eta / 60);
    const secs = eta % 60;
    etaEl.innerHTML = `<small class="text-muted"><i class="bi bi-clock"></i> เหลืออีกประมาณ ${mins > 0 ? mins + ' นาที ' : ''}${secs} วินาที</small>`;
  }
  
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) {
    if (sendingProgress.isAll) {
      progressBar.style.width = "100%";
      progressBar.textContent = `กำลังส่ง... (${sendingProgress.sent.length} สำเร็จ)`;
    } else {
      const percent = Math.round((current / total) * 100);
      progressBar.style.width = percent + "%";
      progressBar.textContent = percent + "%";
    }
  }
  
  const successEl = document.getElementById("modal-success-count");
  const failedEl = document.getElementById("modal-failed-count");
  if (successEl) successEl.textContent = sendingProgress.sent.length;
  if (failedEl) failedEl.textContent = sendingProgress.failed.length;
  
  const actionEl = document.getElementById("current-action");
  if (actionEl) {
    if (success) {
      actionEl.className = "alert alert-success mb-0";
      actionEl.innerHTML = `<i class="bi bi-check-circle"></i> ส่งให้เพื่อน #${friendNum} สำเร็จ!`;
    } else {
      actionEl.className = "alert alert-danger mb-0";
      actionEl.innerHTML = `<i class="bi bi-x-circle"></i> ส่งให้เพื่อน #${friendNum} ไม่สำเร็จ`;
    }
  }
  
  const listEl = document.getElementById("progress-list");
  if (listEl) {
    const item = document.createElement("div");
    item.className = `d-flex justify-content-between align-items-center p-2 border-bottom ${success ? 'bg-success bg-opacity-10' : 'bg-danger bg-opacity-10'}`;
    item.innerHTML = `
      <span>
        <i class="bi ${success ? 'bi-check-circle text-success' : 'bi-x-circle text-danger'}"></i>
        เพื่อน #${friendNum}
      </span>
      <span class="badge ${success ? 'bg-success' : 'bg-danger'}">${success ? 'สำเร็จ' : 'ล้มเหลว'}</span>
    `;
    listEl.insertBefore(item, listEl.firstChild);
  }
  
  document.getElementById("total-sent").textContent = sendingProgress.sent.length;
  document.getElementById("total-failed").textContent = sendingProgress.failed.length;
}

function completeProgress() {
  sendingProgress.isRunning = false;
  
  const actionEl = document.getElementById("current-action");
  if (actionEl) {
    actionEl.className = "alert alert-success mb-0";
    actionEl.innerHTML = `
      <i class="bi bi-check-circle-fill"></i> 
      <strong>เสร็จสิ้น!</strong> ส่งสำเร็จ ${sendingProgress.sent.length} ข้อความ, ล้มเหลว ${sendingProgress.failed.length}
    `;
  }
  
  const etaEl = document.getElementById("eta-display");
  if (etaEl) {
    etaEl.innerHTML = `<small class="text-success"><i class="bi bi-check-circle"></i> เสร็จสิ้นแล้ว!</small>`;
  }
  
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) {
    progressBar.className = "progress-bar bg-success";
    progressBar.style.width = "100%";
    progressBar.textContent = "เสร็จสิ้น!";
  }
  
  const footer = document.getElementById("modal-footer");
  if (footer) {
    footer.style.display = "block";
  }
}

function handleStatusUpdate(data) {
  if (!data) return;
  
  if (data.type === "friends-detected") {
    sendingProgress.total = data.count;
    sendingProgress.isAll = false;
    
    const numberEl = document.getElementById("progress-number");
    if (numberEl) {
      numberEl.textContent = `0 / ${data.count}`;
    }
    
    const progressBar = document.getElementById("progress-bar");
    if (progressBar) {
      progressBar.style.width = "0%";
      progressBar.textContent = "0%";
      progressBar.className = "progress-bar progress-bar-striped progress-bar-animated";
    }
    
    const actionEl = document.getElementById("current-action");
    if (actionEl) {
      actionEl.className = "alert alert-info mb-0";
      actionEl.innerHTML = `<i class="bi bi-people"></i> พบเพื่อน ${data.count} คน เริ่มส่ง...`;
    }
    
    return;
  }
  
  if (data.type === "progress" || data.type === "sent") {
    const current = data.current || sendingProgress.current + 1;
    const total = data.total || sendingProgress.total;
    const friendNum = data.friendNum || current;
    const success = data.success !== false;
    const eta = data.eta;
    
    updateProgress(current, total, friendNum, success, eta);
  }
  
  if (data.type === "complete") {
    completeProgress();
  }
}

// ==================== API FUNCTIONS ====================

async function refreshInstances() {
  addLog("กำลังตรวจหา instances...", "info");
  try {
    const res = await fetch("/api/instances");
    const data = await res.json();
    if (data.success) {
      instances = data.instances;
      renderInstances();
      renderInstanceSettings();
      addLog(`พบ ${instances.length} instance(s)`, "success");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function startLineInstance(deviceId) {
  addLog(`กำลังเปิด LINE บน ${deviceId}...`, "info");
  try {
    const res = await fetch(`/api/instances/${encodeURIComponent(deviceId)}/start-line`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      addLog(`เปิด LINE สำเร็จบน ${deviceId}`, "success");
      setTimeout(refreshInstances, 2000);
    } else {
      addLog(`ล้มเหลว: ${data.error}`, "error");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function openLineAll() {
  if (instances.length === 0) {
    alert("ไม่พบ instance กด Refresh ก่อน");
    return;
  }
  
  addLog("กำลังเปิด LINE บนทุก instances...", "info");
  
  for (const inst of instances) {
    await startLineInstance(inst.deviceId);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  addLog("เสร็จสิ้น! ตรวจสอบว่า LINE อยู่ที่หน้า Home", "success");
  setTimeout(refreshInstances, 2000);
}

async function startSendingAll() {
  const message = document.getElementById("message").value;
  const parallel = document.getElementById("mode-parallel").checked;
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

  const friendsPerInstance = {};
  let totalFriends = 0;
  
  if (sendAll) {
    for (const inst of instances) {
      friendsPerInstance[inst.deviceId] = 9999;
      totalFriends += 9999;
    }
  } else {
    document.querySelectorAll(".friends-count").forEach(input => {
      const deviceId = input.dataset.device;
      const count = parseInt(input.value) || 0;
      if (count > 0) {
        friendsPerInstance[deviceId] = count;
        totalFriends += count;
      }
    });

    if (Object.keys(friendsPerInstance).length === 0) {
      alert("กรุณาระบุจำนวนเพื่อนอย่างน้อย 1 instance");
      return;
    }
  }

  showProgressModal(sendAll ? "All" : totalFriends);
  
  addLog(`เริ่มส่งให้ ${sendAll ? "เพื่อนทั้งหมด" : totalFriends + " คน"} (ความเร็ว: ${speed})...`, "info");

  try {
    const res = await fetch("/api/send-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, friendsPerInstance, parallel, sendAll, speed }),
    });
    
    const data = await res.json();
    if (!data.success) {
      addLog("ล้มเหลว: " + data.error, "error");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function pauseAll() {
  try {
    await fetch("/api/pause-all", { method: "POST" });
    addLog("หยุดชั่วคราวทุก instances", "warn");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function resumeAll() {
  try {
    await fetch("/api/resume-all", { method: "POST" });
    addLog("ดำเนินการต่อทุก instances", "info");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function stopAll() {
  if (confirm("แน่ใจว่าต้องการหยุดทั้งหมด?")) {
    try {
      await fetch("/api/stop-all", { method: "POST" });
      addLog("หยุดทุก instances แล้ว", "warn");
    } catch (error) {
      addLog("Error: " + error.message, "error");
    }
  }
}

async function resetAll() {
  if (confirm("แน่ใจว่าต้องการรีเซ็ตทั้งหมด?")) {
    try {
      await fetch("/api/reset-all", { method: "POST" });
      addLog("รีเซ็ตทุก instances แล้ว", "info");
      
      document.getElementById("total-sent").textContent = "0";
      document.getElementById("total-failed").textContent = "0";
    } catch (error) {
      addLog("Error: " + error.message, "error");
    }
  }
}

// ==================== LOG FUNCTIONS ====================

function addLog(message, type = "info") {
  const logBox = document.getElementById("log-box");
  
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
  document.getElementById("log-box").innerHTML = '<p class="text-muted">รอ logs...</p>';
}

// ==================== INIT ====================

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("send-form").addEventListener("submit", (e) => {
    e.preventDefault();
    startSendingAll();
  });

  setupSendAllToggle();
  refreshInstances();
  
  setInterval(refreshInstancesQuiet, 5000);
});

async function refreshInstancesQuiet() {
  try {
    const res = await fetch("/api/instances/info");
    const data = await res.json();
    if (data.success && data.instances) {
      instances = data.instances;
      renderInstances();
    }
  } catch (error) {}
}