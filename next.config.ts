import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ONNX model is loaded at runtime via path.join(process.cwd(), ...) so
  // the file tracer can't detect it automatically — include it explicitly.
  // Non-Linux onnxruntime binaries are removed by the postinstall script before
  // the tracer runs, so only the Linux x64 binary ends up in the bundle.
  outputFileTracingIncludes: {
    "/api/game/move": [
      "./lib/ai/model.onnx",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
    ],
  },
};

export default nextConfig;
