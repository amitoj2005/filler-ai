"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

// ── Constants ─────────────────────────────────────────────────────────────────

const ROWS = 8;
const COLS = 7;

const COLOR_BG: Record<Color, string> = {
  0: "bg-red-500",
  1: "bg-blue-500",
  2: "bg-green-500",
  3: "bg-yellow-400",
  4: "bg-purple-500",
  5: "bg-orange-500",
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

function Cell({
  color,
  ownership,
}: {
  color: Color;
  ownership: "p1" | "p2" | "none";
}) {
  return (
    <div
      className={[
        "aspect-square rounded-sm transition-colors duration-200",
        COLOR_BG[color],
        ownership === "p1"
          ? "brightness-110 ring-2 ring-white ring-inset"
          : ownership === "p2"
            ? "brightness-75 ring-2 ring-gray-900 ring-inset"
            : "opacity-75",
      ].join(" ")}
    />
  );
}

// ── Color button ───────────────────────────────────────────────────────────────

function ColorButton({
  color,
  disabled,
  isMyColor,
  onClick,
}: {
  color: Color;
  disabled: boolean;
  isMyColor: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={COLOR_NAMES[color]}
      className={[
        "h-10 w-10 rounded-full transition-all",
        COLOR_BG[color],
        disabled
          ? "cursor-not-allowed opacity-30"
          : "cursor-pointer shadow-md hover:scale-110 active:scale-95",
        isMyColor
          ? `ring-4 ring-offset-2 ring-white`
          : "",
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
  const startingRef = useRef(false);

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

  useEffect(() => {
    startGame();
  }, [startGame]);

  const pickColor = useCallback(
    async (color: Color) => {
      if (!gameId || phase !== "playing") return;
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
        setPhase(data.state.status === "active" ? "playing" : "over");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Move failed");
        setPhase("playing");
      }
    },
    [gameId, phase],
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4">
      {/* Nav */}
      <a href="/" className="self-start text-xs text-gray-400 hover:text-gray-600">
        ← Home
      </a>

      {/* Score bar */}
      <div className="flex w-full max-w-xs items-center justify-between rounded-xl bg-gray-100 px-4 py-2">
        <div className="text-center">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">You</p>
          <p className="text-2xl font-bold text-blue-600">{p1Score}</p>
        </div>
        <div className="text-center text-xs text-gray-400">
          <p>{total - p1Score - p2Score} left</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI</p>
          <p className="text-2xl font-bold text-red-500">{p2Score}</p>
        </div>
      </div>

      {/* Territory progress bar */}
      <div className="w-full max-w-xs h-1.5 rounded-full bg-gray-200 overflow-hidden flex">
        <div
          className="bg-blue-500 h-full transition-all duration-300"
          style={{ width: `${(p1Score / total) * 100}%` }}
        />
        <div
          className="bg-red-500 h-full transition-all duration-300"
          style={{ width: `${(p2Score / total) * 100}%` }}
        />
      </div>

      {/* Board */}
      <div
        className="grid gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          width: "min(calc(100vw - 2rem), 340px)",
        }}
      >
        {apiState.board.flatMap((row, r) =>
          row.map((colorVal, c) => {
            const idx = r * COLS + c;
            const ownership = p1Set.has(idx) ? "p1" : p2Set.has(idx) ? "p2" : "none";
            return <Cell key={idx} color={colorVal} ownership={ownership} />;
          }),
        )}
      </div>

      {/* Status / AI thinking */}
      <div className="h-5 flex items-center">
        {phase === "thinking" ? (
          <span className="flex items-center gap-1.5 text-sm text-gray-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            AI thinking…
          </span>
        ) : error ? (
          <span className="text-xs text-red-500">{error}</span>
        ) : null}
      </div>

      {/* Color picker */}
      <div className="flex gap-3">
        {COLORS.map((c) => {
          const isMyColor = c === apiState.p1Color;
          const isAiColor = c === apiState.p2Color;
          return (
            <ColorButton
              key={c}
              color={c}
              disabled={phase !== "playing" || isMyColor || isAiColor}
              isMyColor={isMyColor}
              onClick={() => pickColor(c)}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-white ring-inset bg-gray-400" />
          Your territory
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-gray-900 ring-inset bg-gray-600 brightness-75" />
          AI territory
        </span>
      </div>

      {/* Game-over overlay */}
      {phase === "over" && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-8 text-center shadow-2xl mx-4">
            <p className="text-3xl font-bold mb-1">
              {apiState.status === "p1_wins"
                ? "You win! 🎉"
                : apiState.status === "p2_wins"
                  ? "AI wins!"
                  : "Draw!"}
            </p>
            <p className="text-lg text-gray-500 mb-6">
              {p1Score} – {p2Score}
            </p>
            <button
              onClick={startGame}
              className="rounded-lg bg-blue-600 px-8 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
            >
              Play again
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
