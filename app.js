var firebaseConfig = {
  apiKey: "AIzaSyDfzyKcnRFl22bv7AZcAMMMpZ54FgKavo8",
  authDomain: "tour-leader-site.firebaseapp.com",
  projectId: "tour-leader-site",
  storageBucket: "tour-leader-site.firebasestorage.app",
  messagingSenderId: "759437911729",
  appId: "1:759437911729:web:f5b9e086d35ae66e772490",
  measurementId: "G-EHPXM4M8TC"
};

var LOCATIONS = [
  { id: "tzrif", name: "צריף בן גוריון", stations: [
    { id: "tzrif1", name: "מייצג אנימציה, בן גוריון מארח, ביתן 1", capacity: 1 },
    { id: "tzrif2", name: "מייצג אנימציה, בן גוריון מארח, ביתן 2", capacity: 1 },
    { id: "tzrif3", name: "הבית של בן גוריון", capacity: 1 },
    { id: "tzrif4", name: "בית הגבס", capacity: 1 },
    { id: "tzrif5", name: "מפה טופוגרפית", capacity: 1 },
    { id: "tzrif6", name: "סרטון מנהיגות", capacity: 1 },
    { id: "tzrif7", name: "בן גוריון במבחן הזמן", capacity: 1 },
    { id: "tzrif8", name: "ספסלים בחוץ, אפשר לשבת על הדשא", capacity: 9999 }
  ]},
  { id: "kever", name: "קבר בן גוריון", stations: [
    { id: "kever1", name: "הקבר", capacity: 2 },
    { id: "kever2", name: "הדשא", capacity: 9999 }
  ]}
];

var ALL_STATIONS = [];
for (var li = 0; li < LOCATIONS.length; li++) {
  for (var si = 0; si < LOCATIONS[li].stations.length; si++) {
    var s = LOCATIONS[li].stations[si];
    ALL_STATIONS.push({ id: s.id, name: s.name, capacity: s.capacity, locationId: LOCATIONS[li].id, locationName: LOCATIONS[li].name });
  }
}

var db = null;
var selectedGroupId = localStorage.getItem("selectedGroupId") || null;
var groups = {};
var messages = [];
var timerInterval = null;
var lastNotificationKey = "";
var seenMessageIds = JSON.parse(localStorage.getItem("seenMessageIds") || "{}");

function $(id) { return document.getElementById(id); }
function setSyncStatus(text) { var el = $("syncStatus"); if (el) el.textContent = text; }

function boot() {
  try {
    setSyncStatus("Local mode ready");
    fillLocationSelectSafe();
    restoreLeaderInputs();
    var local = loadLocalState();
    groups = normalizeGroups(local.groups || {});
    messages = normalizeMessages(local.messages || []);
    if (selectedGroupId && groups[selectedGroupId]) showDashboard(selectedGroupId);
    renderOverviewSafe();
    renderMessagesSafe();
    renderPlanSafe();
    loadFirebaseScripts();
  } catch (e) {
    setSyncStatus("Script error: " + e.message);
    alert("Site script error: " + e.message);
  }
}

function loadFirebaseScripts() {
  var appScript = document.createElement("script");
  appScript.src = "https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js";
  appScript.onload = function () {
    var fsScript = document.createElement("script");
    fsScript.src = "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js";
    fsScript.onload = initFirebaseSafe;
    fsScript.onerror = function () { setSyncStatus("Local mode only - Firebase script failed"); };
    document.head.appendChild(fsScript);
  };
  appScript.onerror = function () { setSyncStatus("Local mode only - Firebase script failed"); };
  document.head.appendChild(appScript);
}

function initFirebaseSafe() {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    setSyncStatus("Connecting to Firebase...");
    db.collection("tour").doc("state").onSnapshot(function (snap) {
      setSyncStatus("Online sync enabled");
      if (snap.exists) {
        var data = snap.data() || {};
        groups = normalizeGroups(data.groups || groups);
        messages = normalizeMessages(data.messages || messages);
        saveLocalState();
      } else {
        saveAllState(false);
      }
      updateCurrentDisplay();
      checkLiveCapacitySafe();
      renderOverviewSafe();
      renderMessagesSafe();
      renderPlanSafe();
      notifyNewMessagesForMe();
    }, function (err) {
      db = null;
      setSyncStatus("Firebase error: " + (err.code || err.message));
      alert("Firebase cannot sync. Check Firestore rules/test mode.");
    });
  } catch (e) { db = null; setSyncStatus("Firebase error: " + e.message); }
}

function restoreLeaderInputs() {
  if ($("leaderNameInput")) $("leaderNameInput").value = localStorage.getItem("leaderName") || "";
  if ($("bigGroupSelect")) $("bigGroupSelect").value = localStorage.getItem("bigGroup") || "A";
}

function fillLocationSelectSafe() {
  var select = $("locationSelect"); if (!select) return;
  select.innerHTML = "";
  for (var i = 0; i < LOCATIONS.length; i++) {
    var opt = document.createElement("option"); opt.value = LOCATIONS[i].id; opt.textContent = LOCATIONS[i].name; select.appendChild(opt);
  }
  fillStationSelectSafe();
}
function fillStationSelectSafe() {
  var locationSelect = $("locationSelect"), stationSelect = $("stationSelect"); if (!stationSelect) return;
  var locationId = locationSelect ? locationSelect.value : LOCATIONS[0].id;
  fillStationSelectElement(stationSelect, locationId, null);
  checkLiveCapacitySafe();
}
function fillStationSelectElement(select, locationId, selectedStationId) {
  select.innerHTML = "";
  var location = LOCATIONS[0];
  for (var i = 0; i < LOCATIONS.length; i++) if (LOCATIONS[i].id === locationId) location = LOCATIONS[i];
  for (var j = 0; j < location.stations.length; j++) {
    var opt = document.createElement("option"); opt.value = location.stations[j].id; opt.textContent = location.stations[j].name; select.appendChild(opt);
  }
  if (selectedStationId) select.value = selectedStationId;
}

function enterLeaderSafe() {
  try {
    var name = (( $("leaderNameInput") && $("leaderNameInput").value) || "").trim();
    var bigGroup = (($("bigGroupSelect") && $("bigGroupSelect").value) || "A");
    if (!name) { alert("Write your leader/team name first."); return; }
    var id = makeLeaderId(name, bigGroup);
    localStorage.setItem("leaderName", name); localStorage.setItem("bigGroup", bigGroup);
    if (!groups[id]) groups[id] = { name: name, bigGroup: bigGroup, status: "not started", lastStatusTime: "", active: null, waitingFor: null, routePlan: [], planIndex: 0, userCreated: true };
    groups[id].name = name; groups[id].bigGroup = bigGroup; groups[id].userCreated = true;
    selectedGroupId = id; localStorage.setItem("selectedGroupId", id);
    saveAllState(false); showDashboard(id);
  } catch (e) { alert("Enter failed: " + e.message); setSyncStatus("Enter error: " + e.message); }
}
function makeLeaderId(name, bigGroup) {
  var hash = 0, raw = String(bigGroup) + ":" + String(name).trim().toLowerCase();
  for (var i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash = hash | 0; }
  if (hash < 0) hash = -hash;
  return "leader-" + bigGroup + "-" + hash;
}

function loadLocalState() { try { return JSON.parse(localStorage.getItem("tourState") || "{}"); } catch (e) { return {}; } }
function saveLocalState() { localStorage.setItem("tourState", JSON.stringify({ groups: groups, messages: messages })); }
function normalizeGroups(data) {
  var merged = data || {};
  for (var id in merged) if (Object.prototype.hasOwnProperty.call(merged, id)) {
    var group = merged[id] || {};
    group.name = group.name || id;
    group.bigGroup = group.bigGroup || (id.indexOf("-B-") >= 0 ? "B" : "A");
    group.status = group.status || "not started";
    group.lastStatusTime = group.lastStatusTime || "";
    group.active = normalizeActive(group.active);
    group.waitingFor = normalizeWaiting(group.waitingFor);
    group.routePlan = normalizeRoutePlan(group.routePlan || []);
    group.planIndex = Number(group.planIndex || 0);
    merged[id] = group;
  }
  return merged;
}
function normalizeMessages(arr) { if (!arr || !arr.length) return []; return arr.slice(-80); }
function normalizeWaiting(waiting) { if (!waiting) return null; var st = getStationInfo(waiting.stationId || waiting.stationName); if (!st) return null; return { stationId: st.id, stationName: st.name, locationName: st.locationName, time: waiting.time || nowTime() }; }
function normalizeActive(active) {
  if (!active) return null; var station = getStationInfo(active.stationId || active.station || active.stationName); if (!station) return null;
  var startMs = Number(active.startMs || active.startedAt || new Date().getTime()); var duration = Number(active.duration || active.durationMinutes || 15);
  return { locationId: station.locationId, locationName: station.locationName, stationId: station.id, stationName: station.name, startMs: startMs, duration: duration, endMs: startMs + duration * 60 * 1000 };
}
function normalizeRoutePlan(plan) {
  var out = [];
  for (var i = 0; i < plan.length; i++) {
    var st = getStationInfo(plan[i].stationId || plan[i].stationName);
    if (st) out.push({ locationId: st.locationId, stationId: st.id, stationName: st.name, duration: Number(plan[i].duration || 15) });
  }
  return out;
}
function saveAllState(showError) {
  saveLocalState();
  if (!db) return false;
  db.collection("tour").doc("state").set({ groups: groups, messages: messages }, { merge: true }).then(function () { setSyncStatus("Online sync enabled"); }).catch(function (err) { setSyncStatus("Save failed: " + (err.code || err.message)); if (showError !== false) alert("Saved only on this phone. Firebase save failed."); });
  return true;
}

function showDashboard(groupId) {
  selectedGroupId = groupId; localStorage.setItem("selectedGroupId", groupId);
  if ($("setupCard")) $("setupCard").classList.add("hidden"); if ($("dashboard")) $("dashboard").classList.remove("hidden");
  if ($("groupName")) $("groupName").textContent = (groups[groupId].name || groupId) + " · Big Group " + (groups[groupId].bigGroup || "");
  updateCurrentDisplay(); checkLiveCapacitySafe(); renderOverviewSafe(); renderMessagesSafe(); renderPlanSafe();
  if (timerInterval) clearInterval(timerInterval); timerInterval = setInterval(function () { updateCurrentDisplay(); renderOverviewSafe(); }, 1000);
}
function changeLeaderSafe() { selectedGroupId = null; localStorage.removeItem("selectedGroupId"); if ($("setupCard")) $("setupCard").classList.remove("hidden"); if ($("dashboard")) $("dashboard").classList.add("hidden"); }

function addPlanStepSafe(step) {
  if (!selectedGroupId || !groups[selectedGroupId]) { alert("Enter your name first."); return; }
  groups[selectedGroupId].routePlan = groups[selectedGroupId].routePlan || [];
  groups[selectedGroupId].routePlan.push(step || { locationId: "tzrif", stationId: "tzrif1", duration: 15 });
  renderPlanSafe();
}
function renderPlanSafe() {
  var list = $("routePlanList"); if (!list || !selectedGroupId || !groups[selectedGroupId]) return;
  var plan = groups[selectedGroupId].routePlan || [];
  list.innerHTML = "";
  if (!plan.length) addPlanStepSafe({ locationId: "tzrif", stationId: "tzrif1", duration: 15 });
  plan = groups[selectedGroupId].routePlan || [];
  for (var i = 0; i < plan.length; i++) {
    var row = document.createElement("div"); row.className = "stop";
    row.innerHTML = '<label>Step ' + (i + 1) + ' location<select class="planLocation" data-i="' + i + '" onchange="planLocationChangedSafe(this)"></select></label><label>Station<select class="planStation stationInput" data-i="' + i + '" onchange="updatePlanFromUI()"></select></label><label>Minutes<input class="planDuration" data-i="' + i + '" type="number" min="1" max="180" value="' + (plan[i].duration || 15) + '" oninput="updatePlanFromUI()" /></label><button class="ghost" onclick="removePlanStepSafe(' + i + ')">Remove</button>';
    list.appendChild(row);
    var locSel = row.querySelector(".planLocation"), stSel = row.querySelector(".planStation");
    fillPlanLocationSelect(locSel, plan[i].locationId || "tzrif");
    fillStationSelectElement(stSel, locSel.value, plan[i].stationId);
  }
  renderPlanWarningsSafe();
}
function fillPlanLocationSelect(select, val) { select.innerHTML = ""; for (var i = 0; i < LOCATIONS.length; i++) { var opt = document.createElement("option"); opt.value = LOCATIONS[i].id; opt.textContent = LOCATIONS[i].name; select.appendChild(opt); } select.value = val || "tzrif"; }
function planLocationChangedSafe(sel) { var i = Number(sel.getAttribute("data-i")); var rows = document.querySelectorAll("#routePlanList .stop"); var stSel = rows[i].querySelector(".planStation"); fillStationSelectElement(stSel, sel.value, null); updatePlanFromUI(); }
function updatePlanFromUI() {
  if (!selectedGroupId || !groups[selectedGroupId]) return;
  var rows = document.querySelectorAll("#routePlanList .stop"), plan = [];
  for (var i = 0; i < rows.length; i++) {
    var loc = rows[i].querySelector(".planLocation").value, st = rows[i].querySelector(".planStation").value, dur = Number(rows[i].querySelector(".planDuration").value || 15), info = getStationInfo(st);
    if (info) plan.push({ locationId: loc, stationId: info.id, stationName: info.name, duration: dur });
  }
  groups[selectedGroupId].routePlan = plan;
  renderPlanWarningsSafe();
}
function removePlanStepSafe(i) { if (!groups[selectedGroupId]) return; groups[selectedGroupId].routePlan.splice(i, 1); renderPlanSafe(); }
function savePlanSafe() { updatePlanFromUI(); var conflicts = getPlanConflictsFor(selectedGroupId); var ok = true; if (conflicts.length) ok = confirm("Plan conflicts found:\n\n" + conflicts.slice(0,5).join("\n") + "\n\nSave anyway?"); if (!ok) return; var synced = saveAllState(); renderOverviewSafe(); alert(synced ? "Planned route saved and synced." : "Planned route saved only on this phone."); }
function loadNextPlanStepSafe() {
  if (!groups[selectedGroupId]) return;
  var plan = groups[selectedGroupId].routePlan || [], idx = Number(groups[selectedGroupId].planIndex || 0);
  if (!plan.length) { alert("No planned route yet."); return; }
  if (idx >= plan.length) idx = 0;
  var step = plan[idx], station = getStationInfo(step.stationId);
  if (!station) return;
  $("locationSelect").value = station.locationId; fillStationSelectSafe(); $("stationSelect").value = station.id; $("durationInput").value = step.duration || 15;
  groups[selectedGroupId].planIndex = idx + 1; saveAllState(false); checkLiveCapacitySafe(); alert("Loaded step " + (idx + 1) + ": " + station.name);
}
function getPlanConflictsFor(groupId) {
  var group = groups[groupId], plan = group ? (group.routePlan || []) : [], conflicts = [];
  for (var i = 0; i < plan.length; i++) {
    var station = getStationInfo(plan[i].stationId); if (!station || station.capacity >= 9999) continue;
    var count = 1, names = [];
    for (var id in groups) if (Object.prototype.hasOwnProperty.call(groups, id) && id !== groupId) {
      var otherPlan = groups[id].routePlan || [], other = otherPlan[i];
      if (other && other.stationId === station.id) { count++; names.push(groups[id].name); }
    }
    if (count > station.capacity) conflicts.push("Step " + (i+1) + " · " + station.name + " is over limit with: " + names.join(", "));
  }
  return conflicts;
}
function renderPlanWarningsSafe() { var box = $("planWarnings"); if (!box || !selectedGroupId) return; var conflicts = getPlanConflictsFor(selectedGroupId); box.innerHTML = ""; for (var i = 0; i < conflicts.length; i++) { var d = document.createElement("p"); d.className = "conflictText"; d.textContent = conflicts[i]; box.appendChild(d); } }

function startNowSafe() {
  if (!selectedGroupId || !groups[selectedGroupId]) { alert("Enter your name first."); return; }
  var station = getStationInfo($("stationSelect") ? $("stationSelect").value : ""); var duration = Number($("durationInput") ? $("durationInput").value : 15) || 15;
  if (!station) { alert("Choose a station first."); return; }
  var activeGroups = getActiveGroupsAtStation(station.id).filter(function (item) { return item.id !== selectedGroupId; });
  if (station.capacity < 9999 && activeGroups.length >= station.capacity) { var names = activeGroups.map(function (item) { return item.group.name; }).join(", "); if (!confirm(station.name + " is already full.\nCurrently there: " + names + "\n\nStart anyway?")) return; }
  var startMs = new Date().getTime(); groups[selectedGroupId].active = { locationId: station.locationId, locationName: station.locationName, stationId: station.id, stationName: station.name, startMs: startMs, duration: duration, endMs: startMs + duration * 60 * 1000 };
  groups[selectedGroupId].status = "active"; groups[selectedGroupId].waitingFor = null; groups[selectedGroupId].lastStatusTime = nowTime();
  var synced = saveAllState(); updateCurrentDisplay(); renderOverviewSafe(); renderMessagesSafe(); alert(synced ? "Started and synced." : "Started only on this phone.");
}
function finishStationSafe() { if (!groups[selectedGroupId]) return; var oldStation = groups[selectedGroupId].active ? groups[selectedGroupId].active.stationName : "station"; groups[selectedGroupId].active = null; groups[selectedGroupId].status = "finished early"; groups[selectedGroupId].lastStatusTime = nowTime(); sendMessageToWaitingForMyStation("free", "I finished at " + oldStation + ". You can enter now."); var synced = saveAllState(); updateCurrentDisplay(); renderOverviewSafe(); renderMessagesSafe(); alert(synced ? "Finished and synced." : "Finished only on this phone."); }
function waitingForStationSafe() { if (!selectedGroupId || !groups[selectedGroupId]) { alert("Enter your name first."); return; } var station = getStationInfo($("stationSelect") ? $("stationSelect").value : ""); if (!station) return; groups[selectedGroupId].status = "waiting"; groups[selectedGroupId].waitingFor = { stationId: station.id, stationName: station.name, locationName: station.locationName, time: nowTime() }; groups[selectedGroupId].lastStatusTime = nowTime(); var holders = getActiveGroupsAtStation(station.id).filter(function (item) { return item.id !== selectedGroupId; }); if (holders.length === 0) addMessage("system", selectedGroupId, "No one is marked inside " + station.name + ". You may be able to enter.", "info", station.id); for (var i = 0; i < holders.length; i++) addMessage(selectedGroupId, holders[i].id, groups[selectedGroupId].name + " is waiting for " + station.name + ".", "waiting", station.id); var synced = saveAllState(); renderOverviewSafe(); renderMessagesSafe(); alert(synced ? "Waiting message sent." : "Waiting saved only on this phone."); }
function delayedHereSafe() { if (!groups[selectedGroupId]) { alert("Enter your name first."); return; } groups[selectedGroupId].status = "delayed"; groups[selectedGroupId].lastStatusTime = nowTime(); var sent = sendMessageToWaitingForMyStation("delayed", groups[selectedGroupId].name + " is delayed at this station."); var synced = saveAllState(); renderOverviewSafe(); renderMessagesSafe(); alert(sent ? (synced ? "Delay sent to waiting leaders." : "Delay saved only on this phone.") : "No waiting leaders found. Delay status saved."); }
function generalDelayedSafe() { if (!groups[selectedGroupId]) { alert("Enter your name first."); return; } groups[selectedGroupId].status = "delayed"; groups[selectedGroupId].lastStatusTime = nowTime(); var synced = saveAllState(); renderOverviewSafe(); renderMessagesSafe(); alert(synced ? "General delay saved." : "General delay saved only on this phone."); }
function sendMessageToWaitingForMyStation(type, text) { if (!groups[selectedGroupId] || !groups[selectedGroupId].active) return 0; var stationId = groups[selectedGroupId].active.stationId, sent = 0; for (var id in groups) if (Object.prototype.hasOwnProperty.call(groups, id) && id !== selectedGroupId) { if (groups[id].waitingFor && groups[id].waitingFor.stationId === stationId) { addMessage(selectedGroupId, id, text, type, stationId); sent++; } } return sent; }
function addMessage(fromId, toId, text, type, stationId) { messages.push({ id: "m" + new Date().getTime() + "-" + Math.floor(Math.random()*100000), fromId: fromId, fromName: groups[fromId] ? groups[fromId].name : "System", toId: toId, text: text, type: type || "info", stationId: stationId || "", time: nowTime(), ts: new Date().getTime() }); messages = messages.slice(-80); }

function updateCurrentDisplay() { if (!selectedGroupId || !groups[selectedGroupId]) return; var active = groups[selectedGroupId].active; if (!active) { $("currentStation").textContent = groups[selectedGroupId].waitingFor ? "Waiting for: " + groups[selectedGroupId].waitingFor.stationName : "Not started"; $("timeLeft").textContent = "--:--"; $("currentWindow").textContent = "Choose a station and press Start now, or press Waiting."; $("nextStation").textContent = groups[selectedGroupId].waitingFor ? "Location: " + groups[selectedGroupId].waitingFor.locationName : "Location: -"; return; } var left = Math.max(0, Math.round((active.endMs - new Date().getTime()) / 1000)); $("currentStation").textContent = active.stationName; $("timeLeft").textContent = formatSeconds(left); $("currentWindow").textContent = active.duration + " minutes · started " + new Date(active.startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); $("nextStation").textContent = "Location: " + active.locationName; if (left === 0) { $("timeLeft").classList.add("alertDone"); maybeNotify("Station time finished", "Press Finish or choose the next station."); } else $("timeLeft").classList.remove("alertDone"); }
function checkLiveCapacitySafe() { var warning = $("capacityWarning"); if (!warning) return; var station = getStationInfo($("stationSelect") ? $("stationSelect").value : ""); warning.classList.add("hidden"); warning.textContent = ""; if (!station || station.capacity >= 9999) return; var activeGroups = getActiveGroupsAtStation(station.id).filter(function (item) { return item.id !== selectedGroupId; }); if (activeGroups.length >= station.capacity) { warning.classList.remove("hidden"); warning.textContent = "Full now: " + activeGroups.map(function (item) { return item.group.name; }).join(", ") + " already at this station."; } else if (activeGroups.length > 0) { warning.classList.remove("hidden"); warning.textContent = "Currently there: " + activeGroups.map(function (item) { return item.group.name; }).join(", ") + ". Capacity: " + station.capacity + "."; } }
function renderMessagesSafe() { var box = $("messagesBox"); if (!box || !selectedGroupId) return; box.innerHTML = ""; var mine = []; for (var i = messages.length - 1; i >= 0; i--) if (messages[i].toId === selectedGroupId) mine.push(messages[i]); if (!mine.length) { box.innerHTML = '<p class="hint">No messages.</p>'; return; } for (var j = 0; j < mine.length && j < 12; j++) { var m = mine[j]; var div = document.createElement("div"); div.className = "stationBox" + (m.type === "waiting" ? " over" : ""); div.innerHTML = '<div class="stationTitle"><span>' + escapeHtml(m.fromName || "Message") + '</span><span>' + escapeHtml(m.time || "") + '</span></div><p>' + escapeHtml(m.text) + '</p>'; box.appendChild(div); } }
function notifyNewMessagesForMe() { if (!selectedGroupId) return; for (var i = 0; i < messages.length; i++) { var m = messages[i]; if (m.toId === selectedGroupId && !seenMessageIds[m.id]) { seenMessageIds[m.id] = true; localStorage.setItem("seenMessageIds", JSON.stringify(seenMessageIds)); maybeNotify("Tour message", m.text); } } }
function renderOverviewSafe() { var container = $("stationsOverview"); if (!container) return; var byStation = {}, waitingByStation = {}; for (var i = 0; i < ALL_STATIONS.length; i++) { byStation[ALL_STATIONS[i].id] = []; waitingByStation[ALL_STATIONS[i].id] = []; } var idleList = []; for (var id in groups) if (Object.prototype.hasOwnProperty.call(groups, id)) { var group = groups[id]; if (group.active) { if (!byStation[group.active.stationId]) byStation[group.active.stationId] = []; byStation[group.active.stationId].push({ id: id, group: group }); } else if (group.waitingFor) { if (!waitingByStation[group.waitingFor.stationId]) waitingByStation[group.waitingFor.stationId] = []; waitingByStation[group.waitingFor.stationId].push({ id: id, group: group }); } else idleList.push({ id: id, group: group }); } container.innerHTML = ""; for (var l = 0; l < LOCATIONS.length; l++) { var heading = document.createElement("h3"); heading.textContent = LOCATIONS[l].name; heading.dir = "rtl"; container.appendChild(heading); for (var st = 0; st < LOCATIONS[l].stations.length; st++) { var station = LOCATIONS[l].stations[st], list = byStation[station.id] || [], waits = waitingByStation[station.id] || [], isOver = station.capacity < 9999 && list.length > station.capacity, limitText = station.capacity >= 9999 ? "no limit" : "limit " + station.capacity, box = document.createElement("div"); box.className = "stationBox" + (isOver ? " over" : ""); box.innerHTML = '<div class="stationTitle"><span dir="rtl">' + escapeHtml(station.name) + '</span><span>' + list.length + ' inside · ' + waits.length + ' waiting · ' + limitText + '</span></div>'; for (var p = 0; p < list.length; p++) { var pill = document.createElement("span"), g = list[p].group, left = g.active ? Math.max(0, Math.round((g.active.endMs - new Date().getTime()) / 1000)) : 0; pill.className = "groupPill" + (g.status === "delayed" ? " delayed" : ""); pill.textContent = g.name + " (" + (g.bigGroup || "") + ") - inside - " + formatSeconds(left); box.appendChild(pill); } for (var w = 0; w < waits.length; w++) { var wp = document.createElement("span"), wg = waits[w].group; wp.className = "groupPill waiting"; wp.textContent = wg.name + " (" + (wg.bigGroup || "") + ") - waiting"; box.appendChild(wp); } container.appendChild(box); }} var idleBox = document.createElement("div"); idleBox.className = "stationBox"; idleBox.innerHTML = '<div class="stationTitle"><span>Not started / finished</span><span>' + idleList.length + ' leaders</span></div>'; for (var k = 0; k < idleList.length; k++) { var ipill = document.createElement("span"); ipill.className = "groupPill"; ipill.textContent = idleList[k].group.name + " (" + (idleList[k].group.bigGroup || "") + ") - " + (idleList[k].group.status || "not started"); idleBox.appendChild(ipill); } container.appendChild(idleBox); }

function getActiveGroupsAtStation(stationId) { var arr = []; for (var id in groups) if (Object.prototype.hasOwnProperty.call(groups, id) && groups[id].active && groups[id].active.stationId === stationId) arr.push({ id: id, group: groups[id] }); return arr; }
function getStationInfo(value) { if (!value) return null; var normalized = value === "ספסלים בחוץ, אפשר לשבת על הדשה" ? "ספסלים בחוץ, אפשר לשבת על הדשא" : value; for (var i = 0; i < ALL_STATIONS.length; i++) if (ALL_STATIONS[i].id === normalized || ALL_STATIONS[i].name === normalized) return ALL_STATIONS[i]; return null; }
function formatSeconds(sec) { var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? "0" + m : String(m)) + ":" + (s < 10 ? "0" + s : String(s)); }
function nowTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function requestNotificationsSafe() { if (!("Notification" in window)) { alert("Notifications are not supported on this phone/browser."); return; } Notification.requestPermission().then(function (permission) { alert(permission === "granted" ? "Alerts enabled." : "Alerts were not allowed."); }); }
function maybeNotify(title, body) { var key = title + body + new Date().toISOString().slice(0, 16); if (lastNotificationKey === key) return; lastNotificationKey = key; if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body: body }); if (navigator.vibrate) navigator.vibrate([250, 120, 250]); }
function escapeHtml(str) { return String(str).replace(/[&<>\"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

boot();
