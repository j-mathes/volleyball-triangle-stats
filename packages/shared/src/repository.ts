import type { MatchEvent } from "./types";

export interface MatchTimelineRecord {
  matchId: string;
  matchName: string;
  createdAt: string;
  updatedAt: string;
  cursor: number;
  events: MatchEvent[];
}

export interface MatchSummary {
  matchId: string;
  matchName: string;
  createdAt: string;
  updatedAt: string;
  eventCount: number;
  cursor: number;
}

export interface MatchRepository {
  createMatch(matchId: string, matchName: string, createdAt: string): Promise<MatchTimelineRecord>;
  listMatches(): Promise<MatchSummary[]>;
  loadMatch(matchId: string): Promise<MatchTimelineRecord | undefined>;
  saveTimeline(record: MatchTimelineRecord): Promise<void>;
  deleteMatch(matchId: string): Promise<void>;
}
