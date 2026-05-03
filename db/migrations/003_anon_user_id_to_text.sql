-- Widen anonymous_user_id from UUID to TEXT so non-UUID identifiers like
-- 'selfplay' can be stored for synthetic self-play games.
ALTER TABLE games
  ALTER COLUMN anonymous_user_id TYPE TEXT USING anonymous_user_id::TEXT;
