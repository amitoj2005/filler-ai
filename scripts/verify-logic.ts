// Quick smoke-test: play 10 games and assert all 56 cells are always claimed.
import { generateBoard } from "../lib/filler/board";
import { initState, applyMove } from "../lib/filler/rules";
import { pickMove } from "../lib/ai/heuristic";
import type { Color } from "../lib/filler/board";

let allOk = true;
for (let i = 0; i < 10; i++) {
  const board = generateBoard();
  let state = initState(board);
  let moveCount = 0;
  while (state.status === "active") {
    const color: Color = pickMove(state, state.currentTurn, 0.2);
    state = applyMove(state, state.currentTurn, color);
    moveCount++;
  }
  const total = state.p1Territory.size + state.p2Territory.size;
  const ok = total === 56;
  if (!ok) allOk = false;
  console.log(
    (ok ? "ok  " : "FAIL"),
    `moves=${moveCount}  p1=${state.p1Territory.size}  p2=${state.p2Territory.size}  winner=${state.status}`,
  );
}
console.log(allOk ? "\nAll 10 games valid (56 cells claimed each)." : "\nFAILURES detected!");
process.exit(allOk ? 0 : 1);
