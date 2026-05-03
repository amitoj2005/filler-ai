export const COLS = 7;
export const ROWS = 8;
export const NUM_COLORS = 6;

export type Color = 0 | 1 | 2 | 3 | 4 | 5;
export type Board = Color[][];

// Returns a ROWS×COLS board where no two adjacent cells share a color.
export function generateBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < ROWS; r++) {
    board.push([]);
    for (let c = 0; c < COLS; c++) {
      const forbidden = new Set<Color>();
      if (r > 0) forbidden.add(board[r - 1][c]);
      if (c > 0) forbidden.add(board[r][c - 1]);
      const choices = (Array.from({ length: NUM_COLORS }, (_, i) => i) as Color[]).filter(
        (x) => !forbidden.has(x),
      );
      board[r].push(choices[Math.floor(Math.random() * choices.length)]);
    }
  }
  return board;
}

export function cellIndex(r: number, c: number): number {
  return r * COLS + c;
}
