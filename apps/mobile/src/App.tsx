import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MatchDerivedState, MatchSummary, StatKey } from "@triangle-stats/shared";
import { toExportCsv, toExportJson } from "@triangle-stats/shared";
import { StatusBar } from "expo-status-bar";
import { AsyncStorageMatchRepository } from "./persistence/asyncStorageMatchRepository";
import { MobileMatchController } from "./controller";
import { shareTextFile } from "./services/exportService";

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

export function App() {
  const repository = useMemo(() => new AsyncStorageMatchRepository(AsyncStorage), []);
  const controllerRef = useRef(new MobileMatchController(repository));

  const [state, setState] = useState<MatchDerivedState | undefined>(undefined);
  const [history, setHistory] = useState<MatchSummary[]>([]);
  const [matchName, setMatchName] = useState("Practice Match");

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

  async function startSet(): Promise<void> {
    const current = controllerRef.current.getState();
    if (!current) {
      return;
    }

    const setNumber = (current.sets.at(-1)?.setNumber ?? 0) + 1;
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

  async function restoreMatch(matchId: string): Promise<void> {
    await controllerRef.current.restoreMatch(matchId);
    refreshState();
  }

  async function exportJson(): Promise<void> {
    const current = controllerRef.current.getState();
    if (!current) {
      return;
    }

    const timeline = controllerRef.current.getTimeline();
    const payload = toExportJson(current, timeline.events, timeline.cursor);
    await shareTextFile(`${current.matchId}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  async function exportCsv(): Promise<void> {
    const current = controllerRef.current.getState();
    if (!current) {
      return;
    }

    await shareTextFile(`${current.matchId}.csv`, toExportCsv(current), "text/csv");
  }

  const cards = [
    { title: "Terminal Serves", value: state?.aggregate.terminalServes ?? 0, actions: terminalActions },
    { title: "First Ball Points", value: state?.aggregate.firstBallPoints ?? 0, actions: firstBallActions },
    { title: "Transition Points", value: state?.aggregate.transitionPoints ?? 0, actions: transitionActions },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>Triangle Stats</Text>
        <Text style={styles.subtitle}>Real-time event sourced tracking for your match.</Text>

        <View style={styles.controls}>
          <TextInput value={matchName} onChangeText={setMatchName} placeholder="Match name" style={styles.input} />
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlButton} onPress={() => void createMatch()}>
              <Text style={styles.controlButtonText}>Start Match</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={() => void startSet()} disabled={!state}>
              <Text style={styles.controlButtonText}>Start Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={() => void endSet()} disabled={!state?.activeSetNumber}>
              <Text style={styles.controlButtonText}>End Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={() => void endMatch()} disabled={!state}>
              <Text style={styles.controlButtonText}>End Match</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlButton} onPress={() => void onUndo()} disabled={!state?.canUndo}>
              <Text style={styles.controlButtonText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={() => void onRedo()} disabled={!state?.canRedo}>
              <Text style={styles.controlButtonText}>Redo</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlButton} onPress={() => void exportJson()} disabled={!state}>
              <Text style={styles.controlButtonText}>Share JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={() => void exportCsv()} disabled={!state}>
              <Text style={styles.controlButtonText}>Share CSV</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.snapshot}>
          Score: {state?.aggregate.usScore ?? 0} - {state?.aggregate.opponentScore ?? 0} | Active set: {state?.activeSetNumber ?? "none"}
        </Text>

        <View style={styles.board}>
          {cards.map((card, index) => {
            const positionStyle = index === 0 ? styles.vertexTop : index === 1 ? styles.vertexLeft : styles.vertexRight;
            return (
              <View key={card.title} style={[styles.card, positionStyle]}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardValue}>{card.value}</Text>
                <View style={styles.actionGrid}>
                  {card.actions.map((action) => (
                    <TouchableOpacity key={action.stat} style={styles.actionButton} onPress={() => void increment(action.stat)}>
                      <Text style={styles.actionText}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.historyTitle}>Saved Matches</Text>
        {history.map((entry) => (
          <TouchableOpacity key={entry.matchId} style={styles.historyItem} onPress={() => void restoreMatch(entry.matchId)}>
            <Text style={styles.historyName}>{entry.matchName}</Text>
            <Text style={styles.historyTime}>{new Date(entry.updatedAt).toLocaleString()}</Text>
          </TouchableOpacity>
        ))}
        {history.length === 0 && <Text style={styles.emptyHistory}>No saved matches yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fef6e4",
  },
  page: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#1b1b28",
  },
  subtitle: {
    color: "#3f3f52",
  },
  controls: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cfd2d8",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  controlRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  controlButton: {
    backgroundColor: "#2f3e46",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  controlButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  snapshot: {
    fontSize: 15,
    color: "#2f3e46",
    fontWeight: "600",
  },
  card: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    width: "88%",
    maxWidth: 360,
    alignSelf: "center",
  },
  board: {
    position: "relative",
    minHeight: 760,
    borderRadius: 16,
    backgroundColor: "#fdecd8",
    borderWidth: 1,
    borderColor: "#f6cdb1",
  },
  vertexTop: {
    top: 16,
    alignSelf: "center",
  },
  vertexLeft: {
    bottom: 176,
    left: 12,
  },
  vertexRight: {
    bottom: 16,
    right: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  cardValue: {
    fontSize: 30,
    fontWeight: "800",
    color: "#078080",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#f25f4c",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionText: {
    color: "#fff",
    fontWeight: "600",
  },
  historyTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "700",
  },
  historyItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    gap: 3,
  },
  historyName: {
    fontWeight: "700",
    color: "#1f2933",
  },
  historyTime: {
    color: "#52606d",
    fontSize: 12,
  },
  emptyHistory: {
    color: "#52606d",
  },
});
