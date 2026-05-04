import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include only what Vercel (Linux x64) needs — the model file and Linux binary.
  outputFileTracingIncludes: {
    "/api/game/move": [
      "./lib/ai/model.onnx",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
    ],
  },
  // Strip every other platform's binaries so the function stays under 250 MB.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**",
      "./node_modules/onnxruntime-node/bin/napi-v6/win32/**",
    ],
  },
};

export default nextConfig;
