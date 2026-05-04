"""
Verification script for training/data.py.

Checks:
  1. Replay correctness for 5 random games:
       - final p1/p2 territory sizes match stored DB scores
       - total cells in final position = 56
  2. Value targets are consistent for a p1-win game.
  3. Value targets are all 0.0 for a drawn game.
  4. Mirror augmentation doubles the example count.
  5. Every input_tensor has shape (10, 8, 7) and dtype float32.

Prints a summary at the end.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import numpy as np
import psycopg2.extras

# Make sure the training/ directory is importable from any working directory.
sys.path.insert(0, str(Path(__file__).parent))

from data import (
    COLS,
    ROWS,
    TOTAL_CELLS,
    _apply_move,
    _cell_index,
    connect_db,
    build_training_set,
    encode_position,
    fetch_games,
    replay_game,
    GameRecord,
)

SELFPLAY_MODEL = "heuristic-selfplay-v0"

# ── Helpers ───────────────────────────────────────────────────────────────────

def fail(msg: str) -> None:
    print(f"  FAIL  {msg}", file=sys.stderr)
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"  ok    {msg}")


# ── 1. Replay correctness ─────────────────────────────────────────────────────

def verify_replay(games: list[GameRecord]) -> int:
    """
    For each game, fully replay the move history and compare the final
    territory sizes against the stored DB scores.
    Returns the number of games verified.
    """
    print("\n=== 1. Replay correctness ===")
    conn = connect_db()
    verified = 0

    sample = random.sample(games, min(5, len(games)))
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        for game in sample:
            # Replay the game fully in Python
            board = game["initial_board"]
            p1_t: set[int] = {_cell_index(ROWS - 1, 0)}
            p2_t: set[int] = {_cell_index(0, COLS - 1)}
            for move in game["move_history"]:
                p1_t, p2_t = _apply_move(board, p1_t, p2_t, move["player"], move["color"])

            final_p1 = len(p1_t)
            final_p2 = len(p2_t)
            total    = final_p1 + final_p2

            # Fetch stored scores
            cur.execute(
                "SELECT final_score_human, final_score_ai, winner FROM games WHERE id = %s",
                (game["id"],),
            )
            row = cur.fetchone()
            stored_p1 = row["final_score_human"]
            stored_p2 = row["final_score_ai"]

            if total != TOTAL_CELLS:
                fail(
                    f"game {game['id'][:8]}: total cells = {total}, expected {TOTAL_CELLS}"
                )
            if final_p1 != stored_p1:
                fail(
                    f"game {game['id'][:8]}: replayed p1={final_p1} but DB p1={stored_p1}"
                )
            if final_p2 != stored_p2:
                fail(
                    f"game {game['id'][:8]}: replayed p2={final_p2} but DB p2={stored_p2}"
                )

            ok(
                f"game {game['id'][:8]}  p1={final_p1} p2={final_p2}"
                f"  winner={game['winner']}  moves={len(game['move_history'])}"
            )
            verified += 1

    conn.close()
    return verified


# ── 2. Value targets for a p1-win game ───────────────────────────────────────

def verify_value_targets_p1_win(games: list[GameRecord]) -> None:
    print("\n=== 2. Value targets — p1-win game ===")
    p1_wins = [g for g in games if g["winner"] == "p1"]
    if not p1_wins:
        print("  skip  no p1-win games found")
        return
    game = random.choice(p1_wins)
    examples = list(build_training_set([game]))
    # examples are interleaved: original, mirror, original, mirror, ...
    # stride=2 gives original; all have same value so check all
    for i, ex in enumerate(examples):
        player = game["move_history"][i // 2]["player"]
        expected = 1.0 if player == "p1" else -1.0
        if ex["value_target"] != expected:
            fail(
                f"example {i}: player={player} expected value={expected}"
                f" got {ex['value_target']}"
            )
    ok(
        f"game {game['id'][:8]}  {len(examples)} examples"
        f"  all value_targets correct for p1-win"
    )


# ── 3. Value targets for a draw game ─────────────────────────────────────────

def verify_value_targets_draw(games: list[GameRecord]) -> None:
    print("\n=== 3. Value targets — draw game ===")
    draws = [g for g in games if g["winner"] == "draw"]
    if not draws:
        print("  skip  no drawn games found")
        return
    game = random.choice(draws)
    examples = list(build_training_set([game]))
    bad = [ex for ex in examples if ex["value_target"] != 0.0]
    if bad:
        fail(f"draw game: {len(bad)} examples with value_target != 0.0")
    ok(f"game {game['id'][:8]}  {len(examples)} examples  all value_targets = 0.0")


# ── 4. Mirror augmentation doubles count ─────────────────────────────────────

def verify_mirror_doubles(games: list[GameRecord]) -> None:
    print("\n=== 4. Mirror augmentation ===")
    game = random.choice(games)
    n_moves = len(game["move_history"])
    examples = list(build_training_set([game]))
    expected = n_moves * 2
    if len(examples) != expected:
        fail(
            f"game has {n_moves} moves → expected {expected} examples"
            f" but got {len(examples)}"
        )
    ok(f"{n_moves} moves × 2 = {len(examples)} examples")

    # Also verify mirror and original differ (left-right flip should change tensor)
    orig   = examples[0]["input_tensor"]   # channel layout same
    mirror = examples[1]["input_tensor"]
    if np.array_equal(orig, mirror):
        # They COULD be equal if the board is horizontally symmetric, but that's
        # astronomically unlikely.  Just warn rather than fail.
        print("  warn  original and mirror tensors are identical (symmetric board?)")
    else:
        ok("original and mirror tensors differ as expected")


# ── 5. Tensor shape and dtype ─────────────────────────────────────────────────

def verify_tensor_shapes(games: list[GameRecord]) -> int:
    print("\n=== 5. Tensor shapes and dtypes ===")
    total_positions = 0
    total_examples  = 0
    sample = random.sample(games, min(5, len(games)))
    for game in sample:
        examples = list(build_training_set([game]))
        for ex in examples:
            t = ex["input_tensor"]
            if t.shape != (10, ROWS, COLS):
                fail(f"input_tensor shape {t.shape}, expected (10, {ROWS}, {COLS})")
            if t.dtype != np.float32:
                fail(f"input_tensor dtype {t.dtype}, expected float32")
            # One-hot channels should each sum to TOTAL_CELLS
            color_sum = t[:6].sum()
            if not np.isclose(color_sum, TOTAL_CELLS):
                fail(f"one-hot channels sum = {color_sum}, expected {TOTAL_CELLS}")
            # Territory channels should be binary
            for ch in (6, 7, 8, 9):
                unique = set(t[ch].flatten().tolist())
                if not unique.issubset({0.0, 1.0}):
                    fail(f"channel {ch} contains non-binary values: {unique - {0.0, 1.0}}")
        total_positions += len(game["move_history"])
        total_examples  += len(examples)

    ok(f"all tensors (10, {ROWS}, {COLS}) float32, one-hot correct, masks binary")
    return total_positions, total_examples


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Fetching games with model_version = '{SELFPLAY_MODEL}'…")
    games = fetch_games(SELFPLAY_MODEL)
    print(f"  {len(games)} games loaded")
    if not games:
        fail("no games found – run npm run selfplay first")

    verified_games       = verify_replay(games)
    verify_value_targets_p1_win(games)
    verify_value_targets_draw(games)
    verify_mirror_doubles(games)
    total_pos, total_ex = verify_tensor_shapes(games)

    # ── Summary ───────────────────────────────────────────────────────────────
    all_examples = list(build_training_set(random.sample(games, min(50, len(games)))))
    sampled_games   = min(50, len(games))
    sampled_ex      = len(all_examples)
    sampled_pos     = sampled_ex // 2  # mirror doubles count

    print("\n=== Summary ===")
    print(f"  Games in DB  : {len(games)}")
    print(f"  Verified     : {verified_games} replay checks passed")
    print(f"  Positions    : {total_pos} (from {len(random.sample(games, min(5, len(games))))} sampled games)")
    print(f"  Examples     : {total_ex} (with augmentation, same sample)")
    avg_moves = sum(len(g["move_history"]) for g in games) / len(games)
    total_examples_full = int(avg_moves * len(games) * 2)
    print(f"  Est. full dataset size: ~{total_examples_full:,} examples")
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
