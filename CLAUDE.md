# Filler AI

A web-based Filler game (the GamePigeon-style color-flooding game) where players
compete against an AI that learns from accumulated game history. The AI starts as
a simple heuristic and improves over time as more games are played.

## Architecture

- **Frontend + game API**: Next.js (App Router) deployed on Vercel
- **Database**: Postgres (Vercel Postgres or Neon free tier) for game history
- **AI inference**: ONNX model loaded inside Vercel serverless functions
- **AI training**: Python script run separately (locally at first, Modal later),
  pulls completed games from Postgres, trains CNN, exports new ONNX weights,
  commits to repo. Next deploy picks up new model.

## Tech stack

- Next.js 15 with App Router, TypeScript (strict)
- Tailwind CSS for styling
- Postgres via the `postgres` or `@vercel/postgres` client
- onnxruntime-web or onnxruntime-node for inference
- Python + PyTorch for training (in `/training` directory)

## Game: Filler rules

- Board is 7 wide × 8 tall, filled with 6 colors
- Board generation: random colors with constraint that no two adjacent cells
  share a color (constrained random / rejection sampling)
- Player 1 starts in bottom-left, Player 2 in top-right
- On your turn, pick any of the 5 colors that aren't your current color and
  aren't your opponent's current color. Your territory becomes that color, and
  any adjacent cells of that color join your territory (flood fill).
- Game ends when all cells are claimed; whoever has more cells wins.

## Project structure
app/                 # Next.js routes
page.tsx
play/page.tsx
api/
game/new/route.ts
game/move/route.ts
game/end/route.ts
lib/
filler/            # Pure game logic, no I/O
board.ts         # Board generation
rules.ts         # Move validation, flood fill, win check
encode.ts        # Board → tensor for the network
ai/
inference.ts     # ONNX inference
heuristic.ts     # Greedy fallback AI for bootstrap phase
model.onnx       # Current model weights (committed)
db.ts              # Postgres client
training/            # Python, never deployed to Vercel
train.py
requirements.txt

## Build phases

1. **Bootstrap**: Game logic + UI + greedy heuristic AI. No ML yet.
2. **Logging**: Persist every game to Postgres with full move history.
3. **First neural net**: Train CNN on accumulated games, deploy via ONNX.
4. **Self-play**: Augment human games with AI vs AI to accelerate learning.

## Conventions

- TypeScript strict mode, no `any`
- Game logic in `lib/filler/` is pure (no I/O, no DB) and unit-tested
- Use named exports
- Server actions or route handlers for all mutations; never trust client state
- Commit ONNX weights to the repo so deploys are atomic

## Current status

Brand new project. Nothing built yet. Start with phase 1.