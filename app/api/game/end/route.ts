import { NextRequest, NextResponse } from "next/server";
import { loadGame, completeGame } from "@/lib/db";
import { deserializeState } from "@/lib/filler/rules";

interface EndBody {
  gameId: string;
}

// Client calls this to explicitly abandon / forfeit a game.
// If the game is already complete this is a no-op.
export async function POST(req: NextRequest) {
  const { gameId } = (await req.json()) as EndBody;

  const row = await loadGame(gameId);
  if (!row) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (row.completed_at) return NextResponse.json({ ok: true });

  const state = deserializeState(row.current_state);
  const humanScore = state.p1Territory.size;
  const aiScore = state.p2Territory.size;
  const winner = humanScore > aiScore ? "p1" : aiScore > humanScore ? "p2" : "draw";

  await completeGame(gameId, winner, row.current_state, humanScore, aiScore);
  return NextResponse.json({ ok: true });
}
