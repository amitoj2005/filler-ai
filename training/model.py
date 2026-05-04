"""
FillerNet — lightweight policy+value network for the Filler board game.

Input:  (batch, 10, 7, 8) float32  — (batch, channels, ROWS, COLS)
Output: (policy_logits (batch,6), value (batch,1))

Architecture:
  Body   3 × [Conv2d → BatchNorm2d → ReLU]  (64 filters, 3×3, padding=1)
  Policy Conv2d(64→2, 1×1) → ReLU → Flatten → Linear(2*7*8=112, 6)
  Value  Conv2d(64→1, 1×1) → ReLU → Flatten → Linear(7*8=56, 32) → ReLU → Linear(32,1) → Tanh
"""

from __future__ import annotations

import torch
import torch.nn as nn


class FillerNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()

        # ── Conv body ────────────────────────────────────────────────────────
        def _block(in_ch: int, out_ch: int = 64) -> nn.Sequential:
            return nn.Sequential(
                nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
                nn.BatchNorm2d(out_ch),
                nn.ReLU(inplace=True),
            )

        self.body = nn.Sequential(
            _block(10, 64),
            _block(64, 64),
            _block(64, 64),
        )

        # ── Policy head ───────────────────────────────────────────────────────
        # 2 × H × W = 2 × 8 × 7 = 112  →  6 logits
        self.policy_head = nn.Sequential(
            nn.Conv2d(64, 2, kernel_size=1),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(2 * 8 * 7, 6),
        )

        # ── Value head ────────────────────────────────────────────────────────
        # 1 × H × W = 1 × 8 × 7 = 56  →  scalar ∈ (−1, +1)
        self.value_head = nn.Sequential(
            nn.Conv2d(64, 1, kernel_size=1),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(8 * 7, 32),
            nn.ReLU(inplace=True),
            nn.Linear(32, 1),
            nn.Tanh(),
        )

        n_params = sum(p.numel() for p in self.parameters())
        print(f"FillerNet  params={n_params:,}")

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        features = self.body(x)
        policy   = self.policy_head(features)   # (batch, 6)
        value    = self.value_head(features)     # (batch, 1)
        return policy, value
