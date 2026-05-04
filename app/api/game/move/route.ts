import { NextRequest, NextResponse } from "next/server";
import { validateMove, applyMove, serializeState, deserializeState } from "@/lib/filler/rules";
import { appendMove, loadGame, completeGame } from "@/lib/db";
import { getAIMove } from "@/lib/ai/inference";
import type { Color } from "@/lib/filler/board";

interface MoveBody {
  gameId: string;
  color: number;
}

function outcomeWinner(status: string): "p1" | "p2" | "draw" {
  if (status === "p1_wins") return "p1";
  if (status === "p2_wins") return "p2";
  return "draw";
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MoveBody;
  const { gameId, color } = body;

  const row = await loadGame(gameId);
  if (!row) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const state = deserializeState(row.current_state);

  // Expect the human (p1) to be moving
  const err = validateMove(state, "p1", color as Color);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Apply human move
  const afterHuman = applyMove(state, "p1", color as Color);
  await appendMove(gameId, "p1", color, serializeState(afterHuman));

  if (afterHuman.status !== "active") {
    await completeGame(
      gameId,
      outcomeWinner(afterHuman.status),
      serializeState(afterHuman),
      afterHuman.p1Territory.size,
      afterHuman.p2Territory.size,
    );
    return NextResponse.json({ state: serializeState(afterHuman), aiColor: null });
  }

  // AI (p2) responds
  const aiColor = await getAIMove(afterHuman);
  const afterAI = applyMove(afterHuman, "p2", aiColor);
  await appendMove(gameId, "p2", aiColor, serializeState(afterAI));

  if (afterAI.status !== "active") {
    await completeGame(
      gameId,
      outcomeWinner(afterAI.status),
      serializeState(afterAI),
      afterAI.p1Territory.size,
      afterAI.p2Territory.size,
    );
  }

  return NextResponse.json({ state: serializeState(afterAI), aiColor });
}
