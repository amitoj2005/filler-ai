CREATE TABLE IF NOT EXISTS model_versions (
  version      TEXT        PRIMARY KEY,
  trained_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  game_count   INTEGER     NOT NULL,
  onnx_path    TEXT        NOT NULL,
  notes        TEXT
);

-- Seed the initial heuristic entry so getStats() always has a row.
INSERT INTO model_versions (version, game_count, onnx_path, notes)
VALUES ('heuristic-v0', 0, 'lib/ai/model.onnx', 'Greedy heuristic baseline — no neural net')
ON CONFLICT (version) DO NOTHING;
