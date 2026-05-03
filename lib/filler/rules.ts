import { Board, Color, COLS, ROWS, cellIndex } from "./board";

export type Player = "p1" | "p2";
export type GameStatus = "active" | "p1_wins" | "p2_wins" | "draw";

export interface GameState {
  board: Board;
  // Sets of cell indices owned by each player
  p1Territory: Set<number>;
  p2Territory: Set<number>;
  currentTurn: Player;
  status: GameStatus;
  // The color currently held by each player (color of their territory)
  p1Color: Color;
  p2Color: Color;
}

export function initState(board: Board): GameState {
  const p1Start = cellIndex(ROWS - 1, 0); // bottom-left
  const p2Start = cellIndex(0, COLS - 1); // top-right
  return {
    board,
    p1Territory: new Set([p1Start]),
    p2Territory: new Set([p2Start]),
    currentTurn: "p1",
    status: "active",
    p1Color: board[ROWS - 1][0],
    p2Color: board[0][COLS - 1],
  };
}

// Returns null if valid, or an error string if invalid.
export function validateMove(state: GameState, player: Player, color: Color): string | null {
  if (state.status !== "active") return "game is over";
  if (state.currentTurn !== player) return "not your turn";
  if (color === state.p1Color) return "color already held by player 1";
  if (color === state.p2Color) return "color already held by player 2";
  return null;
}

function neighbors(idx: number, rows: number, cols: number): number[] {
  const r = Math.floor(idx / cols);
  const c = idx % cols;
  const result: number[] = [];
  if (r > 0) result.push((r - 1) * cols + c);
  if (r < rows - 1) result.push((r + 1) * cols + c);
  if (c > 0) result.push(r * cols + (c - 1));
  if (c < cols - 1) result.push(r * cols + (c + 1));
  return result;
}

// Expands territory to all contiguous cells of the chosen color.
export function floodFill(board: Board, territory: Set<number>, color: Color): Set<number> {
  const rows = board.length;
  const cols = board[0].length;
  const next = new Set(territory);
  const queue = [...territory];
  while (queue.length > 0) {
    const idx = queue.pop()!;
    for (const n of neighbors(idx, rows, cols)) {
      if (!next.has(n)) {
        const r = Math.floor(n / cols);
        const c = n % cols;
        if (board[r][c] === color) {
          next.add(n);
          queue.push(n);
        }
      }
    }
  }
  return next;
}

export function applyMove(state: GameState, player: Player, color: Color): GameState {
  const isP1 = player === "p1";
  const territory = floodFill(
    state.board,
    isP1 ? state.p1Territory : state.p2Territory,
    color,
  );
  const p1Territory = isP1 ? territory : state.p1Territory;
  const p2Territory = isP1 ? state.p2Territory : territory;
  const p1Color = isP1 ? color : state.p1Color;
  const p2Color = isP1 ? state.p2Color : color;

  const totalCells = ROWS * COLS;
  const claimed = p1Territory.size + p2Territory.size;
  let status: GameStatus = "active";
  if (claimed === totalCells) {
    if (p1Territory.size > p2Territory.size) status = "p1_wins";
    else if (p2Territory.size > p1Territory.size) status = "p2_wins";
    else status = "draw";
  }

  return {
    board: state.board,
    p1Territory,
    p2Territory,
    p1Color,
    p2Color,
    currentTurn: player === "p1" ? "p2" : "p1",
    status,
  };
}

// Returns legal color choices for the current player (excludes both players' colors).
export function legalColors(state: GameState): Color[] {
  return ([0, 1, 2, 3, 4, 5] as Color[]).filter(
    (c) => c !== state.p1Color && c !== state.p2Color,
  );
}

// Serialise/deserialise territory Sets to/from number arrays for JSON storage.
export function serializeState(state: GameState): SerializedState {
  return {
    board: state.board,
    p1Territory: [...state.p1Territory],
    p2Territory: [...state.p2Territory],
    currentTurn: state.currentTurn,
    status: state.status,
    p1Color: state.p1Color,
    p2Color: state.p2Color,
  };
}

export interface SerializedState {
  board: Board;
  p1Territory: number[];
  p2Territory: number[];
  currentTurn: Player;
  status: GameStatus;
  p1Color: Color;
  p2Color: Color;
}

export function deserializeState(s: SerializedState): GameState {
  return {
    board: s.board,
    p1Territory: new Set(s.p1Territory),
    p2Territory: new Set(s.p2Territory),
    currentTurn: s.currentTurn,
    status: s.status,
    p1Color: s.p1Color,
    p2Color: s.p2Color,
  };
}
