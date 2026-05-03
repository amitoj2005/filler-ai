import { floodFill, legalColors } from "../filler/rules";
import type { GameState, Player } from "../filler/rules";
import type { Color } from "../filler/board";

export const DEFAULT_RANDOM_RATE = 0.2;

/**
 * Pick a move for `player` using a one-step greedy heuristic.
 *
 * For each legal color, simulate the resulting flood fill and score by the
 * number of cells gained.  With probability `randomRate` (default 20%), skip
 * the evaluation and return a uniformly random legal color instead — this
 * injects exploration so self-play games don't all collapse to identical lines.
 *
 * Ties in greedy score are broken by the first-encountered color.
 */
export function pickMove(
  state: GameState,
  player: Player,
  randomRate = DEFAULT_RANDOM_RATE,
): Color {
  const legal = legalColors(state);

  if (Math.random() < randomRate) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  const myTerritory = player === "p1" ? state.p1Territory : state.p2Territory;
  const opTerritory = player === "p1" ? state.p2Territory : state.p1Territory;

  let bestColor = legal[0];
  let bestGain = -1;

  for (const color of legal) {
    const gained = floodFill(state.board, myTerritory, color, opTerritory).size - myTerritory.size;
    if (gained > bestGain) {
      bestGain = gained;
      bestColor = color;
    }
  }

  return bestColor;
}
