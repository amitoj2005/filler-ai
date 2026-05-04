import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's file tracer can't detect runtime path.join() loads, so we tell it
  // explicitly to bundle the ONNX model and the onnxruntime native binaries.
  outputFileTracingIncludes: {
    "/api/game/move": [
      "./lib/ai/model.onnx",
      "./node_modules/onnxruntime-node/**/*.node",
    ],
  },
};

export default nextConfig;
