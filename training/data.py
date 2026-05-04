"""
Filler AI – data extraction and encoding.

Board convention (matches lib/filler/board.ts + rules.ts exactly):
  ROWS = 8, COLS = 7
  board[r][c]  r=0 is top row, r=7 is bottom row
  cell index   idx = r * COLS + c
  p1 starts at bottom-left: idx = (ROWS-1)*COLS + 0 = 49
  p2 starts at top-right:   idx = 0*COLS + (COLS-1)  = 6

Encoding tensor shape: (10, ROWS, COLS) = (10, 8, 7)
  Channels 0-5 : one-hot board color
  Channel  6   : current player territory mask
  Channel  7   : opponent territory mask
  Channel  8   : current player frontier
  Channel  9   : opponent frontier
"""

from __future__ import annotations

import os
from collections import deque
from pathlib import Path
from typing import Generator, TypedDict

import random as _random

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ── Constants (must match board.ts) ──────────────────────────────────────────

ROWS: int = 8
COLS: int = 7
NUM_COLORS: int = 6
TOTAL_CELLS: int = ROWS * COLS  # 56


def generate_board() -> np.ndarray:
    """
    Return a ROWS×COLS board (shape (8,7) int8) where:
      - no two adjacent cells share a color, and
      - the two starting corners (bottom-left, top-right) have different colors.
    Matches generateBoard() in lib/filler/board.ts exactly.
    """
    while True:
        board = np.empty((ROWS, COLS), dtype=np.int8)
        for r in range(ROWS):
            for c in range(COLS):
                forbidden: set[int] = set()
                if r > 0:
                    forbidden.add(int(board[r - 1, c]))
                if c > 0:
                    forbidden.add(int(board[r, c - 1]))
                choices = [x for x in range(NUM_COLORS) if x not in forbidden]
                board[r, c] = _random.choice(choices)
        if board[ROWS - 1, 0] != board[0, COLS - 1]:
            return board


def legal_colors(p1_color: int, p2_color: int) -> list[int]:
    """Colors that are legal for either player to pick (excludes both players' colors)."""
    return [c for c in range(NUM_COLORS) if c != p1_color and c != p2_color]


# ── DB connection ─────────────────────────────────────────────────────────────

def connect_db() -> psycopg2.extensions.connection:
    """Read DATABASE_URL from .env.local in the project root and connect."""
    env_path = Path(__file__).parent.parent / ".env.local"
    load_dotenv(env_path)
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set – add it to .env.local")
    return psycopg2.connect(url)


# ── Game data types ───────────────────────────────────────────────────────────

class MoveRecord(TypedDict):
    player: str   # "p1" or "p2"
    color: int    # 0-5


class GameRecord(TypedDict):
    id: str
    initial_board: np.ndarray   # shape (ROWS, COLS) dtype int8
    move_history: list[MoveRecord]
    winner: str                 # "p1", "p2", or "draw"


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_games(model_version: str) -> list[GameRecord]:
    """Return all completed games for a given model_version."""
    conn = connect_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, initial_board, move_history, winner
                FROM   games
                WHERE  model_version = %s
                  AND  completed_at  IS NOT NULL
                ORDER  BY created_at
                """,
                (model_version,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    games: list[GameRecord] = []
    for row in rows:
        games.append(
            GameRecord(
                id=row["id"],
                initial_board=np.array(row["initial_board"], dtype=np.int8),
                move_history=list(row["move_history"]),
                winner=row["winner"],
            )
        )
    return games


# ── Pure game logic (mirrors lib/filler/rules.ts exactly) ────────────────────

def _cell_index(r: int, c: int) -> int:
    return r * COLS + c


# Pre-computed neighbor lists — built once at import time so _flood_fill never
# recomputes adjacency on each call.
def _build_neighbors() -> list[list[int]]:
    table: list[list[int]] = []
    for idx in range(TOTAL_CELLS):
        r, c = divmod(idx, COLS)
        nbrs: list[int] = []
        if r > 0:         nbrs.append((r - 1) * COLS + c)
        if r < ROWS - 1:  nbrs.append((r + 1) * COLS + c)
        if c > 0:         nbrs.append(r * COLS + (c - 1))
        if c < COLS - 1:  nbrs.append(r * COLS + (c + 1))
        table.append(nbrs)
    return table

_NEIGHBORS: list[list[int]] = _build_neighbors()


def _neighbors(idx: int) -> list[int]:
    return _NEIGHBORS[idx]


def _flood_fill(
    board: np.ndarray,
    territory: set[int],
    color: int,
    excluded: set[int] | None = None,
) -> set[int]:
    """
    Expand territory to all contiguous cells of `color`.
    Cells in `excluded` (opponent territory) are never absorbed.
    Mirrors floodFill() in rules.ts including the excluded-set fix.
    """
    next_territory: set[int] = set(territory)
    board_flat = board.ravel()          # flat view — avoids per-cell divmod
    q: deque[int] = deque(territory)
    while q:
        idx = q.popleft()
        for n in _NEIGHBORS[idx]:
            if n in next_territory:
                continue
            if excluded is not None and n in excluded:
                continue
            if board_flat[n] == color:
                next_territory.add(n)
                q.append(n)
    return next_territory


def _apply_move(
    board: np.ndarray,
    p1_territory: set[int],
    p2_territory: set[int],
    player: str,
    color: int,
) -> tuple[set[int], set[int]]:
    """Return (new_p1_territory, new_p2_territory) after applying the move."""
    is_p1 = player == "p1"
    my_territory  = p1_territory if is_p1 else p2_territory
    opp_territory = p2_territory if is_p1 else p1_territory
    new_territory = _flood_fill(board, my_territory, color, excluded=opp_territory)
    if is_p1:
        return new_territory, p2_territory
    else:
        return p1_territory, new_territory


# ── Replay ────────────────────────────────────────────────────────────────────

class PositionRecord(TypedDict):
    board: np.ndarray       # shape (ROWS, COLS) int8, immutable original board
    p1_territory: set[int]
    p2_territory: set[int]
    player_to_move: str     # "p1" or "p2"


def replay_game(game: GameRecord) -> Generator[PositionRecord, None, None]:
    """
    Yield the board position immediately BEFORE each move in the game.
    Territories are shallow-copied on each yield so callers can safely
    mutate them (encode_position only reads them).
    """
    board = game["initial_board"]
    p1_territory: set[int] = {_cell_index(ROWS - 1, 0)}   # bottom-left, idx=49
    p2_territory: set[int] = {_cell_index(0, COLS - 1)}   # top-right,   idx=6

    for move in game["move_history"]:
        yield PositionRecord(
            board=board,
            p1_territory=set(p1_territory),
            p2_territory=set(p2_territory),
            player_to_move=move["player"],
        )
        p1_territory, p2_territory = _apply_move(
            board,
            p1_territory,
            p2_territory,
            move["player"],
            move["color"],
        )


# ── Encoding ──────────────────────────────────────────────────────────────────

def _territory_to_mask(territory: set[int]) -> np.ndarray:
    """Return flat array of length TOTAL_CELLS with 1.0 at owned cells."""
    mask = np.zeros(TOTAL_CELLS, dtype=np.float32)
    for idx in territory:
        mask[idx] = 1.0
    return mask.reshape(ROWS, COLS)


def _frontier(territory: set[int]) -> set[int]:
    """Cells adjacent to territory but not in territory."""
    result: set[int] = set()
    for idx in territory:
        for n in _neighbors(idx):
            if n not in territory:
                result.add(n)
    return result


def encode_position(
    board: np.ndarray,
    current_player_territory: set[int],
    opponent_territory: set[int],
) -> np.ndarray:
    """
    Encode a game position into a (10, ROWS, COLS) float32 tensor.

    Channel layout:
      0-5  one-hot board color (channel k = 1 where board[r,c] == k)
      6    current player territory mask
      7    opponent territory mask
      8    current player frontier
      9    opponent frontier
    """
    tensor = np.zeros((10, ROWS, COLS), dtype=np.float32)

    # Channels 0-5: one-hot board colors
    for k in range(NUM_COLORS):
        tensor[k] = (board == k).astype(np.float32)

    # Channels 6-7: territory masks
    tensor[6] = _territory_to_mask(current_player_territory)
    tensor[7] = _territory_to_mask(opponent_territory)

    # Channels 8-9: frontiers
    tensor[8] = _territory_to_mask(_frontier(current_player_territory))
    tensor[9] = _territory_to_mask(_frontier(opponent_territory))

    return tensor


# ── Mirror augmentation ───────────────────────────────────────────────────────

def _mirror_territory(territory: set[int]) -> set[int]:
    """Horizontal (left-right) mirror of a territory set."""
    return {(idx // COLS) * COLS + (COLS - 1 - idx % COLS) for idx in territory}


def _mirror_board(board: np.ndarray) -> np.ndarray:
    """Horizontal (left-right) flip of the board array."""
    return np.ascontiguousarray(board[:, ::-1])


# ── Training set ──────────────────────────────────────────────────────────────

class TrainingExample(TypedDict):
    input_tensor: np.ndarray   # shape (10, ROWS, COLS) float32
    policy_target: int         # 0-5, color actually played
    value_target: float        # +1 win, -1 loss, 0 draw (from player-to-move POV)
    player_to_move: str        # "p1" or "p2" — for diagnostic value-split in train.py


def build_training_set(
    games: list[GameRecord],
) -> Generator[TrainingExample, None, None]:
    """
    Yield one TrainingExample per position per game, plus its mirror.

    - input_tensor encoded from the perspective of player-to-move.
    - policy_target  = color actually chosen at that position.
    - value_target   = +1 if player-to-move won, -1 if they lost, 0 if draw.
    - Mirror augmentation: each position also yields its left-right flip
      (same policy/value targets – colors and outcome are flip-invariant).
    """
    for game in games:
        winner = game["winner"]

        for pos, move in zip(replay_game(game), game["move_history"]):
            player = pos["player_to_move"]
            board  = pos["board"]

            cur_territory = pos["p1_territory"] if player == "p1" else pos["p2_territory"]
            opp_territory = pos["p2_territory"] if player == "p1" else pos["p1_territory"]

            policy: int = move["color"]

            if winner == "draw":
                value: float = 0.0
            elif winner == player:
                value = 1.0
            else:
                value = -1.0

            # Original position
            tensor = encode_position(board, cur_territory, opp_territory)
            yield TrainingExample(
                input_tensor=tensor,
                policy_target=policy,
                value_target=value,
                player_to_move=player,
            )

            # Horizontally mirrored position
            m_board  = _mirror_board(board)
            m_cur    = _mirror_territory(cur_territory)
            m_opp    = _mirror_territory(opp_territory)
            m_tensor = encode_position(m_board, m_cur, m_opp)
            yield TrainingExample(
                input_tensor=m_tensor,
                policy_target=policy,
                value_target=value,
                player_to_move=player,
            )
