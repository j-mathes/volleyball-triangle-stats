// ============================================================
// Triangle Stats — app.js
// All domain logic, persistence, and UI wiring in one file.
// Open index.html directly in a browser to run.
// ============================================================

"use strict";

// ---- Stat Keys & Constants --------------------------------

const STAT_KEYS = [
  "usAces", "usMisses", "opponentAces", "opponentMisses",
  "firstBallUsKills", "firstBallUsStops", "firstBallOpponentKills", "firstBallOpponentStops",
  "transitionUsKills", "transitionUsStops", "transitionOpponentKills", "transitionOpponentStops",
];

function createEmptyTotals() {
  const totals = {};
  for (const key of STAT_KEYS) totals[key] = 0;
  return totals;
}

// ---- Formulas ---------------------------------------------

function calculateTerminalServes(stats) {
  return (stats.usAces + stats.opponentMisses) - (stats.opponentAces + stats.usMisses);
}

function calculateFirstBallPoints(stats) {
  return (stats.firstBallUsKills + stats.firstBallUsStops) - (stats.firstBallOpponentKills + stats.firstBallOpponentStops);
}

function calculateTransitionPoints(stats) {
  return (stats.transitionUsKills + stats.transitionUsStops) - (stats.transitionOpponentKills + stats.transitionOpponentStops);
}

function calculateSetScore(stats) {
  const us = stats.usAces + stats.firstBallUsKills + stats.firstBallUsStops + stats.transitionUsKills + stats.transitionUsStops;
  const opponent = stats.opponentAces + stats.firstBallOpponentKills + stats.firstBallOpponentStops + stats.transitionOpponentKills + stats.transitionOpponentStops;
  return { us, opponent };
}

function withDerived(set) {
  const score = calculateSetScore(set.stats);
  return Object.assign({}, set, {
    terminalServes: calculateTerminalServes(set.stats),
    firstBallPoints: calculateFirstBallPoints(set.stats),
    transitionPoints: calculateTransitionPoints(set.stats),
    usScore: score.us,
    opponentScore: score.opponent,
  });
}

// ---- Match Engine -----------------------------------------

function findSetOrCreate(sets, setNumber) {
  let existing = sets.find(function (s) { return s.setNumber === setNumber; });
  if (existing) return existing;
  const created = withDerived({ setNumber: setNumber, stats: createEmptyTotals() });
  sets.push(created);
  return created;
}

function sumStats(sets) {
  const totals = createEmptyTotals();
  for (const set of sets) {
    for (const stat of STAT_KEYS) {
      totals[stat] += set.stats[stat];
    }
  }
  return totals;
}

function deriveMatchState(timeline) {
  const replayed = timeline.events.slice(0, timeline.cursor);
  const matchStarted = replayed.find(function (e) { return e.type === "MATCH_STARTED"; });
  if (!matchStarted) return undefined;

  const sets = [];
  let activeSetNumber;
  let endedAt;
  var matchFormat = matchStarted.matchFormat || "bestOf";
  var totalSets = matchStarted.totalSets || 5;

  for (const event of replayed) {
    if (event.type === "SET_STARTED") {
      activeSetNumber = event.setNumber;
      findSetOrCreate(sets, event.setNumber);
    }
    if (event.type === "STAT_INCREMENTED") {
      const set = findSetOrCreate(sets, event.setNumber);
      set.stats[event.stat] += event.value;
      Object.assign(set, withDerived(set));
    }
    if (event.type === "SET_ENDED" && activeSetNumber === event.setNumber) {
      activeSetNumber = undefined;
    }
    if (event.type === "MATCH_ENDED") {
      endedAt = event.timestamp;
      activeSetNumber = undefined;
    }
  }

  var completedSets = [];
  var completedSetsCount = sets.filter(function (s) {
    var ended = replayed.some(function (e) { return e.type === "SET_ENDED" && e.setNumber === s.setNumber; });
    if (ended) completedSets.push(s.setNumber);
    return ended;
  }).length;

  const aggregate = withDerived({ setNumber: 0, stats: sumStats(sets) });

  return {
    matchId: matchStarted.matchId,
    matchName: matchStarted.matchName,
    matchFormat: matchFormat,
    totalSets: totalSets,
    startedAt: matchStarted.timestamp,
    endedAt: endedAt,
    activeSetNumber: activeSetNumber,
    completedSets: completedSets,
    completedSetsCount: completedSetsCount,
    sets: sets.sort(function (a, b) { return a.setNumber - b.setNumber; }),
    aggregate: aggregate,
    cursor: timeline.cursor,
    canUndo: timeline.cursor > 0,
    canRedo: timeline.cursor < timeline.events.length,
  };
}

function applyEvent(timeline, event) {
  const kept = timeline.events.slice(0, timeline.cursor);
  kept.push(event);
  return { events: kept, cursor: kept.length };
}

function undoTimeline(timeline) {
  if (timeline.cursor === 0) return timeline;
  return { events: timeline.events, cursor: timeline.cursor - 1 };
}

function redoTimeline(timeline) {
  if (timeline.cursor >= timeline.events.length) return timeline;
  return { events: timeline.events, cursor: timeline.cursor + 1 };
}

// ---- Export (JSON / CSV) ----------------------------------

function toExportJson(state, events, cursor) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    state: state,
    timeline: { cursor: cursor, events: events },
  };
}

function csvRowForSet(set, label) {
  return [
    label, set.usScore, set.opponentScore,
    set.terminalServes, set.firstBallPoints, set.transitionPoints,
    set.stats.usAces, set.stats.usMisses, set.stats.opponentAces, set.stats.opponentMisses,
    set.stats.firstBallUsKills, set.stats.firstBallUsStops,
    set.stats.firstBallOpponentKills, set.stats.firstBallOpponentStops,
    set.stats.transitionUsKills, set.stats.transitionUsStops,
    set.stats.transitionOpponentKills, set.stats.transitionOpponentStops,
  ].join(",");
}

function toExportCsv(state) {
  const header = [
    "row", "usScore", "opponentScore",
    "terminalServes", "firstBallPoints", "transitionPoints",
    "usAces", "usMisses", "opponentAces", "opponentMisses",
    "firstBallUsKills", "firstBallUsStops",
    "firstBallOpponentKills", "firstBallOpponentStops",
    "transitionUsKills", "transitionUsStops",
    "transitionOpponentKills", "transitionOpponentStops",
  ].join(",");

  const lines = [header];
  for (const set of state.sets) {
    lines.push(csvRowForSet(set, "set-" + set.setNumber));
  }
  lines.push(csvRowForSet(state.aggregate, "match-total"));
  return lines.join("\n");
}

// ---- IndexedDB Persistence --------------------------------

const DB_NAME = "triangle-stats";
const DB_VERSION = 1;
const STORE_NAME = "matches";

function openDatabase() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "matchId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error("Failed to open IndexedDB")); };
  });
}

function runTransaction(db, mode, operation) {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = operation(store);
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error("IndexedDB operation failed")); };
  });
}

async function dbCreateMatch(matchId, matchName, createdAt, matchFormat, totalSets) {
  const event = { type: "MATCH_STARTED", matchId: matchId, matchName: matchName, matchFormat: matchFormat, totalSets: totalSets, timestamp: createdAt };
  const record = { matchId: matchId, matchName: matchName, matchFormat: matchFormat, totalSets: totalSets, createdAt: createdAt, updatedAt: createdAt, cursor: 1, events: [event] };
  const db = await openDatabase();
  await runTransaction(db, "readwrite", function (store) { return store.put(record); });
  db.close();
  return record;
}

async function dbListMatches() {
  const db = await openDatabase();
  const all = await runTransaction(db, "readonly", function (store) { return store.getAll(); });
  db.close();
  return all.sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
}

async function dbLoadMatch(matchId) {
  const db = await openDatabase();
  const record = await runTransaction(db, "readonly", function (store) { return store.get(matchId); });
  db.close();
  return record;
}

async function dbSaveTimeline(record) {
  const db = await openDatabase();
  await runTransaction(db, "readwrite", function (store) {
    return store.put(Object.assign({}, record, { updatedAt: new Date().toISOString() }));
  });
  db.close();
}

async function dbDeleteMatch(matchId) {
  const db = await openDatabase();
  await runTransaction(db, "readwrite", function (store) { return store.delete(matchId); });
  db.close();
}

// ---- Controller -------------------------------------------

const controller = {
  timeline: { events: [], cursor: 0 },
  currentMatchId: null,
  currentMatchName: null,
  matchFormat: null,
  totalSets: null,
  createdAt: null,

  toRecord: function () {
    if (!this.currentMatchId) return null;
    return {
      matchId: this.currentMatchId,
      matchName: this.currentMatchName,
      matchFormat: this.matchFormat,
      totalSets: this.totalSets,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      cursor: this.timeline.cursor,
      events: this.timeline.events,
    };
  },

  hydrate: function (record) {
    this.timeline = { events: record.events, cursor: record.cursor };
    this.currentMatchId = record.matchId;
    this.currentMatchName = record.matchName;
    this.matchFormat = record.matchFormat || "bestOf";
    this.totalSets = record.totalSets || 5;
    this.createdAt = record.createdAt;
  },

  dispatch: function (event) {
    if (event.type === "MATCH_STARTED") {
      this.currentMatchId = event.matchId;
      this.currentMatchName = event.matchName;
      this.matchFormat = event.matchFormat;
      this.totalSets = event.totalSets;
      this.createdAt = event.timestamp;
      this.timeline = { events: [], cursor: 0 };
    }
    this.timeline = applyEvent(this.timeline, event);
  },

  incrementStat: function (matchId, setNumber, stat) {
    this.dispatch({
      type: "STAT_INCREMENTED",
      matchId: matchId,
      setNumber: setNumber,
      stat: stat,
      value: 1,
      timestamp: new Date().toISOString(),
    });
  },

  getState: function () {
    return deriveMatchState(this.timeline);
  },

  undo: function () {
    this.timeline = undoTimeline(this.timeline);
  },

  redo: function () {
    this.timeline = redoTimeline(this.timeline);
  },
};

// ---- UI Wiring --------------------------------------------

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function $(id) { return document.getElementById(id); }

// ---- Page navigation ----

var currentPage = "config";

function showPage(page) {
  currentPage = page;
  $("configPage").style.display = page === "config" ? "flex" : "none";
  $("statsPage").style.display = page === "stats" ? "block" : "none";
  $("historyPage").style.display = page === "history" ? "grid" : "none";

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-page") === page);
  });
}

// ---- Config page — stepper logic ----

var cfgSetsValue = 3;

function getSelectedFormat() {
  var checked = document.querySelector('input[name="matchFormat"]:checked');
  return checked ? checked.value : "bestOf";
}

function stepSets(direction) {
  var fmt = getSelectedFormat();
  if (fmt === "bestOf") {
    // 3, 5, 7, 9 ...
    var next = cfgSetsValue + (direction * 2);
    if (next < 3) next = 3;
    cfgSetsValue = next;
  } else {
    // 1, 2, 4, 6, 8 ...
    if (cfgSetsValue === 1 && direction === 1) {
      cfgSetsValue = 2;
    } else if (cfgSetsValue === 2 && direction === -1) {
      cfgSetsValue = 1;
    } else if (cfgSetsValue === 1 && direction === -1) {
      cfgSetsValue = 1;
    } else {
      var next = cfgSetsValue + (direction * 2);
      if (next < 1) next = 1;
      cfgSetsValue = next;
    }
  }
  $("cfgTotalSets").textContent = cfgSetsValue;
}

function syncSetsToFormat() {
  var fmt = getSelectedFormat();
  if (fmt === "bestOf") {
    // Must be odd and >= 3
    if (cfgSetsValue < 3) cfgSetsValue = 3;
    if (cfgSetsValue % 2 === 0) cfgSetsValue = cfgSetsValue + 1;
  } else {
    // Straight sets: 1, 2, 4, 6 — keep value or adjust
    if (cfgSetsValue < 1) cfgSetsValue = 1;
    // If currently odd and > 1, round down to even
    if (cfgSetsValue > 1 && cfgSetsValue % 2 !== 0) cfgSetsValue = cfgSetsValue - 1;
  }
  $("cfgTotalSets").textContent = cfgSetsValue;
}

// ---- Snapshot rendering (reusable) ----

function formatScore(us, them) {
  return String(us).padStart(2, "\u00a0") + " - " + String(them).padStart(2, "\u00a0");
}

function renderSnapshotTable(state, tbodyId, tfootId, highlightActive) {
  var tbody = $(tbodyId);
  var tfoot = $(tfootId);
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  if (!state) return;

  for (var i = 1; i <= state.totalSets; i++) {
    var set = state.sets.find(function (s) { return s.setNumber === i; });
    var tr = document.createElement("tr");
    if (highlightActive && state.activeSetNumber === i) tr.className = "active-set";
    var score = set ? calculateSetScore(set.stats) : { us: 0, opponent: 0 };
    var ts = set ? calculateTerminalServes(set.stats) : 0;
    var fbp = set ? calculateFirstBallPoints(set.stats) : 0;
    var tp = set ? calculateTransitionPoints(set.stats) : 0;
    tr.innerHTML =
      "<td>" + i + "</td>" +
      "<td>" + formatScore(score.us, score.opponent) + "</td>" +
      "<td>" + ts + "</td>" +
      "<td>" + fbp + "</td>" +
      "<td>" + tp + "</td>";
    tbody.appendChild(tr);
  }

  var footTr = document.createElement("tr");
  footTr.innerHTML =
    "<td>Total</td>" +
    "<td>" + formatScore(state.aggregate.usScore, state.aggregate.opponentScore) + "</td>" +
    "<td>" + state.aggregate.terminalServes + "</td>" +
    "<td>" + state.aggregate.firstBallPoints + "</td>" +
    "<td>" + state.aggregate.transitionPoints + "</td>";
  tfoot.appendChild(footTr);
}

// Stats page snapshot: only completed sets + active set
function renderActiveSnapshot(state) {
  var tbody = $("snapshotBody");
  var tfoot = $("snapshotFoot");
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  if (!state) return;

  // Gather sets that are completed or currently active
  var setsToShow = [];
  for (var i = 1; i <= state.totalSets; i++) {
    var set = state.sets.find(function (s) { return s.setNumber === i; });
    if (!set) continue;
    var isActive = state.activeSetNumber === i;
    var isCompleted = state.completedSets && state.completedSets.indexOf(i) >= 0;
    if (isActive || isCompleted) {
      setsToShow.push({ setNumber: i, set: set, isActive: isActive });
    }
  }

  if (setsToShow.length === 0) return;

  for (var j = 0; j < setsToShow.length; j++) {
    var item = setsToShow[j];
    var tr = document.createElement("tr");
    if (item.isActive) tr.className = "active-set";
    var score = calculateSetScore(item.set.stats);
    var ts = calculateTerminalServes(item.set.stats);
    var fbp = calculateFirstBallPoints(item.set.stats);
    var tp = calculateTransitionPoints(item.set.stats);
    tr.innerHTML =
      "<td>" + item.setNumber + "</td>" +
      "<td>" + formatScore(score.us, score.opponent) + "</td>" +
      "<td>" + ts + "</td>" +
      "<td>" + fbp + "</td>" +
      "<td>" + tp + "</td>";
    tbody.appendChild(tr);
  }

  // Totals row only if more than one set shown
  if (setsToShow.length > 1) {
    var footTr = document.createElement("tr");
    footTr.innerHTML =
      "<td>Total</td>" +
      "<td>" + formatScore(state.aggregate.usScore, state.aggregate.opponentScore) + "</td>" +
      "<td>" + state.aggregate.terminalServes + "</td>" +
      "<td>" + state.aggregate.firstBallPoints + "</td>" +
      "<td>" + state.aggregate.transitionPoints + "</td>";
    tfoot.appendChild(footTr);
  }
}

// ---- Render stats page ----

function renderState() {
  const state = controller.getState();

  $("valTerminalServes").textContent = state ? state.aggregate.terminalServes : 0;
  $("valFirstBallPoints").textContent = state ? state.aggregate.firstBallPoints : 0;
  $("valTransitionPoints").textContent = state ? state.aggregate.transitionPoints : 0;

  // Match name input: show current match name when active
  if (state) {
    $("matchNameInput").value = state.matchName;
  }

  $("setIndicator").textContent = state
    ? "Set " + (state.activeSetNumber || "-") + " of " + state.totalSets
    : "No match";

  renderActiveSnapshot(state);

  // Start match button: enabled only when no active match
  $("btnStartMatch").disabled = !!(state && !state.endedAt);
  $("matchNameInput").disabled = !!(state && !state.endedAt);

  $("btnEndSet").disabled = !(state && state.activeSetNumber);
  $("btnEndMatch").disabled = !(state && !state.endedAt);
  $("btnUndo").disabled = !(state && state.canUndo);
  $("btnRedo").disabled = !(state && state.canRedo);
  $("btnReset").disabled = !state;

  var hasActiveSet = !!(state && state.activeSetNumber);
  document.querySelectorAll("[data-stat]").forEach(function (btn) {
    btn.disabled = !hasActiveSet;
  });
}

// ---- History page ----

var selectedHistoryMatchId = null;

async function renderHistory() {
  const matches = await dbListMatches();
  var container = $("historyList");
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = "<p>No saved matches yet.</p>";
    clearHistoryPreview();
    return;
  }

  for (var m = 0; m < matches.length; m++) {
    (function (entry) {
      var btn = document.createElement("button");
      btn.className = "history-item" + (entry.matchId === selectedHistoryMatchId ? " selected" : "");
      btn.innerHTML = "<span>" + escapeHtml(entry.matchName) + "</span><small>" + new Date(entry.updatedAt).toLocaleString() + "</small>";
      btn.addEventListener("click", function () { void selectHistoryMatch(entry.matchId); });
      container.appendChild(btn);
    })(matches[m]);
  }
}

function clearHistoryPreview() {
  selectedHistoryMatchId = null;
  $("historyPreviewInfo").textContent = "Select a match to view details.";
  $("historySnapshotTable").hidden = true;
  $("historyActions").hidden = true;
  $("historySnapshotBody").innerHTML = "";
  $("historySnapshotFoot").innerHTML = "";
}

async function selectHistoryMatch(matchId) {
  selectedHistoryMatchId = matchId;
  var record = await dbLoadMatch(matchId);
  if (!record) { clearHistoryPreview(); return; }

  var timeline = { events: record.events, cursor: record.cursor };
  var state = deriveMatchState(timeline);
  if (!state) { clearHistoryPreview(); return; }

  var formatLabel = state.matchFormat === "bestOf" ? "Best Of" : "Straight Sets";
  $("historyPreviewInfo").textContent = state.matchName + " — " + formatLabel + " " + state.totalSets + (state.endedAt ? " (ended)" : "");
  $("historySnapshotTable").hidden = false;
  $("historyActions").hidden = false;

  renderSnapshotTable(state, "historySnapshotBody", "historySnapshotFoot", false);

  // Update selected style
  document.querySelectorAll("#historyList .history-item").forEach(function (btn) {
    btn.classList.remove("selected");
  });
  // Find and highlight
  var items = document.querySelectorAll("#historyList .history-item");
  for (var i = 0; i < items.length; i++) {
    // items are in same order as matches
    (function () {})(); // just re-render
  }
  await renderHistory();
}

async function resumeMatch() {
  if (!selectedHistoryMatchId) return;
  var record = await dbLoadMatch(selectedHistoryMatchId);
  if (!record) return;
  controller.hydrate(record);
  showPage("stats");
  renderState();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

async function persistAndRefresh() {
  const record = controller.toRecord();
  if (record) await dbSaveTimeline(record);
  renderState();
}

// ---- Match lifecycle ----

async function createMatch() {
  var name = $("matchNameInput").value.trim() || "Untitled Match";
  var format = getSelectedFormat();
  var totalSets = cfgSetsValue;
  var matchId = "match-" + Date.now();
  var now = new Date().toISOString();

  var record = await dbCreateMatch(matchId, name, now, format, totalSets);
  controller.hydrate(record);

  // Auto-start set 1
  controller.dispatch({ type: "SET_STARTED", matchId: matchId, setNumber: 1, timestamp: new Date().toISOString() });

  showPage("stats");
  await persistAndRefresh();
}

async function resetMatch() {
  controller.timeline = { events: [], cursor: 0 };
  controller.currentMatchId = null;
  controller.currentMatchName = null;
  controller.matchFormat = null;
  controller.totalSets = null;
  controller.createdAt = null;
  $("matchNameInput").value = "Practice Match";
  renderState();
}

async function endSet() {
  const state = controller.getState();
  if (!state || !state.activeSetNumber) return;

  var currentSetNum = state.activeSetNumber;
  controller.dispatch({ type: "SET_ENDED", matchId: state.matchId, setNumber: currentSetNum, timestamp: new Date().toISOString() });

  // Auto-progress to next set if available
  var nextSet = currentSetNum + 1;
  if (nextSet <= state.totalSets) {
    controller.dispatch({ type: "SET_STARTED", matchId: state.matchId, setNumber: nextSet, timestamp: new Date().toISOString() });
  }

  await persistAndRefresh();
}

async function endMatch() {
  const state = controller.getState();
  if (!state) return;

  if (state.activeSetNumber) {
    controller.dispatch({ type: "SET_ENDED", matchId: state.matchId, setNumber: state.activeSetNumber, timestamp: new Date().toISOString() });
  }
  controller.dispatch({ type: "MATCH_ENDED", matchId: state.matchId, timestamp: new Date().toISOString() });
  await persistAndRefresh();
}

async function incrementStat(stat) {
  const state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  controller.incrementStat(state.matchId, state.activeSetNumber, stat);
  await persistAndRefresh();
}

async function onUndo() {
  controller.undo();
  await persistAndRefresh();
}

async function onRedo() {
  controller.redo();
  await persistAndRefresh();
}

function exportJson() {
  var state;
  if (currentPage === "history" && selectedHistoryMatchId) {
    // Export from history preview
    void (async function () {
      var record = await dbLoadMatch(selectedHistoryMatchId);
      if (!record) return;
      var tl = { events: record.events, cursor: record.cursor };
      var s = deriveMatchState(tl);
      if (!s) return;
      var payload = toExportJson(s, record.events, record.cursor);
      downloadText(s.matchId + ".json", JSON.stringify(payload, null, 2), "application/json");
    })();
    return;
  }
  state = controller.getState();
  if (!state) return;
  var payload = toExportJson(state, controller.timeline.events, controller.timeline.cursor);
  downloadText(state.matchId + ".json", JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv() {
  if (currentPage === "history" && selectedHistoryMatchId) {
    void (async function () {
      var record = await dbLoadMatch(selectedHistoryMatchId);
      if (!record) return;
      var tl = { events: record.events, cursor: record.cursor };
      var s = deriveMatchState(tl);
      if (!s) return;
      downloadText(s.matchId + ".csv", toExportCsv(s), "text/csv;charset=utf-8");
    })();
    return;
  }
  var state = controller.getState();
  if (!state) return;
  downloadText(state.matchId + ".csv", toExportCsv(state), "text/csv;charset=utf-8");
}

// ---- Bootstrap --------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Nav bar
  $("navConfig").addEventListener("click", function () { showPage("config"); });
  $("navStats").addEventListener("click", function () { showPage("stats"); renderState(); });
  $("navHistory").addEventListener("click", function () { showPage("history"); void renderHistory(); });

  // Config page
  $("btnSetsUp").addEventListener("click", function () { stepSets(1); });
  $("btnSetsDown").addEventListener("click", function () { stepSets(-1); });
  document.querySelectorAll('input[name="matchFormat"]').forEach(function (radio) {
    radio.addEventListener("change", function () { syncSetsToFormat(); });
  });

  // Stats page
  $("btnStartMatch").addEventListener("click", function () { void createMatch(); });
  $("btnEndSet").addEventListener("click", function () { void endSet(); });
  $("btnEndMatch").addEventListener("click", function () { void endMatch(); });
  $("btnUndo").addEventListener("click", function () { void onUndo(); });
  $("btnRedo").addEventListener("click", function () { void onRedo(); });
  $("btnReset").addEventListener("click", function () { void resetMatch(); });

  // History page
  $("btnResumeMatch").addEventListener("click", function () { void resumeMatch(); });
  $("btnExportJson").addEventListener("click", exportJson);
  $("btnExportCsv").addEventListener("click", exportCsv);

  // Stat action buttons (data-stat attribute)
  document.querySelectorAll("[data-stat]").forEach(function (btn) {
    btn.addEventListener("click", function () { void incrementStat(btn.getAttribute("data-stat")); });
  });

  // Start on config page, restore most recent match if any
  syncSetsToFormat();
  (async function () {
    var matches = await dbListMatches();
    if (matches.length > 0) {
      var record = await dbLoadMatch(matches[0].matchId);
      if (record) {
        controller.hydrate(record);
        showPage("stats");
        renderState();
        return;
      }
    }
    showPage("stats");
    renderState();
  })();
});
