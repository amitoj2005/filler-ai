import { NextRequest, NextResponse } from "next/server";
import { validateMove, applyMove, serializeState, deserializeState } from "@/lib/filler/rules";
import { appendMove, loadGame, completeGame } from "@/lib/db";
import type { Color } from "@/lib/filler/board";

interface MoveBody {
  gameId: string;
  color: number;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MoveBody;
  const { gameId, color } = body;

  const row = await loadGame(gameId);
  if (!row) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const state = deserializeState(row.current_state);
  const player = state.currentTurn;

  const err = validateMove(state, player, color as Color);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const next = applyMove(state, player, color as Color);
  const serialized = serializeState(next);

  await appendMove(gameId, player, color, serialized);

  if (next.status !== "active") {
    const humanScore = next.p1Territory.size;
    const aiScore = next.p2Territory.size;
    await completeGame(gameId, next.status === "draw" ? "draw" : next.status === "p1_wins" ? "p1" : "p2", serialized, humanScore, aiScore);
  }

  return NextResponse.json({ state: serialized });
}
