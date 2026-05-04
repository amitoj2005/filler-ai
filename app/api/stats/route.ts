import { NextResponse } from "next/server";
import { getEnrichedStats } from "@/lib/db";

export const revalidate = 60;

export async function GET() {
  const stats = await getEnrichedStats();
  return NextResponse.json(stats);
}
