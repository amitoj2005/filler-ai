import * as ort from "onnxruntime-node";
import * as path from "path";
import { floodFill, legalColors } from "../filler/rules";
import { encodePosition } from "../filler/encode";
import { ROWS, COLS } from "../filler/board";
import type { GameState } from "../filler/rules";
import type { Color } from "../filler/board";
import { pickMove as heuristicPickMove } from "./heuristic";

const MODEL_PATH = path.join(process.cwd(), "lib", "ai", "model.onnx");

let _session: ort.InferenceSession | null = null;

async function getSession(): Promise<ort.InferenceSession> {
  if (!_session) {
    _session = await ort.InferenceSession.create(MODEL_PATH);
  }
  return _session;
}

/**
 * Pick the AI's move (AI is always p2) using Mode B: one-ply value lookahead.
 *
 * For each legal color:
 *   1. Simulate flood fill → new p2 territory
 *   2. Encode the resulting position from p1's perspective (they move next)
 *   3. Run the value head; negate — bad for p1 = good for AI
 * Pick the color with the highest negated value.
 * Tie-break using policy logits from the current position.
 *
 * Falls back to the pure greedy heuristic if the model fails to load.
 */
export async function getAIMove(state: GameState): Promise<Color> {
  try {
    const session = await getSession();

    const myTerritory = state.p2Territory;
    const opTerritory = state.p1Territory;
    const legal = legalColors(state);

    // Policy logits from current position — used only for tie-breaking
    const curData = encodePosition(state.board, myTerritory, opTerritory);
    const curInput = new ort.Tensor("float32", curData, [1, 10, ROWS, COLS]);
    const { policy } = await session.run({ board: curInput });
    const policyData = policy.data as Float32Array;

    let bestColor = legal[0];
    let bestScore = -Infinity;

    for (const color of legal) {
      // Simulate AI applying this move
      const newMyTerritory = floodFill(state.board, myTerritory, color, opTerritory);

      // Encode from p1's perspective (they move next after us)
      const oppData = encodePosition(state.board, opTerritory, newMyTerritory);
      const oppInput = new ort.Tensor("float32", oppData, [1, 10, ROWS, COLS]);
      const { value: valueOut } = await session.run({ board: oppInput });
      const oppValue = (valueOut.data as Float32Array)[0];

      // Negate: low value for p1 = good for AI
      const score = -oppValue;

      if (
        score > bestScore ||
        (Math.abs(score - bestScore) < 1e-9 && policyData[color] > policyData[bestColor])
      ) {
        bestScore = score;
        bestColor = color;
      }
    }

    return bestColor;
  } catch {
    return heuristicPickMove(state, "p2", 0);
  }
}
