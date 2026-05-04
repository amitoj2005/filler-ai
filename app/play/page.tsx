"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { applyMove } from "@/lib/filler/rules";

// ── Types ─────────────────────────────────────────────────────────────────────

type Color = 0 | 1 | 2 | 3 | 4 | 5;
type Status = "active" | "p1_wins" | "p2_wins" | "draw";

interface ApiState {
  board: Color[][];
  p1Territory: number[];
  p2Territory: number[];
  p1Color: Color;
  p2Color: Color;
  status: Status;
}

interface GameStats {
  humanGamesCompleted: number;
  aiWinRate: number | null;
  currentModel: string;
}

// ── ApiState ↔ GameState helpers ──────────────────────────────────────────────

function toGameState(s: ApiState) {
  return {
    board: s.board,
    p1Territory: new Set(s.p1Territory),
    p2Territory: new Set(s.p2Territory),
    p1Color: s.p1Color,
    p2Color: s.p2Color,
    currentTurn: "p1" as const,
    status: s.status,
  };
}

function fromGameState(g: ReturnType<typeof applyMove>): ApiState {
  return {
    board: g.board as Color[][],
    p1Territory: [...g.p1Territory],
    p2Territory: [...g.p2Territory],
    p1Color: g.p1Color as Color,
    p2Color: g.p2Color as Color,
    status: g.status as Status,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROWS = 7;
const COLS = 8;

const COLOR_BG: Record<Color, string> = {
  0: "bg-red-500",
  1: "bg-blue-500",
  2: "bg-green-500",
  3: "bg-yellow-400",
  4: "bg-purple-500",
  5: "bg-amber-500",  // was orange-500 — amber is visually distinct from red
};

const COLOR_NAMES: Record<Color, string> = {
  0: "Red",
  1: "Blue",
  2: "Green",
  3: "Yellow",
  4: "Purple",
  5: "Orange",
};

const COLORS: Color[] = [0, 1, 2, 3, 4, 5];

// ── Board cell ─────────────────────────────────────────────────────────────────
// Territory cells are flush (no gap) with rounded outer corners only.
// Neutral cells have a small margin so they read as individual squares.

function Cell({
  color,
  ownership,
  cornerClass,
  isPulsing,
}: {
  color: Color;
  ownership: "p1" | "p2" | "none";
  cornerClass: string;
  isPulsing: boolean;
}) {
  const isTerritory = ownership !== "none";
  return (
    <div
      className={[
        "aspect-square transition-colors duration-200",
        COLOR_BG[color],
        isTerritory
          ? `relative ${cornerClass} ${isPulsing ? "z-10 [animation:blobPulse_1.5s_ease-in-out_infinite]" : "z-0"}`
          : "m-[2px] rounded-sm",
      ].join(" ")}
    />
  );
}

// Returns Tailwind corner classes for a territory cell — only outer corners are rounded.
function getCornerClass(idx: number, set: Set<number>): string {
  const r = Math.floor(idx / COLS);
  const c = idx % COLS;
  const has = (dr: number, dc: number): boolean => {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false;
    return set.has(nr * COLS + nc);
  };
  return [
    !has(-1, 0) && !has(0, -1) ? "rounded-tl-lg" : "",
    !has(-1, 0) && !has(0,  1) ? "rounded-tr-lg" : "",
    !has( 1, 0) && !has(0, -1) ? "rounded-bl-lg" : "",
    !has( 1, 0) && !has(0,  1) ? "rounded-br-lg" : "",
  ].filter(Boolean).join(" ");
}

// ── Color button ───────────────────────────────────────────────────────────────

function ColorButton({
  color,
  canPick,
  isTaken,
  onClick,
}: {
  color: Color;
  canPick: boolean;
  isTaken: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!canPick}
      aria-label={COLOR_NAMES[color]}
      className={[
        "rounded-full transition-all duration-200",
        COLOR_BG[color],
        isTaken
          ? "h-8 w-8 opacity-50 cursor-not-allowed"
          : canPick
            ? "h-12 w-12 cursor-pointer shadow-lg hover:scale-110 active:scale-95"
            : "h-12 w-12 opacity-30 cursor-not-allowed",
      ].join(" ")}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlayPage() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [apiState, setApiState] = useState<ApiState | null>(null);
  const [phase, setPhase] = useState<"loading" | "playing" | "thinking" | "over">("loading");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [isDark, setIsDark] = useState(false);
  const startingRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem("dark");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored === "1" || (stored === null && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
    setIsDark(dark);
  }, []);

  const toggleDark = useCallback(() => {
    const nowDark = document.documentElement.classList.toggle("dark");
    setIsDark(nowDark);
    localStorage.setItem("dark", nowDark ? "1" : "0");
  }, []);

  const fetchStats = useCallback(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data: GameStats) => setStats(data))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const startGame = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/game/new", { method: "POST" });
      if (!res.ok) throw new Error("Server error");
      const data = (await res.json()) as { gameId: string; state: ApiState };
      setGameId(data.gameId);
      setApiState(data.state);
      setPhase("playing");
    } catch {
      setError("Could not start game — please retry.");
      setPhase("loading");
    } finally {
      startingRef.current = false;
    }
  }, []);

  useEffect(() => { startGame(); }, [startGame]);

  const pickColor = useCallback(
    async (color: Color) => {
      if (!gameId || phase !== "playing" || !apiState) return;

      const prevState = apiState;
      // Optimistic update — apply p1's move immediately so the board reacts without waiting for the server
      setApiState(fromGameState(applyMove(toGameState(apiState), "p1", color)));
      setPhase("thinking");
      setError(null);

      try {
        const res = await fetch("/api/game/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, color }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Move rejected");
        }
        const data = (await res.json()) as { state: ApiState; aiColor: Color | null };
        setApiState(data.state);
        const newPhase = data.state.status === "active" ? "playing" : "over";
        setPhase(newPhase);
        if (newPhase === "over") fetchStats();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Move failed");
        setApiState(prevState);
        setPhase("playing");
      }
    },
    [gameId, phase, fetchStats, apiState],
  );

  // ── Loading / error ──────────────────────────────────────────────────────────

  if (phase === "loading" || !apiState) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        {error ? (
          <>
            <p className="text-red-500">{error}</p>
            <button
              onClick={startGame}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white font-semibold hover:bg-blue-700"
            >
              Retry
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            Starting game…
          </div>
        )}
      </main>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const p1Set = new Set(apiState.p1Territory);
  const p2Set = new Set(apiState.p2Territory);
  const p1Score = apiState.p1Territory.length;
  const p2Score = apiState.p2Territory.length;
  const total = ROWS * COLS;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex flex-col px-8 py-6 gap-6">

      {/* Top bar: stats (left) + dark toggle (right) */}
      <div className="flex items-start justify-between">
        <div className="space-y-0.5 leading-snug">
          {stats ? (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI has learned from{" "}
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {stats.humanGamesCompleted.toLocaleString()}
                </span>{" "}
                games.
              </p>
              {stats.aiWinRate !== null && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  AI wins{" "}
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {stats.aiWinRate}%
                  </span>{" "}
                  of games.
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-600">{stats.currentModel}</p>
            </>
          ) : (
            <p className="text-sm text-gray-300 dark:text-gray-700">…</p>
          )}
        </div>

        <button
          onClick={toggleDark}
          className="text-xl text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="Toggle dark mode"
        >
          {isDark ? "☀" : "☽"}
        </button>
      </div>

      {/* Game area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">

        {/* Nav */}
        <Link href="/" className="self-start text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          ← Home
        </Link>

        {/* Score bar */}
        <div className="flex w-full max-w-sm items-center justify-between rounded-2xl bg-gray-100 dark:bg-gray-800 px-6 py-3">
          <div className="text-center">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">You</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{p1Score}</p>
            <div className={`mx-auto mt-1 h-2 w-10 rounded-full ${COLOR_BG[apiState.p1Color]}`} />
          </div>
          <div className="text-center text-sm text-gray-400 dark:text-gray-500">
            <p>{total - p1Score - p2Score} left</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">AI</p>
            <p className="text-3xl font-bold text-red-500 dark:text-red-400">{p2Score}</p>
            <div className={`mx-auto mt-1 h-2 w-10 rounded-full ${COLOR_BG[apiState.p2Color]}`} />
          </div>
        </div>

        {/* Territory progress bar — player grows from left, AI from right */}
        <div className="w-full max-w-sm h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden relative">
          <div
            className="absolute left-0 top-0 h-full transition-all duration-300 bg-blue-500"
            style={{ width: `${(p1Score / total) * 100}%` }}
          />
          <div
            className="absolute right-0 top-0 h-full transition-all duration-300 bg-red-500"
            style={{ width: `${(p2Score / total) * 100}%` }}
          />
        </div>

        {/* Board */}
        <div
          className="grid gap-0"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            width: "min(calc(100vw - 4rem), 420px)",
          }}
        >
          {apiState.board.flatMap((row, r) =>
            row.map((boardColor, c) => {
              const idx = r * COLS + c;
              const ownership = p1Set.has(idx) ? "p1" : p2Set.has(idx) ? "p2" : "none";
              const displayColor =
                ownership === "p1" ? apiState.p1Color
                : ownership === "p2" ? apiState.p2Color
                : boardColor;
              const isPulsing = phase === "playing" && ownership === "p1";
              const cornerClass = ownership !== "none" ? getCornerClass(idx, ownership === "p1" ? p1Set : p2Set) : "";
              return <Cell key={idx} color={displayColor} ownership={ownership} cornerClass={cornerClass} isPulsing={isPulsing} />;
            }),
          )}
        </div>

        {/* Status */}
        <div className="h-6 flex items-center">
          {phase === "thinking" ? (
            <span className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300" />
              AI thinking…
            </span>
          ) : error ? (
            <span className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-1 text-sm text-red-600 dark:text-red-400 font-medium">
              {error}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">Pick your next color</span>
          )}
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-4">
          {COLORS.map((c) => {
            const isTaken = c === apiState.p1Color || c === apiState.p2Color;
            const canPick = phase === "playing" && !isTaken;
            return (
              <ColorButton
                key={c}
                color={c}
                canPick={canPick}
                isTaken={isTaken}
                onClick={() => pickColor(c)}
              />
            );
          })}
        </div>

      </div>

      {/* Game-over overlay */}
      {phase === "over" && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl bg-white dark:bg-gray-900 p-10 text-center shadow-2xl mx-6">
            <p className="text-4xl font-bold mb-2 dark:text-white">
              {apiState.status === "p1_wins"
                ? "You win! 🎉"
                : apiState.status === "p2_wins"
                  ? "AI wins!"
                  : "Draw!"}
            </p>
            <p className="text-xl text-gray-500 dark:text-gray-400 mb-8">
              {p1Score} – {p2Score}
            </p>
            <button
              onClick={startGame}
              className="rounded-xl bg-blue-600 px-10 py-4 text-white text-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Play again
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
