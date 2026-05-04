"""
Train FillerNet on self-play game data and export to ONNX.

Usage (from repo root):
    training/.venv/Scripts/python.exe training/train.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

sys.path.insert(0, str(Path(__file__).parent))

from data import build_training_set, connect_db, fetch_games
from model import FillerNet

# ── Hyper-parameters ──────────────────────────────────────────────────────────

SEED             = 42
MODEL_VERSION    = "heuristic-selfplay-v0"
BATCH_SIZE       = 128
LR               = 1e-3
EPOCHS           = 20
VAL_SPLIT        = 0.1
ONNX_VERSION_TAG = "v1-heuristic-trained"

CHECKPOINT_DIR = Path(__file__).parent / "checkpoints"
ONNX_PATH      = Path(__file__).parent.parent / "lib" / "ai" / "model.onnx"

torch.manual_seed(SEED)
np.random.seed(SEED)

# ── Load data ─────────────────────────────────────────────────────────────────

print("Loading games from DB…")
games = fetch_games(MODEL_VERSION)
print(f"  {len(games)} games loaded")

n_examples = sum(len(g["move_history"]) for g in games) * 2  # ×2 for mirror
print(f"Building {n_examples:,} training examples…")

# Pre-allocate arrays then fill from the generator (avoids list overhead)
inputs_arr  = np.empty((n_examples, 10, 8, 7), dtype=np.float32)
policy_arr  = np.empty(n_examples,              dtype=np.int64)
value_arr   = np.empty(n_examples,              dtype=np.float32)
ptm_arr     = np.empty(n_examples,              dtype=np.float32)  # 1=p1, 0=p2

for i, ex in enumerate(build_training_set(games)):
    inputs_arr[i]  = ex["input_tensor"]
    policy_arr[i]  = ex["policy_target"]
    value_arr[i]   = ex["value_target"]
    ptm_arr[i]     = 1.0 if ex["player_to_move"] == "p1" else 0.0

inputs  = torch.from_numpy(inputs_arr)
policy  = torch.from_numpy(policy_arr)
value   = torch.from_numpy(value_arr)
ptm     = torch.from_numpy(ptm_arr)

# ── Shuffle and split ─────────────────────────────────────────────────────────

N    = len(inputs)
perm = torch.randperm(N, generator=torch.Generator().manual_seed(SEED))
inputs = inputs[perm];  policy = policy[perm]
value  = value[perm];   ptm    = ptm[perm]

val_size   = int(N * VAL_SPLIT)
train_size = N - val_size

train_ds = TensorDataset(inputs[:train_size], policy[:train_size],
                         value[:train_size],  ptm[:train_size])
val_ds   = TensorDataset(inputs[train_size:], policy[train_size:],
                         value[train_size:],  ptm[train_size:])

train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False)

print(f"  train={train_size:,}  val={val_size:,}")

# ── Model + optimiser ─────────────────────────────────────────────────────────

model     = FillerNet()
optimiser = torch.optim.Adam(model.parameters(), lr=LR)
CHECKPOINT_DIR.mkdir(exist_ok=True)

best_val_loss   = float("inf")
best_epoch      = 0
t0              = time.time()

# ── Training loop ─────────────────────────────────────────────────────────────

for epoch in range(1, EPOCHS + 1):
    # ── Train ──
    model.train()
    tr_pol = tr_val = 0.0
    for X, pol, val_t, _ in train_loader:
        optimiser.zero_grad()
        pred_pol, pred_val = model(X)
        loss_pol = F.cross_entropy(pred_pol, pol)
        loss_val = F.mse_loss(pred_val.squeeze(-1), val_t)
        (loss_pol + loss_val).backward()
        optimiser.step()
        bs = len(X)
        tr_pol += loss_pol.item() * bs
        tr_val += loss_val.item() * bs
    tr_pol /= train_size
    tr_val /= train_size

    # ── Validate ──
    model.eval()
    va_pol = va_val = 0.0
    n_correct = 0
    p1_preds: list[float] = []
    p2_preds: list[float] = []

    with torch.no_grad():
        for X, pol, val_t, ptm_b in val_loader:
            pred_pol, pred_val = model(X)
            bs = len(X)
            va_pol    += F.cross_entropy(pred_pol, pol).item() * bs
            va_val    += F.mse_loss(pred_val.squeeze(-1), val_t).item() * bs
            n_correct += (pred_pol.argmax(dim=-1) == pol).sum().item()
            sq = pred_val.squeeze(-1)
            p1_preds.extend(sq[ptm_b == 1.0].tolist())
            p2_preds.extend(sq[ptm_b == 0.0].tolist())

    va_pol   /= val_size
    va_val   /= val_size
    pol_acc   = 100.0 * n_correct / val_size
    mean_p1   = float(np.mean(p1_preds)) if p1_preds else float("nan")
    mean_p2   = float(np.mean(p2_preds)) if p2_preds else float("nan")
    total_val = va_pol + va_val

    print(
        f"epoch {epoch:2d}: "
        f"train_pol={tr_pol:.4f} train_val={tr_val:.4f} | "
        f"val_pol={va_pol:.4f} val_val={va_val:.4f} | "
        f"val_pol_acc={pol_acc:.1f}% | "
        f"mean_value p1_to_move={mean_p1:.3f} p2_to_move={mean_p2:.3f}"
    )

    if total_val < best_val_loss:
        best_val_loss = total_val
        best_epoch    = epoch
        torch.save(model.state_dict(), CHECKPOINT_DIR / "best.pt")
        print(f"          >> checkpoint saved (val_loss={best_val_loss:.4f})")

elapsed = time.time() - t0
print(f"\nTraining done in {elapsed:.1f}s  (best epoch {best_epoch}, val_loss={best_val_loss:.4f})")

# ── Export ONNX ───────────────────────────────────────────────────────────────

print("\nExporting to ONNX…")
model.load_state_dict(
    torch.load(CHECKPOINT_DIR / "best.pt", map_location="cpu", weights_only=True)
)
model.eval()

ONNX_PATH.parent.mkdir(parents=True, exist_ok=True)
dummy = torch.randn(1, 10, 8, 7)

torch.onnx.export(
    model,
    dummy,
    str(ONNX_PATH),
    input_names=["board"],
    output_names=["policy", "value"],
    opset_version=17,
    dynamic_axes={
        "board":  {0: "batch"},
        "policy": {0: "batch"},
        "value":  {0: "batch"},
    },
    export_params=True,
    dynamo=False,  # use legacy TorchScript exporter — faster onnxruntime inference
)
print(f"  saved → {ONNX_PATH}")

# ── Verify ONNX matches PyTorch ───────────────────────────────────────────────

print("Verifying ONNX…")
import onnxruntime as ort  # noqa: E402 (import after heavy torch work)

session  = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
dummy_np = dummy.numpy()
ort_pol, ort_val = session.run(None, {"board": dummy_np})

with torch.no_grad():
    pt_pol, pt_val = model(dummy)

max_pol_diff = float(np.abs(ort_pol - pt_pol.numpy()).max())
max_val_diff = float(np.abs(ort_val - pt_val.numpy()).max())

assert max_pol_diff < 1e-5, f"Policy mismatch: {max_pol_diff:.2e}"
assert max_val_diff < 1e-5, f"Value  mismatch: {max_val_diff:.2e}"
print(f"  ok  max_policy_diff={max_pol_diff:.2e}  max_value_diff={max_val_diff:.2e}")

# ── Insert model_versions row ─────────────────────────────────────────────────

print("\nUpdating model_versions table…")
conn = connect_db()
try:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO model_versions (version, game_count, onnx_path, notes)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (version) DO UPDATE SET
                trained_at = NOW(),
                game_count = EXCLUDED.game_count,
                onnx_path  = EXCLUDED.onnx_path,
                notes      = EXCLUDED.notes
            """,
            (
                ONNX_VERSION_TAG,
                len(games),
                "lib/ai/model.onnx",
                "First neural model, 3-block CNN, trained on 2000 heuristic self-play games",
            ),
        )
    conn.commit()
finally:
    conn.close()
print(f"  inserted version='{ONNX_VERSION_TAG}'")
print("\nAll done.")
