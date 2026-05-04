"""
Sanity-check eval: neural agent (Mode B: one-ply value lookahead) vs greedy heuristic.

Mode B inference:
  For each legal color, simulate the resulting position, encode from the
  *opponent's* perspective, run the value head, negate (bad for them = good for
  us), pick the highest-scoring color.  Policy logits break ties.

Usage (from repo root):
    training/.venv/Scripts/python.exe training/eval.py
"""

from __future__ import annotations

import random
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).parent))

from data import (
    COLS,
    NUM_COLORS,
    ROWS,
    TOTAL_CELLS,
    _apply_move,
    _cell_index,
    _flood_fill,
    encode_position,
    generate_board,
    legal_colors,
)

ONNX_PATH   = Path(__file__).parent.parent / "lib" / "ai" / "model.onnx"
N_GAMES     = 20
RANDOM_SEED = 0

random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)

# ── Load model ────────────────────────────────────────────────────────────────

session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
print(f"Loaded {ONNX_PATH.name}")

# ── Agents ────────────────────────────────────────────────────────────────────

def neural_move_b(
    board: np.ndarray,
    my_territory: set[int],
    opp_territory: set[int],
    my_color: int,
    opp_color: int,
) -> int:
    """
    Mode B: one-ply value lookahead.

    For each legal color:
      1. Simulate the flood fill → new_my_territory
      2. Encode the resulting position from the OPPONENT's perspective
         (opp_territory becomes current, new_my_territory becomes opponent)
      3. Run the value head; negate its output
         (opponent's bad position = our good position)
    Pick the color with the highest negated value.
    Tie-break using the policy logit from the current position.
    """
    legal = legal_colors(my_color, opp_color)

    # Policy logits for tie-breaking
    cur_tensor = encode_position(board, my_territory, opp_territory)
    cur_inp    = cur_tensor[np.newaxis]
    policy_logits = session.run(["policy"], {"board": cur_inp})[0][0]  # (6,)

    best_color = legal[0]
    best_score = -float("inf")

    for color in legal:
        # Simulate our move
        new_my_terr = _flood_fill(board, my_territory, color, excluded=opp_territory)

        # Encode from opponent's perspective (they move next)
        opp_tensor = encode_position(board, opp_territory, new_my_terr)
        opp_inp    = opp_tensor[np.newaxis]
        opp_val    = float(session.run(["value"], {"board": opp_inp})[0][0][0])

        # Negate: low value for opponent = high value for us
        score = -opp_val

        # Prefer higher score; break ties with policy logit
        if score > best_score or (
            abs(score - best_score) < 1e-9
            and float(policy_logits[color]) > float(policy_logits[best_color])
        ):
            best_score = score
            best_color = color

    return best_color


def heuristic_move(
    board: np.ndarray,
    my_territory: set[int],
    opp_territory: set[int],
    my_color: int,
    opp_color: int,
) -> int:
    """Pure greedy: pick color maximising immediate territory gain."""
    legal = legal_colors(my_color, opp_color)
    best_color = legal[0]
    best_gain  = -1
    for color in legal:
        gained = len(_flood_fill(board, my_territory, color, excluded=opp_territory)) - len(my_territory)
        if gained > best_gain:
            best_gain  = gained
            best_color = color
    return best_color


# ── Game loop ─────────────────────────────────────────────────────────────────

def play_game(neural_is_p1: bool, profile: bool = False) -> tuple[str, int]:
    """Play one full game. Returns (result, n_moves)."""
    board      = generate_board()
    p1_terr    = {_cell_index(ROWS - 1, 0)}
    p2_terr    = {_cell_index(0, COLS - 1)}
    p1_color   = int(board[ROWS - 1, 0])
    p2_color   = int(board[0, COLS - 1])
    cur_player = "p1"
    n_moves    = 0

    while True:
        is_p1      = cur_player == "p1"
        my_terr    = p1_terr  if is_p1 else p2_terr
        opp_terr   = p2_terr  if is_p1 else p1_terr
        my_color   = p1_color if is_p1 else p2_color
        opp_color  = p2_color if is_p1 else p1_color
        is_neural  = (cur_player == "p1") == neural_is_p1

        t0 = time.perf_counter()
        if is_neural:
            color = neural_move_b(board, my_terr, opp_terr, my_color, opp_color)
        else:
            color = heuristic_move(board, my_terr, opp_terr, my_color, opp_color)
        ms = (time.perf_counter() - t0) * 1000

        if profile and n_moves < 6:
            agent = "neural" if is_neural else "heuristic"
            print(f"    move {n_moves+1:2d} ({agent:9s}): {ms:.2f}ms -> color {color}")

        p1_terr, p2_terr = _apply_move(board, p1_terr, p2_terr, cur_player, color)
        n_moves += 1

        if cur_player == "p1":
            p1_color = color
        else:
            p2_color = color

        if len(p1_terr) + len(p2_terr) == TOTAL_CELLS:
            if len(p1_terr) > len(p2_terr):
                winner_is_p1 = True
            elif len(p2_terr) > len(p1_terr):
                winner_is_p1 = False
            else:
                result = "draw"
                break
            result = "neural" if (winner_is_p1 == neural_is_p1) else "heuristic"
            break

        cur_player = "p2" if cur_player == "p1" else "p1"

    return result, n_moves


# ── Profile first game ────────────────────────────────────────────────────────

print("\n-- Profile: first game (neural as p1, Mode B) --")
r, m = play_game(neural_is_p1=True, profile=True)
print(f"  result={r}  moves={m}")

# ── Run N_GAMES games ─────────────────────────────────────────────────────────

print(f"\nPlaying {N_GAMES} games (neural Mode B vs greedy heuristic, alternating sides)...\n")

neural_wins    = 0
heuristic_wins = 0
draws          = 0
t_total        = time.time()

for i in range(N_GAMES):
    neural_is_p1 = (i % 2 == 0)
    t0 = time.time()
    result, n_moves = play_game(neural_is_p1)
    elapsed = time.time() - t0

    if result == "neural":
        neural_wins += 1
    elif result == "heuristic":
        heuristic_wins += 1
    else:
        draws += 1

    print(f"  game {i+1:3d}: {result:10s}  moves={n_moves:3d}  {elapsed:.3f}s")

total_elapsed = time.time() - t_total
neural_pct    = 100.0 * neural_wins    / N_GAMES
heuristic_pct = 100.0 * heuristic_wins / N_GAMES
draw_pct      = 100.0 * draws          / N_GAMES

print(f"\n=== Results ({N_GAMES} games, {total_elapsed:.1f}s total) ===")
print(f"  Neural wins    : {neural_wins:3d}  ({neural_pct:.1f}%)")
print(f"  Heuristic wins : {heuristic_wins:3d}  ({heuristic_pct:.1f}%)")
print(f"  Draws          : {draws:3d}  ({draw_pct:.1f}%)")

ACCEPTANCE_THRESHOLD = 45.0
if neural_pct >= ACCEPTANCE_THRESHOLD:
    print(f"\nPASS  neural win rate {neural_pct:.1f}% >= {ACCEPTANCE_THRESHOLD}%")
else:
    print(f"\nFAIL  neural win rate {neural_pct:.1f}% < {ACCEPTANCE_THRESHOLD}% threshold")
    sys.exit(1)
