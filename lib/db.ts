import { neon } from "@neondatabase/serverless";
import type { Board } from "./filler/board";
import type { SerializedState } from "./filler/rules";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = neon(process.env.DATABASE_URL);

// ── Types matching the DB schema ──────────────────────────────────────────────

export interface GameRow {
  id: string;
  created_at: Date;
  completed_at: Date | null;
  winner: "p1" | "p2" | "draw" | null;
  initial_board: Board;
  move_history: Array<{ player: "p1" | "p2"; color: number }>;
  model_version: string;
  final_score_human: number | null;
  final_score_ai: number | null;
  anonymous_user_id: string;
  current_state: SerializedState;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function createGame(
  anonymousUserId: string,
  initialState: SerializedState,
  modelVersion = "heuristic-v0",
): Promise<string> {
  const rows = await sql`
    INSERT INTO games (
      anonymous_user_id,
      initial_board,
      current_state,
      move_history,
      model_version
    ) VALUES (
      ${anonymousUserId},
      ${JSON.stringify(initialState.board)},
      ${JSON.stringify(initialState)},
      ${"[]"},
      ${modelVersion}
    )
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

// Single-query insert for a fully-played game (used by the self-play script).
export async function createCompleteGame(
  anonymousUserId: string,
  modelVersion: string,
  initialBoard: Board,
  moveHistory: Array<{ player: "p1" | "p2"; color: number }>,
  finalState: SerializedState,
  winner: "p1" | "p2" | "draw",
  scoreP1: number,
  scoreP2: number,
): Promise<string> {
  const rows = await sql`
    INSERT INTO games (
      anonymous_user_id,
      initial_board,
      current_state,
      move_history,
      model_version,
      completed_at,
      winner,
      final_score_human,
      final_score_ai
    ) VALUES (
      ${anonymousUserId},
      ${JSON.stringify(initialBoard)},
      ${JSON.stringify(finalState)},
      ${JSON.stringify(moveHistory)},
      ${modelVersion},
      NOW(),
      ${winner},
      ${scoreP1},
      ${scoreP2}
    )
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function loadGame(gameId: string): Promise<GameRow | null> {
  const rows = await sql`SELECT * FROM games WHERE id = ${gameId}`;
  return rows.length > 0 ? (rows[0] as GameRow) : null;
}

export async function appendMove(
  gameId: string,
  player: "p1" | "p2",
  color: number,
  newState: SerializedState,
): Promise<void> {
  await sql`
    UPDATE games
    SET
      move_history  = move_history || ${JSON.stringify({ player, color })}::jsonb,
      current_state = ${JSON.stringify(newState)}
    WHERE id = ${gameId}
  `;
}

export async function completeGame(
  gameId: string,
  winner: "p1" | "p2" | "draw",
  finalState: SerializedState,
  scoreHuman: number,
  scoreAi: number,
): Promise<void> {
  await sql`
    UPDATE games
    SET
      completed_at      = NOW(),
      winner            = ${winner},
      current_state     = ${JSON.stringify(finalState)},
      final_score_human = ${scoreHuman},
      final_score_ai    = ${scoreAi}
    WHERE id = ${gameId}
  `;
}

export async function getStats(): Promise<{
  totalGames: number;
  completedGames: number;
  currentModelVersion: string;
}> {
  const rows = await sql`
    SELECT
      COUNT(*)                                            AS total_games,
      COUNT(*) FILTER (WHERE completed_at IS NOT NULL)   AS completed_games,
      MAX(model_version)                                  AS current_model_version
    FROM games
  `;
  const row = rows[0] as {
    total_games: string;
    completed_games: string;
    current_model_version: string | null;
  };
  return {
    totalGames: Number(row.total_games),
    completedGames: Number(row.completed_games),
    currentModelVersion: row.current_model_version ?? "heuristic-v0",
  };
}

const MILESTONES = [100, 500, 1000, 5000] as const;

export async function getEnrichedStats(): Promise<{
  totalGamesCompleted: number;
  humanGamesCompleted: number;
  currentModel: string;
  gamesTrainedOn: number;
  milestones: number[];
  nextMilestone: number;
}> {
  const [gameRows, modelRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL)                              AS total_completed,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND anonymous_user_id != 'selfplay') AS human_completed
      FROM games
    `,
    sql`
      SELECT version, game_count
      FROM   model_versions
      ORDER  BY trained_at DESC
      LIMIT  1
    `,
  ]);

  const g = gameRows[0] as { total_completed: string; human_completed: string };
  const m = modelRows[0] as { version: string; game_count: number } | undefined;

  const humanGamesCompleted = Number(g.human_completed);
  const nextMilestone =
    ([...MILESTONES] as number[]).find((ms) => ms > humanGamesCompleted) ??
    MILESTONES[MILESTONES.length - 1];

  return {
    totalGamesCompleted: Number(g.total_completed),
    humanGamesCompleted,
    currentModel: m?.version ?? "heuristic-v0",
    gamesTrainedOn: m?.game_count ?? 0,
    milestones: [...MILESTONES],
    nextMilestone,
  };
}
