import { describe, it, expect } from "vitest";
import { generateBoard, ROWS, COLS } from "./board";
import type { Color } from "./board";
import {
  initState,
  validateMove,
  applyMove,
  floodFill,
  legalColors,
  serializeState,
  deserializeState,
} from "./rules";

function freshState() {
  return initState(generateBoard());
}

describe("initState", () => {
  it("p1 owns bottom-left, p2 owns top-right", () => {
    const s = freshState();
    expect(s.p1Territory.has((ROWS - 1) * COLS + 0)).toBe(true);
    expect(s.p2Territory.has(0 * COLS + (COLS - 1))).toBe(true);
  });

  it("starts with p1's turn", () => {
    expect(freshState().currentTurn).toBe("p1");
  });

  it("status is active", () => {
    expect(freshState().status).toBe("active");
  });
});

describe("validateMove", () => {
  it("rejects p2's color for p1", () => {
    const s = freshState();
    expect(validateMove(s, "p1", s.p2Color)).toBeTruthy();
  });

  it("rejects p1's own color", () => {
    const s = freshState();
    expect(validateMove(s, "p1", s.p1Color)).toBeTruthy();
  });

  it("rejects out-of-turn move", () => {
    const s = freshState();
    const legal = legalColors(s)[0];
    expect(validateMove(s, "p2", legal)).toBeTruthy();
  });

  it("accepts a legal color", () => {
    const s = freshState();
    const legal = legalColors(s)[0];
    expect(validateMove(s, "p1", legal)).toBeNull();
  });
});

describe("legalColors", () => {
  it("returns exactly 4 colors (6 minus 2 held)", () => {
    const s = freshState();
    expect(legalColors(s)).toHaveLength(4);
  });

  it("never includes either player's color", () => {
    const s = freshState();
    const legal = legalColors(s);
    expect(legal).not.toContain(s.p1Color);
    expect(legal).not.toContain(s.p2Color);
  });
});

describe("floodFill", () => {
  it("expands territory to adjacent matching cells", () => {
    // Build a tiny 1-row all-same-color board manually
    const board: Color[][] = [[0, 0, 0, 0, 0, 0, 0]];
    const territory = new Set([0]); // cell 0
    const result = floodFill(board, territory, 0);
    // Should grab all 7 cells
    expect(result.size).toBe(7);
  });

  it("does not expand to non-matching neighbors", () => {
    const board: Color[][] = [[0, 1, 0, 0, 0, 0, 0]];
    const territory = new Set([0]);
    const result = floodFill(board, territory, 0);
    expect(result.has(0)).toBe(true);
    expect(result.has(1)).toBe(false); // color 1 cell
  });
});

describe("applyMove", () => {
  it("switches turn after a move", () => {
    const s = freshState();
    const color = legalColors(s)[0];
    const next = applyMove(s, "p1", color);
    expect(next.currentTurn).toBe("p2");
  });

  it("updates p1Color after p1 move", () => {
    const s = freshState();
    const color = legalColors(s)[0];
    const next = applyMove(s, "p1", color);
    expect(next.p1Color).toBe(color);
  });

  it("territory size is non-decreasing", () => {
    const s = freshState();
    const color = legalColors(s)[0];
    const next = applyMove(s, "p1", color);
    expect(next.p1Territory.size).toBeGreaterThanOrEqual(s.p1Territory.size);
  });

  it("detects win when all cells are claimed", () => {
    // Force a state where p1 owns all but 1 cell, p2 owns that 1 cell,
    // and p1 can pick a color to claim it.
    const board = generateBoard();
    const total = ROWS * COLS;
    const allCells = new Set(Array.from({ length: total }, (_, i) => i));
    const p2Cell = 0 * COLS + (COLS - 1); // top-right
    const p1Cells = new Set([...allCells].filter((i) => i !== p2Cell));
    const p2Color = board[0][COLS - 1] as Color;

    // Give p1 a color that isn't p2's color
    const p1Color = (([0, 1, 2, 3, 4, 5] as Color[]).find(
      (c) => c !== p2Color,
    ) ?? 0) as Color;

    // Artificially set up the state
    const forcedState = {
      board,
      p1Territory: p1Cells,
      p2Territory: new Set([p2Cell]),
      currentTurn: "p1" as const,
      status: "active" as const,
      p1Color,
      p2Color,
    };

    // Any legal color ends the game (p1 has all cells)
    const color = legalColors(forcedState)[0];
    const next = applyMove(forcedState, "p1", color);
    expect(next.status).not.toBe("active");
  });
});

describe("serialize / deserialize roundtrip", () => {
  it("round-trips correctly", () => {
    const s = freshState();
    const s2 = deserializeState(serializeState(s));
    expect(s2.p1Territory).toEqual(s.p1Territory);
    expect(s2.p2Territory).toEqual(s.p2Territory);
    expect(s2.board).toEqual(s.board);
    expect(s2.currentTurn).toBe(s.currentTurn);
    expect(s2.status).toBe(s.status);
  });
});
