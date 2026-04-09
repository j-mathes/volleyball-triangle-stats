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

  var completedSetsCount = sets.filter(function (s) {
    return replayed.some(function (e) { return e.type === "SET_ENDED" && e.setNumber === s.setNumber; });
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

function showPage(page) {
  $("configPage").hidden = page !== "config";
  $("statsPage").hidden = page !== "stats";
}

// ---- Config page validation ----

function getSelectedFormat() {
  var checked = document.querySelector('input[name="matchFormat"]:checked');
  return checked ? checked.value : "bestOf";
}

function validateConfig() {
  var format = getSelectedFormat();
  var totalSets = parseInt($("cfgTotalSets").value, 10);
  var msg = $("cfgValidation");
  var btn = $("btnBeginMatch");

  if (!isFinite(totalSets) || totalSets < 1) {
    msg.textContent = "Enter a positive number of sets.";
    btn.disabled = true;
    return false;
  }

  if (format === "bestOf" && totalSets % 2 === 0) {
    msg.textContent = "Best Of requires an odd number (e.g. 3, 5, 7).";
    btn.disabled = true;
    return false;
  }

  if (format === "straightSets" && totalSets % 2 !== 0) {
    msg.textContent = "Straight Sets requires an even number (e.g. 2, 4, 6).";
    btn.disabled = true;
    return false;
  }

  msg.textContent = "";
  btn.disabled = false;
  return true;
}

// ---- Render ----

function renderState() {
  const state = controller.getState();

  $("valTerminalServes").textContent = state ? state.aggregate.terminalServes : 0;
  $("valFirstBallPoints").textContent = state ? state.aggregate.firstBallPoints : 0;
  $("valTransitionPoints").textContent = state ? state.aggregate.transitionPoints : 0;

  // Snapshot info
  $("snapshotInfo").textContent = state
    ? state.matchName + " — " + state.matchFormat.replace("bestOf", "Best Of").replace("straightSets", "Straight Sets") + " " + state.totalSets
    : "No active match";

  // Per-set snapshot table
  var tbody = $("snapshotBody");
  var tfoot = $("snapshotFoot");
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  if (state) {
    for (var i = 1; i <= state.totalSets; i++) {
      var set = state.sets.find(function (s) { return s.setNumber === i; });
      var tr = document.createElement("tr");
      if (state.activeSetNumber === i) tr.className = "active-set";
      var score = set ? calculateSetScore(set.stats) : { us: 0, opponent: 0 };
      var ts = set ? calculateTerminalServes(set.stats) : 0;
      var fbp = set ? calculateFirstBallPoints(set.stats) : 0;
      var tp = set ? calculateTransitionPoints(set.stats) : 0;
      tr.innerHTML =
        "<td>" + i + "</td>" +
        "<td>" + score.us + "</td>" +
        "<td>" + score.opponent + "</td>" +
        "<td>" + ts + "</td>" +
        "<td>" + fbp + "</td>" +
        "<td>" + tp + "</td>";
      tbody.appendChild(tr);
    }

    // Totals row
    var footTr = document.createElement("tr");
    footTr.innerHTML =
      "<td>Total</td>" +
      "<td>" + state.aggregate.usScore + "</td>" +
      "<td>" + state.aggregate.opponentScore + "</td>" +
      "<td>" + state.aggregate.terminalServes + "</td>" +
      "<td>" + state.aggregate.firstBallPoints + "</td>" +
      "<td>" + state.aggregate.transitionPoints + "</td>";
    tfoot.appendChild(footTr);
  }

  // Set indicator
  $("setIndicator").textContent = state
    ? "Set " + (state.activeSetNumber || "-") + " of " + state.totalSets
    : "No match";

  // Button states
  $("btnEndSet").disabled = !(state && state.activeSetNumber);
  $("btnEndMatch").disabled = !(state && !state.endedAt);
  $("btnUndo").disabled = !(state && state.canUndo);
  $("btnRedo").disabled = !(state && state.canRedo);
  $("btnExportJson").disabled = !state;
  $("btnExportCsv").disabled = !state;

  var hasActiveSet = !!(state && state.activeSetNumber);
  document.querySelectorAll("[data-stat]").forEach(function (btn) {
    btn.disabled = !hasActiveSet;
  });
}

async function renderHistory() {
  const matches = await dbListMatches();

  // Render in both config page and stats page
  var containers = [$("historyList"), $("configHistoryList")];
  for (var c = 0; c < containers.length; c++) {
    var container = containers[c];
    if (!container) continue;
    container.innerHTML = "";

    if (matches.length === 0) {
      container.innerHTML = "<p>No saved matches yet.</p>";
      continue;
    }

    for (var m = 0; m < matches.length; m++) {
      (function (entry) {
        var btn = document.createElement("button");
        btn.className = "history-item";
        btn.innerHTML = "<span>" + escapeHtml(entry.matchName) + "</span><small>" + new Date(entry.updatedAt).toLocaleString() + "</small>";
        btn.addEventListener("click", function () { void restoreMatch(entry.matchId); });
        container.appendChild(btn);
      })(matches[m]);
    }
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

// ---- Match lifecycle ----

async function createMatch() {
  var name = $("cfgMatchName").value.trim() || "Untitled Match";
  var format = getSelectedFormat();
  var totalSets = parseInt($("cfgTotalSets").value, 10);
  var matchId = "match-" + Date.now();
  var now = new Date().toISOString();

  var record = await dbCreateMatch(matchId, name, now, format, totalSets);
  controller.hydrate(record);

  // Auto-start set 1
  controller.dispatch({ type: "SET_STARTED", matchId: matchId, setNumber: 1, timestamp: new Date().toISOString() });

  showPage("stats");
  await persistAndRefresh();
}

async function restoreMatch(matchId) {
  const record = await dbLoadMatch(matchId);
  if (!record) return;
  controller.hydrate(record);
  showPage("stats");
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

  // If a set is active, end it first
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

function goBackToConfig() {
  showPage("config");
}

// ---- Bootstrap --------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Config page
  $("btnBeginMatch").addEventListener("click", function () { void createMatch(); });
  $("cfgTotalSets").addEventListener("input", validateConfig);
  document.querySelectorAll('input[name="matchFormat"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      // When switching format, auto-adjust the number to be valid
      var val = parseInt($("cfgTotalSets").value, 10);
      if (isFinite(val) && val >= 1) {
        var fmt = getSelectedFormat();
        if (fmt === "bestOf" && val % 2 === 0) $("cfgTotalSets").value = val + 1;
        if (fmt === "straightSets" && val % 2 !== 0) $("cfgTotalSets").value = Math.max(2, val + 1);
      }
      validateConfig();
    });
  });

  // Stats page
  $("btnEndSet").addEventListener("click", function () { void endSet(); });
  $("btnEndMatch").addEventListener("click", function () { void endMatch(); });
  $("btnUndo").addEventListener("click", function () { void onUndo(); });
  $("btnRedo").addEventListener("click", function () { void onRedo(); });
  $("btnExportJson").addEventListener("click", exportJson);
  $("btnExportCsv").addEventListener("click", exportCsv);
  $("btnBackToConfig").addEventListener("click", goBackToConfig);

  // Stat action buttons (data-stat attribute)
  document.querySelectorAll("[data-stat]").forEach(function (btn) {
    btn.addEventListener("click", function () { void incrementStat(btn.getAttribute("data-stat")); });
  });

  // Start on config page, restore most recent match if any
  validateConfig();
  (async function () {
    await renderHistory();
    var matches = await dbListMatches();
    if (matches.length > 0) {
      await restoreMatch(matches[0].matchId);
    } else {
      showPage("config");
    }
    renderState();
  })();
});
