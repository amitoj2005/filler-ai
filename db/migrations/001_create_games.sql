CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS games (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  winner             TEXT        CHECK (winner IN ('p1', 'p2', 'draw')),
  initial_board      JSONB       NOT NULL,
  current_state      JSONB       NOT NULL,
  move_history       JSONB       NOT NULL    DEFAULT '[]',
  model_version      TEXT        NOT NULL    DEFAULT 'heuristic-v0',
  final_score_human  INTEGER,
  final_score_ai     INTEGER,
  anonymous_user_id  UUID        NOT NULL
);

CREATE INDEX IF NOT EXISTS games_anonymous_user_id_idx ON games (anonymous_user_id);
CREATE INDEX IF NOT EXISTS games_completed_at_idx      ON games (completed_at) WHERE completed_at IS NOT NULL;
