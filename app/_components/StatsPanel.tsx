"use client";

import { useEffect, useState } from "react";
import type { ModelVersionRecord } from "@/lib/db";

export interface StatsData {
  humanGamesCompleted: number;
  currentModel: string;
  gamesTrainedOn: number;
  milestones: number[];
  nextMilestone: number;
  modelHistory: ModelVersionRecord[];
}

function versionLabel(version: string): string {
  const m = version.match(/^(v\d+)/);
  return m ? m[1] : version.startsWith("neural-") ? "neural" : version.split("-")[0];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
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

  const { humanGamesCompleted, currentModel, gamesTrainedOn, milestones, nextMilestone, modelHistory } = stats;

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

      {/* Model history */}
      {modelHistory.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Model history
          </p>
          <ul className="space-y-2">
            {[...modelHistory].reverse().map((mv) => {
              const isCurrent = mv.version === currentModel;
              return (
                <li key={mv.version} className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs font-medium ${isCurrent ? "text-blue-600" : "text-gray-500"}`}>
                    {versionLabel(mv.version)}
                    {isCurrent && <span className="ml-1 text-gray-400 font-normal">(current)</span>}
                  </span>
                  <span className="text-xs text-gray-400 text-right shrink-0">
                    {mv.gameCount === 0
                      ? `pure heuristic · ${formatDate(mv.trainedAt)}`
                      : mv.version.includes("heuristic")
                        ? `${fmt(mv.gameCount)} bootstrapped · ${formatDate(mv.trainedAt)}`
                        : `${fmt(mv.gameCount)} human games · ${formatDate(mv.trainedAt)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
