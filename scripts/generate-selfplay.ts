/**
 * Self-play data generator.
 *
 * Runs the heuristic AI against itself, logging every completed game to the
 * same Postgres tables used by the live app.  20 % of moves are random to
 * inject exploration diversity.
 *
 * Usage:
 *   npm run selfplay          # 100 games (default)
 *   npm run selfplay -- 500   # 500 games
 */
import { config } from "dotenv";
import { generateBoard } from "../lib/filler/board";
import { initState, applyMove, serializeState } from "../lib/filler/rules";
import { pickMove } from "../lib/ai/heuristic";
import type { Color } from "../lib/filler/board";
import type { SerializedState } from "../lib/filler/rules";

// ── Config ────────────────────────────────────────────────────────────────────

const MODEL_VERSION = "heuristic-selfplay-v0";
const ANON_USER_ID = "selfplay";
const RANDOM_RATE = 0.2;
const SANITY_CHECK_COUNT = 3;

// ── Play a single game in memory ──────────────────────────────────────────────

interface PlayedGame {
  initialBoard: ReturnType<typeof generateBoard>;
  moves: Array<{ player: "p1" | "p2"; color: number }>;
  finalState: SerializedState;
  finalScoreP1: number;
  finalScoreP2: number;
  winner: "p1" | "p2" | "draw";
}

function playGame(): PlayedGame {
  const board = generateBoard();
  let state = initState(board);
  const moves: Array<{ player: "p1" | "p2"; color: number }> = [];

  while (state.status === "active") {
    const player = state.currentTurn;
    const color: Color = pickMove(state, player, RANDOM_RATE);
    moves.push({ player, color });
    state = applyMove(state, player, color);
  }

  const winner =
    state.status === "p1_wins" ? "p1" : state.status === "p2_wins" ? "p2" : "draw";

  return {
    initialBoard: board,
    moves,
    finalState: serializeState(state),
    finalScoreP1: state.p1Territory.size,
    finalScoreP2: state.p2Territory.size,
    winner,
  };
}

// ── Replay sanity check ───────────────────────────────────────────────────────

type LoadGameFn = (id: string) => Promise<{
  initial_board: ReturnType<typeof generateBoard>;
  move_history: Array<{ player: "p1" | "p2"; color: number }>;
  final_score_human: number | null;
  final_score_ai: number | null;
  winner: string | null;
} | null>;

async function sanityCheck(gameIds: string[], loadGame: LoadGameFn): Promise<void> {
  const ids = gameIds
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(SANITY_CHECK_COUNT, gameIds.length));

  console.log(`\nSanity-checking ${ids.length} games by replaying move histories…`);
  let passed = 0;
  let failed = 0;

  for (const id of ids) {
    const row = await loadGame(id);
    if (!row) {
      console.error(`  FAIL  ${id} — not found in DB`);
      failed++;
      continue;
    }

    let state = initState(row.initial_board);
    for (const { player, color } of row.move_history) {
      state = applyMove(state, player, color as Color);
    }

    const replayedP1 = state.p1Territory.size;
    const replayedP2 = state.p2Territory.size;
    const storedP1 = row.final_score_human!;
    const storedP2 = row.final_score_ai!;

    if (replayedP1 === storedP1 && replayedP2 === storedP2) {
      console.log(
        `  ok    ${id}  p1=${replayedP1} p2=${replayedP2}  winner=${row.winner}  moves=${row.move_history.length}`,
      );
      passed++;
    } else {
      console.error(
        `  FAIL  ${id}  replayed p1=${replayedP1} p2=${replayedP2}  stored p1=${storedP1} p2=${storedP2}`,
      );
      failed++;
    }
  }

  if (failed > 0) {
    throw new Error(`Sanity check failed: ${failed}/${ids.length} games have mismatched scores`);
  }
  console.log(`All ${passed} checks passed.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load .env.local before importing lib/db, which throws if DATABASE_URL is absent.
  config({ path: ".env.local" });
  const { createCompleteGame, loadGame } = await import("../lib/db");

  const numGames = Number(process.argv[2] ?? 100);
  if (!Number.isFinite(numGames) || numGames < 1) {
    console.error("Usage: npm run selfplay -- <number-of-games>");
    process.exit(1);
  }

  console.log(
    `Generating ${numGames} self-play games (model=${MODEL_VERSION}, random=${RANDOM_RATE * 100}%)…\n`,
  );

  const gameIds: string[] = [];
  const t0 = Date.now();
  let p1Wins = 0;
  let p2Wins = 0;
  let draws = 0;

  for (let i = 0; i < numGames; i++) {
    const g = playGame();
    const id = await createCompleteGame(
      ANON_USER_ID,
      MODEL_VERSION,
      g.initialBoard,
      g.moves,
      g.finalState,
      g.winner,
      g.finalScoreP1,
      g.finalScoreP2,
    );
    gameIds.push(id);

    if (g.winner === "p1") p1Wins++;
    else if (g.winner === "p2") p2Wins++;
    else draws++;

    const pct = (((i + 1) / numGames) * 100).toFixed(0).padStart(3);
    process.stdout.write(
      `\r  ${pct}%  game ${i + 1}/${numGames}  (p1=${p1Wins} p2=${p2Wins} draw=${draws})`,
    );
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\nDone in ${elapsed}s.`);
  console.log(`  p1 wins: ${p1Wins} (${((p1Wins / numGames) * 100).toFixed(1)}%)`);
  console.log(`  p2 wins: ${p2Wins} (${((p2Wins / numGames) * 100).toFixed(1)}%)`);
  console.log(`  draws:   ${draws}`);

  await sanityCheck(gameIds, loadGame);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
