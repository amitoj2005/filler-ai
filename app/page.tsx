import { getEnrichedStats } from "@/lib/db";
import StatsPanel from "./_components/StatsPanel";
import type { StatsData } from "./_components/StatsPanel";

export const revalidate = 60;

const FALLBACK: StatsData = {
  humanGamesCompleted: 0,
  currentModel: "heuristic-v0",
  gamesTrainedOn: 0,
  milestones: [100, 500, 1000, 5000],
  nextMilestone: 100,
  modelHistory: [],
};

export default async function Home() {
  let initial: StatsData = FALLBACK;
  try {
    const s = await getEnrichedStats();
    initial = {
      humanGamesCompleted: s.humanGamesCompleted,
      currentModel: s.currentModel,
      gamesTrainedOn: s.gamesTrainedOn,
      milestones: s.milestones,
      nextMilestone: s.nextMilestone,
      modelHistory: s.modelHistory,
    };
  } catch {
    // DB not available in CI / cold start — show fallback
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Filler AI</h1>
        <p className="text-gray-500">
          A color-flooding game with an AI that learns from your games.
        </p>
      </div>

      <StatsPanel initial={initial} />

      <a
        href="/play"
        className="rounded-lg bg-blue-600 px-8 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
      >
        Play
      </a>
    </main>
  );
}
