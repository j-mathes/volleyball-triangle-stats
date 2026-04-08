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

  const aggregate = withDerived({ setNumber: 0, stats: sumStats(sets) });

  return {
    matchId: matchStarted.matchId,
    matchName: matchStarted.matchName,
    startedAt: matchStarted.timestamp,
    endedAt: endedAt,
    activeSetNumber: activeSetNumber,
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

async function dbCreateMatch(matchId, matchName, createdAt) {
  const event = { type: "MATCH_STARTED", matchId: matchId, matchName: matchName, timestamp: createdAt };
  const record = { matchId: matchId, matchName: matchName, createdAt: createdAt, updatedAt: createdAt, cursor: 1, events: [event] };
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
  createdAt: null,

  toRecord: function () {
    if (!this.currentMatchId) return null;
    return {
      matchId: this.currentMatchId,
      matchName: this.currentMatchName,
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
    this.createdAt = record.createdAt;
  },

  dispatch: function (event) {
    if (event.type === "MATCH_STARTED") {
      this.currentMatchId = event.matchId;
      this.currentMatchName = event.matchName;
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

function renderState() {
  const state = controller.getState();

  $("valTerminalServes").textContent = state ? state.aggregate.terminalServes : 0;
  $("valFirstBallPoints").textContent = state ? state.aggregate.firstBallPoints : 0;
  $("valTransitionPoints").textContent = state ? state.aggregate.transitionPoints : 0;

  $("snapshotInfo").textContent = state
    ? state.matchName + " (" + state.matchId + ")"
    : "No active match";
  $("snapshotScore").textContent = "Score: " + (state ? state.aggregate.usScore : 0) + " - " + (state ? state.aggregate.opponentScore : 0);
  $("snapshotSet").textContent = "Active set: " + (state && state.activeSetNumber ? state.activeSetNumber : "none");

  $("btnStartSet").disabled = !state;
  $("btnEndSet").disabled = !(state && state.activeSetNumber);
  $("btnEndMatch").disabled = !state;
  $("btnUndo").disabled = !(state && state.canUndo);
  $("btnRedo").disabled = !(state && state.canRedo);
  $("btnExportJson").disabled = !state;
  $("btnExportCsv").disabled = !state;
}

async function renderHistory() {
  const matches = await dbListMatches();
  const container = $("historyList");
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = "<p>No saved matches yet.</p>";
    return;
  }

  for (const entry of matches) {
    const btn = document.createElement("button");
    btn.className = "history-item";
    btn.innerHTML = "<span>" + escapeHtml(entry.matchName) + "</span><small>" + new Date(entry.updatedAt).toLocaleString() + "</small>";
    btn.addEventListener("click", function () { void restoreMatch(entry.matchId); });
    container.appendChild(btn);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

async function persistAndRefresh() {
  const record = controller.toRecord();
  if (record) await dbSaveTimeline(record);
  await renderHistory();
  renderState();
}

async function createMatch() {
  const name = $("matchNameInput").value.trim() || "Untitled Match";
  const matchId = "match-" + Date.now();
  const record = await dbCreateMatch(matchId, name, new Date().toISOString());
  controller.hydrate(record);
  await persistAndRefresh();
}

async function restoreMatch(matchId) {
  const record = await dbLoadMatch(matchId);
  if (!record) return;
  controller.hydrate(record);
  renderState();
}

async function startSet() {
  const state = controller.getState();
  if (!state) return;
  const setNumber = parseInt($("setNumberInput").value, 10);
  if (!isFinite(setNumber) || setNumber < 1) return;
  controller.dispatch({ type: "SET_STARTED", matchId: state.matchId, setNumber: setNumber, timestamp: new Date().toISOString() });
  await persistAndRefresh();
}

async function endSet() {
  const state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  controller.dispatch({ type: "SET_ENDED", matchId: state.matchId, setNumber: state.activeSetNumber, timestamp: new Date().toISOString() });
  await persistAndRefresh();
}

async function endMatch() {
  const state = controller.getState();
  if (!state) return;
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
  const state = controller.getState();
  if (!state) return;
  const payload = toExportJson(state, controller.timeline.events, controller.timeline.cursor);
  downloadText(state.matchId + ".json", JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv() {
  const state = controller.getState();
  if (!state) return;
  downloadText(state.matchId + ".csv", toExportCsv(state), "text/csv;charset=utf-8");
}

// ---- Bootstrap --------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Control panel buttons
  $("btnStartMatch").addEventListener("click", function () { void createMatch(); });
  $("btnStartSet").addEventListener("click", function () { void startSet(); });
  $("btnEndSet").addEventListener("click", function () { void endSet(); });
  $("btnEndMatch").addEventListener("click", function () { void endMatch(); });
  $("btnUndo").addEventListener("click", function () { void onUndo(); });
  $("btnRedo").addEventListener("click", function () { void onRedo(); });
  $("btnExportJson").addEventListener("click", exportJson);
  $("btnExportCsv").addEventListener("click", exportCsv);

  // Stat action buttons (data-stat attribute)
  document.querySelectorAll("[data-stat]").forEach(function (btn) {
    btn.addEventListener("click", function () { void incrementStat(btn.getAttribute("data-stat")); });
  });

  // Restore most recent match on load
  (async function () {
    const matches = await dbListMatches();
    await renderHistory();
    if (matches.length > 0) {
      await restoreMatch(matches[0].matchId);
    }
    renderState();
  })();
});
