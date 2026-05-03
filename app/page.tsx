export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Filler AI</h1>
      <p className="text-lg text-gray-600 mb-8">
        A color-flooding game with an AI opponent that learns from your games.
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
