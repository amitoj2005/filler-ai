"""
Export best.pt checkpoint to ONNX and update model_versions table.
Run after train.py has produced training/checkpoints/best.pt.

Usage (from repo root):
    training/.venv/Scripts/python.exe training/export_onnx.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent))

from data import connect_db
from model import FillerNet

CHECKPOINT_DIR   = Path(__file__).parent / "checkpoints"
ONNX_PATH        = Path(__file__).parent.parent / "lib" / "ai" / "model.onnx"
ONNX_VERSION_TAG = "v1-heuristic-trained"

# ── Load checkpoint ───────────────────────────────────────────────────────────

model = FillerNet()
model.load_state_dict(
    torch.load(CHECKPOINT_DIR / "best.pt", map_location="cpu", weights_only=True)
)
model.eval()
print("Loaded checkpoints/best.pt")

# ── Export ONNX ───────────────────────────────────────────────────────────────

print("Exporting to ONNX...")
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
print(f"  saved -> {ONNX_PATH}")

# ── Verify ONNX matches PyTorch ───────────────────────────────────────────────

print("Verifying ONNX...")
import onnxruntime as ort

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

print("\nUpdating model_versions table...")
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
                2000,
                "lib/ai/model.onnx",
                "First neural model, 3-block CNN, trained on 2000 heuristic self-play games",
            ),
        )
    conn.commit()
finally:
    conn.close()
print(f"  inserted version='{ONNX_VERSION_TAG}'")
print("\nAll done.")
