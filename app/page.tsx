import { getStats } from "@/lib/db";

export const revalidate = 60;

export default async function Home() {
  let completedGames = 0;
  try {
    const stats = await getStats();
    completedGames = stats.completedGames;
  } catch {
    // DB not available yet (e.g. no DATABASE_URL in dev) — show 0
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Filler AI</h1>
      <p className="text-lg text-gray-600 mb-2">
        A color-flooding game with an AI opponent that learns from your games.
      </p>
      <p className="text-sm text-gray-400 mb-8">
        AI has learned from{" "}
        <span className="font-semibold text-gray-600">{completedGames}</span>{" "}
        {completedGames === 1 ? "game" : "games"}
      </p>
      <a
        href="/play"
        className="rounded-lg bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
      >
        Play
      </a>
    </main>
  );
}
