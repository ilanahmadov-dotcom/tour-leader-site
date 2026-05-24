// SIMPLE SETUP:
// The site works in local mode immediately.
// To make all phones sync, create Firebase project and paste your config below.
// Replace null with your Firebase config object.
const firebaseConfig = {
  apiKey: "AIzaSyDfzyKcnRFl22bv7AZcAMMMpZ54FgKavo8",
  authDomain: "tour-leader-site.firebaseapp.com",
  projectId: "tour-leader-site",
  storageBucket: "tour-leader-site.firebasestorage.app",
  messagingSenderId: "759437911729",
  appId: "1:759437911729:web:f5b9e086d35ae66e772490",
  measurementId: "G-EHPXM4M8TC"
};

let db = null;
let selectedGroupId = localStorage.getItem("selectedGroupId") || null;
let groups = {};
let timerInterval = null;
let unsubscribe = null;

const DEFAULT_GROUPS = Array.from({ length: 20 }, (_, i) => {
  const id = `group${i + 1}`;
  return [id, {
    name: `Group ${i + 1}`,
    status: "active",
    lastStatusTime: "",
    route: []
  }];
});

const $ = (id) => document.getElementById(id);

init();

async function init() {
  fillGroupSelect();
  wireButtons();
  await initStorage();

  if (selectedGroupId) showDashboard(selectedGroupId);
  renderOverview();
}

function fillGroupSelect() {
  const select = $("groupSelect");
  for (let i = 1; i <= 20; i++) {
    const opt = document.createElement("option");
    opt.value = `group${i}`;
    opt.textContent = `Group ${i}`;
    select.appendChild(opt);
  }
  if (selectedGroupId) select.value = selectedGroupId;
}

function wireButtons() {
  $("enterBtn").addEventListener("click", () => showDashboard($("groupSelect").value));
  $("changeGroupBtn").addEventListener("click", () => {
    selectedGroupId = null;
    localStorage.removeItem("selectedGroupId");
    $("setupCard").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
  });
  $("addStopBtn").addEventListener("click", () => addStopRow());
  $("saveRouteBtn").addEventListener("click", saveRouteFromUI);
  $("refreshBtn").addEventListener("click", renderOverview);
  $("notifyBtn").addEventListener("click", requestNotifications);
  document.querySelectorAll(".statusBtn").forEach(btn => {
    btn.addEventListener("click", () => setStatus(btn.dataset.status));
  });
}

async function initStorage() {
  groups = loadLocalGroups();

  if (!firebaseConfig) {
    $("syncStatus").textContent = "Offline/local mode";
    return;
  }

  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, doc, setDoc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const app = initializeApp(firebaseConfig);
    db = { firestore: getFirestore(app), doc, setDoc, onSnapshot };
    $("syncStatus").textContent = "Online sync enabled";

    const ref = db.doc(db.firestore, "tour", "state");
    unsubscribe = db.onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        groups = snap.data().groups || groups;
        saveLocalGroups(groups);
      } else {
        await saveAllGroups();
      }
      if (selectedGroupId) {
        loadRouteIntoUI();
        updateCurrentDisplay();
      }
      renderOverview();
    });
  } catch (err) {
    console.error(err);
    $("syncStatus").textContent = "Firebase error - local mode";
  }
}

function loadLocalGroups() {
  const saved = localStorage.getItem("tourGroups");
  if (saved) return JSON.parse(saved);
  const obj = Object.fromEntries(DEFAULT_GROUPS);
  localStorage.setItem("tourGroups", JSON.stringify(obj));
  return obj;
}

function saveLocalGroups(data) {
  localStorage.setItem("tourGroups", JSON.stringify(data));
}

async function saveAllGroups() {
  saveLocalGroups(groups);
  if (db) {
    const ref = db.doc(db.firestore, "tour", "state");
    await db.setDoc(ref, { groups }, { merge: true });
  }
}

function showDashboard(groupId) {
  selectedGroupId = groupId;
  localStorage.setItem("selectedGroupId", groupId);
  $("setupCard").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("groupName").textContent = groups[groupId]?.name || groupId;
  loadRouteIntoUI();
  updateCurrentDisplay();
  renderOverview();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateCurrentDisplay, 1000);
}

function addStopRow(stop = {}) {
  const tpl = $("stopTemplate").content.cloneNode(true);
  const el = tpl.querySelector(".stop");
  el.querySelector(".stationInput").value = stop.station || "";
  el.querySelector(".startInput").value = stop.start || "";
  el.querySelector(".durationInput").value = stop.duration || 15;
  el.querySelector(".removeStop").addEventListener("click", () => el.remove());
  $("routeList").appendChild(el);
}

function loadRouteIntoUI() {
  $("routeList").innerHTML = "";
  const route = groups[selectedGroupId]?.route || [];
  if (!route.length) {
    addStopRow({ station: "Station 1", start: "09:00", duration: 15 });
    addStopRow({ station: "Station 2", start: "09:20", duration: 15 });
    return;
  }
  route.forEach(addStopRow);
}

async function saveRouteFromUI() {
  const stops = [...document.querySelectorAll(".stop")].map(stop => ({
    station: stop.querySelector(".stationInput").value.trim(),
    start: stop.querySelector(".startInput").value,
    duration: Number(stop.querySelector(".durationInput").value || 15)
  })).filter(s => s.station && s.start);

  groups[selectedGroupId] ||= { name: selectedGroupId, status: "active", route: [] };
  groups[selectedGroupId].route = stops;
  await saveAllGroups();
  updateCurrentDisplay();
  renderOverview();
  alert("Route saved.");
}

async function setStatus(status) {
  groups[selectedGroupId] ||= { name: selectedGroupId, route: [] };
  groups[selectedGroupId].status = status;
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  await saveAllGroups();
  $("lastStatus").textContent = `Status sent: ${status}`;
  renderOverview();
}

function getCurrentStop(group) {
  const route = group?.route || [];
  if (!route.length) return { current: null, next: null, ended: false };

  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  for (let i = 0; i < route.length; i++) {
    const start = timeToMinutes(route[i].start);
    const end = start + Number(route[i].duration || 15);
    if (minutesNow >= start && minutesNow < end) {
      return { current: route[i], next: route[i + 1] || null, secondsLeft: Math.max(0, Math.round((end - minutesNow) * 60)), ended: false };
    }
    if (minutesNow < start) {
      return { current: null, next: route[i], secondsLeft: Math.round((start - minutesNow) * 60), ended: false };
    }
  }
  return { current: route[route.length - 1], next: null, secondsLeft: 0, ended: true };
}

function updateCurrentDisplay() {
  const group = groups[selectedGroupId];
  const state = getCurrentStop(group);

  if (!state.current && state.next) {
    $("currentStation").textContent = "Not started yet";
    $("timeLeft").textContent = formatSeconds(state.secondsLeft);
    $("currentWindow").textContent = `Starts at ${state.next.start}`;
    $("nextStation").textContent = `First: ${state.next.station}`;
    return;
  }

  if (!state.current) {
    $("currentStation").textContent = "No route yet";
    $("timeLeft").textContent = "--:--";
    $("currentWindow").textContent = "Add your route below.";
    $("nextStation").textContent = "Next: -";
    return;
  }

  $("currentStation").textContent = state.current.station;
  $("timeLeft").textContent = state.ended ? "00:00" : formatSeconds(state.secondsLeft);
  $("currentWindow").textContent = state.ended ? "Route finished." : `${state.current.start} for ${state.current.duration} minutes`;
  $("nextStation").textContent = state.next ? `Next: ${state.next.station} at ${state.next.start}` : "Next: none";

  if (state.secondsLeft === 0 || state.ended) {
    $("timeLeft").classList.add("alertDone");
    maybeNotify("Station time finished", state.next ? `Move to ${state.next.station}` : "Route finished");
  } else {
    $("timeLeft").classList.remove("alertDone");
  }
}

function renderOverview() {
  const byStation = {};
  for (const [id, group] of Object.entries(groups)) {
    const state = getCurrentStop(group);
    const station = state.current?.station || state.next?.station || "No route";
    byStation[station] ||= [];
    byStation[station].push({ id, group, state });
  }

  const container = $("stationsOverview");
  container.innerHTML = "";
  Object.keys(byStation).sort().forEach(station => {
    const box = document.createElement("div");
    const list = byStation[station];
    box.className = "stationBox" + (list.length > 3 ? " over" : "");
    box.innerHTML = `<div class="stationTitle"><span>${escapeHtml(station)}</span><span>${list.length} groups</span></div>`;
    list.forEach(({ group }) => {
      const pill = document.createElement("span");
      const status = group.status || "active";
      pill.className = "groupPill" + (status === "waiting" ? " waiting" : status === "delayed" ? " delayed" : status === "finished early" ? " good" : "");
      pill.textContent = `${group.name || "Group"} - ${status}`;
      box.appendChild(pill);
    });
    container.appendChild(box);
  });
}

function timeToMinutes(t) {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    alert("Notifications are not supported on this phone/browser.");
    return;
  }
  const permission = await Notification.requestPermission();
  alert(permission === "granted" ? "Alerts enabled." : "Alerts were not allowed.");
}

let lastNotificationMinute = "";
function maybeNotify(title, body) {
  const key = new Date().toISOString().slice(0, 16);
  if (lastNotificationMinute === key) return;
  lastNotificationMinute = key;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
  if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
