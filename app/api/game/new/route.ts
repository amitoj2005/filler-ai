import { NextResponse } from "next/server";
import { generateBoard } from "@/lib/filler/board";
import { initState, serializeState } from "@/lib/filler/rules";
import { createGame } from "@/lib/db";
import { getOrCreateAnonId } from "@/lib/anonUser";

export async function POST() {
  const anonId = await getOrCreateAnonId();
  const board = generateBoard();
  const state = initState(board);
  const serialized = serializeState(state);
  const gameId = await createGame(anonId, serialized);
  return NextResponse.json({ gameId, state: serialized });
}
