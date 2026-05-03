import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";

export const revalidate = 60; // cache for 60 s

export async function GET() {
  const stats = await getStats();
  return NextResponse.json(stats);
}
