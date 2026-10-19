const PRIMARY_SLOTS = [6, 10, 14, 18];
const SECONDARY_SLOTS = [3.5, 7.5, 11.5, 15.5];
const SLOT_HOURS = 2.5;
const BLOCKS = ["A", "B", "C", "D"];
const STORAGE_KEY = "loadReductionState.v1";

const defaultState = {
  stage: 0,
  block: 0,
  breakerAmps: 60,
  voltage: 230,
  batteryWh: 500,
  appliances: [
    { name: "Geyser", watts: 3000, qty: 1, hours: 1.5, essential: false },
    { name: "Fridge / Freezer", watts: 150, qty: 1, hours: 8, essential: true },
    { name: "Kettle", watts: 2000, qty: 1, hours: 0.25, essential: false },
    { name: "TV + decoder", watts: 120, qty: 1, hours: 5, essential: false },
    { name: "LED lights", watts: 60, qty: 5, hours: 4, essential: false },
    { name: "Wi-Fi router", watts: 12, qty: 1, hours: 24, essential: true },
    { name: "Laptop", watts: 60, qty: 1, hours: 4, essential: true },
  ],
};

let state = loadState();
let countdownTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.appliances)) return { ...defaultState, ...saved };
  } catch (e) {}
  return structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmtHour(h) {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function blocksOffInSlot(slotIndex, perSlot) {
  const off = [];
  for (let k = 0; k < perSlot; k++) off.push((slotIndex + k) % 4);
  return off;
}

function outagesForBlock(blockIndex, stage) {
  if (stage <= 0) return [];
  const primaryPerSlot = Math.min(stage, 4);
  const secondaryPerSlot = Math.max(0, stage - 4);
  const raw = [];

  PRIMARY_SLOTS.forEach((hour, i) => {
    if (blocksOffInSlot(i, primaryPerSlot).includes(blockIndex)) {
      raw.push({ start: hour, end: hour + SLOT_HOURS });
    }
  });

  SECONDARY_SLOTS.forEach((hour, i) => {
    if (secondaryPerSlot > 0 && blocksOffInSlot(i, secondaryPerSlot).includes(blockIndex)) {
      raw.push({ start: hour, end: hour + SLOT_HOURS });
    }
  });

  raw.sort((a, b) => a.start - b.start);
  const merged = [];
  raw.forEach((s) => {
    const last = merged[merged.length - 1];
    if (last && last.end >= s.start) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  });
  return merged;
}

function nextOutage(blockIndex, stage, fromDate) {
  const today = outagesForBlock(blockIndex, stage);
  const now = fromDate;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const s of today) {
    if (s.start * 60 > nowMin) return { ...s, dayOffset: 0 };
  }
  const tomorrow = outagesForBlock(blockIndex, stage);
  if (tomorrow.length) return { ...tomorrow[0], dayOffset: 1 };
  return null;
}

function stageLoadHours(stage) {
  if (stage <= 0) return 0;
  return outagesForBlock(state.block, stage).reduce((sum, s) => sum + (s.end - s.start), 0);
}

function el(id) {
  return document.getElementById(id);
}

function renderStages() {
  const wrap = el("stageChips");
  wrap.innerHTML = "";
  for (let s = 0; s <= 8; s++) {
    const b = document.createElement("button");
    b.className = "chip" + (state.stage === s ? " active" : "");
    b.textContent = s === 0 ? "Off" : "Stage " + s;
    b.addEventListener("click", () => {
      state.stage = s;
      saveState();
      renderAll();
    });
    wrap.appendChild(b);
  }

  const hours = stageLoadHours(state.stage);
  const nSlots = state.stage > 0 ? outagesForBlock(state.block, state.stage).length : 0;

  const pill = el("statusPill");
  pill.textContent =
    state.stage === 0 ? "No load shedding" : `Stage ${state.stage} active · ${fmtNum(hours)} h/day`;
  pill.className = "status-pill " + (state.stage === 0 ? "off" : "on");

  el("stageSummary").innerHTML =
    state.stage === 0
      ? "<strong>Power is on.</strong> Stage 0 — no load shedding scheduled right now. Use this time to charge devices and the geyser."
      : `<strong>Stage ${state.stage}:</strong> block ${BLOCKS[state.block]} gets a <strong>${fmtNum(
          hours
        )}-hour load reduction</strong> per day (${nSlots} load reduction${nSlots > 1 ? "s" : ""}). ` +
        `All 4 blocks rotate so every area shares the load reduction.`;
}

function renderBlocks() {
  const wrap = el("blockChips");
  wrap.innerHTML = "";
  BLOCKS.forEach((name, i) => {
    const b = document.createElement("button");
    b.className = "chip block-chip" + (state.block === i ? " active" : "");
    b.textContent = "Block " + name;
    b.addEventListener("click", () => {
      state.block = i;
      saveState();
      renderAll();
    });
    wrap.appendChild(b);
  });

  renderSchedule();
}

function renderSchedule() {
  const stage = state.stage;
  const block = state.block;
  const list = el("outageList");
  const nextBox = el("nextOutage");
  list.innerHTML = "";

  if (stage === 0) {
    el("reductionCount").textContent = "0 load reductions — stage 0";
    nextBox.innerHTML = '<span class="no-outage">&#10003; No outage — stage 0</span>';
    return;
  }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todaySlots = outagesForBlock(block, stage);
  const countBox = el("reductionCount");

  if (!todaySlots.length) {
    countBox.textContent = "";
    nextBox.innerHTML = `<span class="no-outage">&#10003; Block ${BLOCKS[block]} is spared at stage ${stage} today</span>`;
    return;
  }

  const totalHours = todaySlots.reduce((sum, s) => sum + (s.end - s.start), 0);
  countBox.textContent = `${fmtNum(totalHours)}-hour load reduction today for block ${BLOCKS[block]} · ${
    todaySlots.length
  } load reduction${todaySlots.length > 1 ? "s" : ""}`;

  const active = todaySlots.find((s) => nowMin >= s.start * 60 && nowMin < s.end * 60);

  if (active) {
    nextBox.innerHTML = `
      <div class="label">Now</div>
      <div class="value">Block ${BLOCKS[block]} is OFF &middot; ${fmtHour(active.start)} – ${fmtHour(active.end)}</div>
      <div class="duration">${durationLabel(active.end - active.start)}</div>
      <div class="countdown">Back on in ${formatDuration(active.end * 60 - nowMin)}</div>`;
  } else {
    const next = nextOutage(block, stage, now);
    const nextStartMin = next.dayOffset * 1440 + next.start * 60;
    const diffMin = nextStartMin - nowMin;
    nextBox.innerHTML = `
      <div class="label">Next outage for block ${BLOCKS[block]}</div>
      <div class="value">${next.dayOffset ? "Tomorrow " : "Today "}${fmtHour(next.start)} – ${fmtHour(next.end)}</div>
      <div class="duration">${durationLabel(next.end - next.start)}</div>
      <div class="countdown" id="countdownText">Starts in ${formatDuration(diffMin)}</div>`;
  }

  todaySlots.forEach((s) => {
    const li = document.createElement("li");
    const isNow = nowMin >= s.start * 60 && nowMin < s.end * 60;
    const isPast = nowMin >= s.end * 60;
    if (isNow) li.className = "now";
    else if (isPast) li.className = "past";
    const dur = s.end - s.start;
    li.innerHTML = `<span>${fmtHour(s.start)} – ${fmtHour(s.end)}</span><span class="tag">${dur}-hour load reduction${
      isNow ? " · OFF NOW" : isPast ? " · passed" : ""
    }</span>`;
    list.appendChild(li);
  });
}

function durationLabel(hours) {
  return `${fmtNum(hours)}-hour load reduction`;
}

function formatDuration(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (days > 0) return `${days}d ${h}h ${min}m`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

function applianceWatts(a) {
  return a.watts * a.qty;
}

function applianceKwh(a) {
  return (applianceWatts(a) * a.hours) / 1000;
}

function limits() {
  return state.breakerAmps * state.voltage;
}

function renderLoad() {
  const body = el("applianceBody");
  body.innerHTML = "";

  state.appliances.forEach((a, i) => {
    const tr = document.createElement("tr");
    if (a.essential) tr.className = "essential-row";
    tr.innerHTML = `
      <td>${escapeHtml(a.name)}</td>
      <td>${a.watts} W</td>
      <td>${a.qty}</td>
      <td>${a.hours}</td>
      <td>${applianceKwh(a).toFixed(2)}</td>
      <td class="check">${a.essential ? "&#10003;" : "&ndash;"}</td>`;
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.className = "dash";
    del.title = "Remove";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      state.appliances.splice(i, 1);
      saveState();
      renderAll();
    });
    td.appendChild(del);
    tr.appendChild(td);
    body.appendChild(tr);
  });

  const connected = state.appliances.reduce((sum, a) => sum + applianceWatts(a), 0);
  const kWh = state.appliances.reduce((sum, a) => sum + applianceKwh(a), 0);
  const limit = limits();

  el("gaugeText").textContent = `${connected.toLocaleString()} W connected`;
  el("limitText").textContent = `${limit.toLocaleString()} W limit`;

  const pct = limit > 0 ? (connected / limit) * 100 : 0;
  const bar = el("gaugeBar");
  bar.style.width = Math.min(100, pct) + "%";

  const warn = el("gaugeWarning");
  if (pct > 100) {
    warn.className = "gauge-warning danger";
    warn.textContent = `Over the breaker by ${(connected - limit).toLocaleString()} W — the main breaker will trip.`;
  } else if (pct > 85) {
    warn.className = "gauge-warning warn";
    warn.textContent = `At ${Math.round(pct)}% of breaker capacity — little headroom for surges.`;
  } else {
    warn.className = "gauge-warning";
    warn.textContent = "";
  }

  el("totals").innerHTML = `
    <span>Connected: <strong>${(connected / 1000).toFixed(2)} kW</strong></span>
    <span>Usage: <strong>${kWh.toFixed(2)} kWh/day</strong></span>
    <span>Essential items: <strong>${state.appliances.filter((a) => a.essential).length}</strong></span>`;
}

function renderPlan() {
  const limit = limits();
  const connected = state.appliances.reduce((s, a) => s + applianceWatts(a), 0);
  const essentialW = state.appliances.filter((a) => a.essential).reduce((s, a) => s + applianceWatts(a), 0);
  const kWh = state.appliances.reduce((s, a) => s + applianceKwh(a), 0);

  el("planEssentialW").textContent = `${essentialW.toLocaleString()} W`;

  if (essentialW === 0) {
    el("planRuntime").textContent = "No essentials";
  } else if (state.batteryWh <= 0) {
    el("planRuntime").textContent = "Add battery Wh";
  } else {
    const hrs = state.batteryWh / essentialW;
    el("planRuntime").textContent = hrs >= 1 ? `${hrs.toFixed(1)} h` : `${Math.round(hrs * 60)} min`;
  }

  const trimList = el("trimList");
  trimList.innerHTML = "";

  if (connected <= limit) {
    el("planTrim").textContent = "Nothing to cut";
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = `You are ${(
      (limit - connected) /
      1000
    ).toFixed(2)} kW under your ${state.breakerAmps} A breaker — all appliances can run together.`;
    trimList.appendChild(li);
    return;
  }

  const nonEssential = state.appliances
    .filter((a) => !a.essential)
    .sort((a, b) => applianceWatts(b) - applianceWatts(a));

  let running = connected;
  const toCut = [];
  for (const a of nonEssential) {
    if (running <= limit) break;
    toCut.push(a);
    running -= applianceWatts(a);
  }

  el("planTrim").textContent = `Cut ${(connected - limit).toLocaleString()} W`;
  toCut.forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `Switch off ${a.name} — saves ${applianceWatts(a).toLocaleString()} W`;
    trimList.appendChild(li);
  });
  if (running > limit) {
    const li = document.createElement("li");
    li.textContent = "Still over the limit — move essential items onto a battery/inverter or upgrade the breaker supply.";
    trimList.appendChild(li);
  }
}

function renderAll() {
  renderStages();
  renderBlocks();
  renderLoad();
  renderPlan();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

el("applianceForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = el("apName").value.trim();
  const watts = Number(el("apWatts").value);
  const qty = Math.max(1, Number(el("apQty").value) || 1);
  const hours = Math.min(24, Math.max(0, Number(el("apHours").value) || 0));
  if (!name || !watts || watts <= 0) return;
  state.appliances.push({ name, watts, qty, hours, essential: el("apEssential").checked });
  saveState();
  e.target.reset();
  el("apQty").value = 1;
  el("apHours").value = 1;
  renderAll();
});

["breakerAmps", "voltage", "batteryWh"].forEach((id) => {
  el(id).addEventListener("input", () => {
    state.breakerAmps = Math.max(10, Number(el("breakerAmps").value) || 60);
    state.voltage = Math.max(100, Number(el("voltage").value) || 230);
    state.batteryWh = Math.max(0, Number(el("batteryWh").value) || 0);
    saveState();
    renderLoad();
    renderPlan();
  });
});

function syncInputs() {
  el("breakerAmps").value = state.breakerAmps;
  el("voltage").value = state.voltage;
  el("batteryWh").value = state.batteryWh;
}

el("year").textContent = new Date().getFullYear();
syncInputs();
renderAll();

countdownTimer = setInterval(() => {
  renderSchedule();
}, 30000);
