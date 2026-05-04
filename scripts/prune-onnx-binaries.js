// Runs via `postinstall` on every `npm install`.
// On Linux (Vercel's build environment) it deletes the platform-specific
// onnxruntime-node binaries that aren't needed, keeping the bundle under 250 MB.
// On Windows / macOS (local dev) it exits immediately so nothing is touched.

const { rm, access } = require("fs/promises");
const path = require("path");

if (process.platform !== "linux") process.exit(0);

const binDir = path.join(
  __dirname,
  "..",
  "node_modules",
  "onnxruntime-node",
  "bin",
  "napi-v6",
);

const toRemove = ["darwin", "win32", path.join("linux", "arm64")];

Promise.all(
  toRemove.map(async (dir) => {
    const fullPath = path.join(binDir, dir);
    try {
      await access(fullPath);
      await rm(fullPath, { recursive: true, force: true });
      console.log(`pruned onnxruntime: ${dir}`);
    } catch {
      // already gone or never existed — fine
    }
  }),
).catch((err) => {
  console.error("prune-onnx-binaries failed:", err);
  process.exit(1);
});
