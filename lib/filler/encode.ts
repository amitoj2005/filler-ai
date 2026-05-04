import { ROWS, COLS } from "./board";
import type { Board, Color } from "./board";

const TOTAL_CELLS = ROWS * COLS;

function neighbors(idx: number): number[] {
  const r = Math.floor(idx / COLS);
  const c = idx % COLS;
  const result: number[] = [];
  if (r > 0) result.push((r - 1) * COLS + c);
  if (r < ROWS - 1) result.push((r + 1) * COLS + c);
  if (c > 0) result.push(r * COLS + (c - 1));
  if (c < COLS - 1) result.push(r * COLS + (c + 1));
  return result;
}

function frontier(territory: Set<number>): Set<number> {
  const result = new Set<number>();
  for (const idx of territory) {
    for (const n of neighbors(idx)) {
      if (!territory.has(n)) result.add(n);
    }
  }
  return result;
}

/**
 * Encode a game position into a flat Float32Array of shape (10, ROWS, COLS).
 *
 * Channel layout (matches training/data.py encode_position exactly):
 *   0-5  one-hot board color
 *   6    current player territory mask
 *   7    opponent territory mask
 *   8    current player frontier
 *   9    opponent frontier
 *
 * The caller is responsible for providing territories from the perspective of
 * the player who is about to move (i.e. swap for the opponent's turn).
 */
export function encodePosition(
  board: Board,
  currentTerritory: Set<number>,
  opponentTerritory: Set<number>,
): Float32Array {
  const tensor = new Float32Array(10 * TOTAL_CELLS);

  // Channels 0-5: one-hot board colors
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color: Color = board[r][c];
      tensor[color * TOTAL_CELLS + r * COLS + c] = 1;
    }
  }

  // Channel 6: current territory
  for (const idx of currentTerritory) {
    tensor[6 * TOTAL_CELLS + idx] = 1;
  }

  // Channel 7: opponent territory
  for (const idx of opponentTerritory) {
    tensor[7 * TOTAL_CELLS + idx] = 1;
  }

  // Channel 8: current frontier
  for (const idx of frontier(currentTerritory)) {
    tensor[8 * TOTAL_CELLS + idx] = 1;
  }

  // Channel 9: opponent frontier
  for (const idx of frontier(opponentTerritory)) {
    tensor[9 * TOTAL_CELLS + idx] = 1;
  }

  return tensor;
}
