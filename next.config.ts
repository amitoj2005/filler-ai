import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-web uses WASM which webpack can't bundle — load from node_modules at runtime.
  serverExternalPackages: ["onnxruntime-web"],
  // model.onnx is loaded via path.join(process.cwd(), ...) so the tracer can't detect it.
  outputFileTracingIncludes: {
    "/api/game/move": ["./lib/ai/model.onnx"],
  },
};

export default nextConfig;
