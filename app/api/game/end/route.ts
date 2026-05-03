import { NextResponse } from "next/server";

// TODO: mark game as complete, record outcome and move history to DB
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
