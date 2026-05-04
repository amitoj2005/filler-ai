"use client";

import { useEffect, useState } from "react";

export interface StatsData {
  humanGamesCompleted: number;
  currentModel: string;
  gamesTrainedOn: number;
  milestones: number[];
  nextMilestone: number;
}

export default function StatsPanel({ initial }: { initial: StatsData }) {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) setStats(await res.json());
      } catch {
        // ignore network errors — keep showing stale data
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const { humanGamesCompleted, currentModel, gamesTrainedOn, milestones, nextMilestone } = stats;

  const milestoneIdx = milestones.indexOf(nextMilestone);
  const fromMilestone = milestoneIdx > 0 ? milestones[milestoneIdx - 1] : 0;
  const pct =
    nextMilestone === fromMilestone
      ? 100
      : Math.min(
          100,
          Math.round(
            ((humanGamesCompleted - fromMilestone) / (nextMilestone - fromMilestone)) * 100,
          ),
        );

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Headline counter */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
        AI trained on
      </p>
      <p className="text-5xl font-bold tabular-nums text-gray-900 mb-1">
        {fmt(humanGamesCompleted)}
      </p>
      <p className="text-sm text-gray-500 mb-5">
        {humanGamesCompleted === 1 ? "human game" : "human games"}
      </p>

      {/* Milestone progress bar */}
      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>{fmt(fromMilestone)}</span>
        <span>next milestone: {fmt(nextMilestone)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-gray-400">
        {fmt(humanGamesCompleted)} / {fmt(nextMilestone)}
      </p>

      {/* Model info */}
      <div className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-500 space-y-0.5">
        <p>
          <span className="font-medium text-gray-700">Current model:</span>{" "}
          {currentModel}
        </p>
        <p>
          <span className="font-medium text-gray-700">Trained on:</span>{" "}
          {fmt(gamesTrainedOn)} games
        </p>
      </div>

      {/* CTA */}
      <p className="mt-4 text-center text-xs text-gray-400">
        Play a game to help it improve
      </p>
    </div>
  );
}
