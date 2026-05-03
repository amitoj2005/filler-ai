import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE_NAME = "filler_anon_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

// Returns the existing anonymous user ID from the cookie, or creates a new one.
export async function getOrCreateAnonId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}
