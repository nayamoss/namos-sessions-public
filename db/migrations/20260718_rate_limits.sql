-- Public Endpoint Rate Limiting (issue #54)
-- Rate limits for anonymous trust-center endpoints

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,      -- `${functionName}:${ipHash}:${windowStart}`
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start INTEGER NOT NULL,    -- unix seconds, floor(now / windowSeconds) * windowSeconds
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
