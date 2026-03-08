import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { MatchDerivedState, MatchSummary, StatKey } from "@triangle-stats/shared";
import { toExportCsv, toExportJson } from "@triangle-stats/shared";
import { IndexedDbMatchRepository } from "./persistence/indexedDbMatchRepository";
import { WebMatchController } from "./controller";

interface StatAction {
  label: string;
  stat: StatKey;
}

const terminalActions: StatAction[] = [
  { label: "Our Ace", stat: "usAces" },
  { label: "Our Miss", stat: "usMisses" },
  { label: "Their Ace", stat: "opponentAces" },
  { label: "Their Miss", stat: "opponentMisses" },
];

const firstBallActions: StatAction[] = [
  { label: "Our Kill", stat: "firstBallUsKills" },
  { label: "Our Stop", stat: "firstBallUsStops" },
  { label: "Their Kill", stat: "firstBallOpponentKills" },
  { label: "Their Stop", stat: "firstBallOpponentStops" },
];

const transitionActions: StatAction[] = [
  { label: "Our Kill", stat: "transitionUsKills" },
  { label: "Our Stop", stat: "transitionUsStops" },
  { label: "Their Kill", stat: "transitionOpponentKills" },
  { label: "Their Stop", stat: "transitionOpponentStops" },
];

function newMatchId(): string {
  return `match-${Date.now()}`;
}

function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const repository = useMemo(() => new IndexedDbMatchRepository(), []);
  const controllerRef = useRef(new WebMatchController(repository));

  const [state, setState] = useState<MatchDerivedState | undefined>(undefined);
  const [history, setHistory] = useState<MatchSummary[]>([]);
  const [matchName, setMatchName] = useState("Practice Match");
  const [setNumberInput, setSetNumberInput] = useState("1");

  async function refreshHistory(): Promise<void> {
    setHistory(await repository.listMatches());
  }

  function refreshState(): void {
    setState(controllerRef.current.getState());
  }

  async function persistAndRefresh(): Promise<void> {
    await controllerRef.current.persistMatch();
    await refreshHistory();
    refreshState();
  }

  useEffect(() => {
    const bootstrap = async () => {
      const matches = await repository.listMatches();
      setHistory(matches);

      if (matches.length > 0) {
        await controllerRef.current.restoreMatch(matches[0].matchId);
        refreshState();
      }
    };

    void bootstrap();
  }, [repository]);

  async function createMatch(): Promise<void> {
    await controllerRef.current.createMatch(newMatchId(), matchName.trim() || "Untitled Match");
    await persistAndRefresh();
  }

  async function restoreMatch(matchId: string): Promise<void> {
    await controllerRef.current.restoreMatch(matchId);
    refreshState();
  }

  async function startSet(): Promise<void> {
    const current = controllerRef.current.getState();
    if (!current) {
      return;
    }

    const setNumber = Number.parseInt(setNumberInput, 10);
    if (!Number.isFinite(setNumber) || setNumber < 1) {
      return;
    }

    controllerRef.current.dispatch({
      type: "SET_STARTED",
      matchId: current.matchId,
      setNumber,
      timestamp: new Date().toISOString(),
    });

    await persistAndRefresh();
  }

  async function endSet(): Promise<void> {
    const current = controllerRef.current.getState();
    if (!current?.activeSetNumber) {
      return;
    }

    controllerRef.current.dispatch({
      type: "SET_ENDED",
      matchId: current.matchId,
      setNumber: current.activeSetNumber,
      timestamp: new Date().toISOString(),
    });

    await persistAndRefresh();
  }

  async function endMatch(): Promise<void> {
    const current = controllerRef.current.getState();
    if (!current) {
      return;
    }

    controllerRef.current.dispatch({
      type: "MATCH_ENDED",
      matchId: current.matchId,
      timestamp: new Date().toISOString(),
    });

    await persistAndRefresh();
  }

  async function increment(stat: StatKey): Promise<void> {
    const current = controllerRef.current.getState();
    if (!current?.activeSetNumber) {
      return;
    }

    controllerRef.current.incrementStat(current.matchId, current.activeSetNumber, stat);
    await persistAndRefresh();
  }

  async function onUndo(): Promise<void> {
    controllerRef.current.undo();
    await persistAndRefresh();
  }

  async function onRedo(): Promise<void> {
    controllerRef.current.redo();
    await persistAndRefresh();
  }

  function exportJson(): void {
    if (!state) {
      return;
    }

    const timeline = controllerRef.current.getTimeline();
    const payload = toExportJson(state, timeline.events, timeline.cursor);
    downloadText(`${state.matchId}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function exportCsv(): void {
    if (!state) {
      return;
    }

    downloadText(`${state.matchId}.csv`, toExportCsv(state), "text/csv;charset=utf-8");
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Triangle Stats</h1>
        <p>Live event-sourced tracking for Terminal Serves, First Ball Points, and Transition Points.</p>
      </header>

      <section className="control-panel">
        <input
          value={matchName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setMatchName(e.target.value)}
          placeholder="Match name"
        />
        <button onClick={() => void createMatch()}>Start Match</button>
        <input
          value={setNumberInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSetNumberInput(e.target.value)}
          className="set-input"
          placeholder="Set #"
        />
        <button disabled={!state} onClick={() => void startSet()}>
          Start Set
        </button>
        <button disabled={!state?.activeSetNumber} onClick={() => void endSet()}>
          End Set
        </button>
        <button disabled={!state} onClick={() => void endMatch()}>
          End Match
        </button>
        <button disabled={!state?.canUndo} onClick={() => void onUndo()}>
          Undo
        </button>
        <button disabled={!state?.canRedo} onClick={() => void onRedo()}>
          Redo
        </button>
        <button disabled={!state} onClick={exportJson}>
          Export JSON
        </button>
        <button disabled={!state} onClick={exportCsv}>
          Export CSV
        </button>
      </section>

      <main className="content-grid">
        <section className="board">
          <article className="vertex top">
            <h2>Terminal Serves</h2>
            <div className="value">{state?.aggregate.terminalServes ?? 0}</div>
            <div className="actions">
              {terminalActions.map((action) => (
                <button key={action.stat} onClick={() => void increment(action.stat)}>
                  {action.label}
                </button>
              ))}
            </div>
          </article>

          <article className="vertex left">
            <h2>First Ball Points</h2>
            <div className="value">{state?.aggregate.firstBallPoints ?? 0}</div>
            <div className="actions">
              {firstBallActions.map((action) => (
                <button key={action.stat} onClick={() => void increment(action.stat)}>
                  {action.label}
                </button>
              ))}
            </div>
          </article>

          <article className="vertex right">
            <h2>Transition Points</h2>
            <div className="value">{state?.aggregate.transitionPoints ?? 0}</div>
            <div className="actions">
              {transitionActions.map((action) => (
                <button key={action.stat} onClick={() => void increment(action.stat)}>
                  {action.label}
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="sidebar">
          <h3>Match Snapshot</h3>
          <p>{state ? `${state.matchName} (${state.matchId})` : "No active match"}</p>
          <p>
            Score: {state?.aggregate.usScore ?? 0} - {state?.aggregate.opponentScore ?? 0}
          </p>
          <p>Active set: {state?.activeSetNumber ?? "none"}</p>

          <h3>History</h3>
          <div className="history-list">
            {history.map((entry) => (
              <button key={entry.matchId} className="history-item" onClick={() => void restoreMatch(entry.matchId)}>
                <span>{entry.matchName}</span>
                <small>{new Date(entry.updatedAt).toLocaleString()}</small>
              </button>
            ))}
            {history.length === 0 && <p>No saved matches yet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
