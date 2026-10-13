-- ==============================================================================
-- TECH BLITZ: The Jane Protocol — Database Schema (PostgreSQL / Supabase)
-- ==============================================================================

-- 1. Global Event Lifecycle & Authoritative Clock
CREATE TABLE IF NOT EXISTS event_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_started BOOLEAN NOT NULL DEFAULT FALSE,
  server_start_time TIMESTAMPTZ NULL,          -- Set authoritatively when Admin starts timer
  total_duration_ms BIGINT NOT NULL DEFAULT 4200000, -- 70 minutes (Reading 5m + Cho 15m + Rigsby 15m + Van Pelt 15m + Lisbon 20m)
  scores_revealed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed single-row event state if not present
INSERT INTO event_state (id, is_started, server_start_time, total_duration_ms, scores_revealed)
VALUES (1, FALSE, NULL, 4200000, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 2. User Roster & Role Store (Admin Whitelist & Participant Roster)
CREATE TABLE IF NOT EXISTS users (
  register_number TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'participant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES users(register_number) ON DELETE SET NULL
);

-- Seed default Administrator Gowtham123
INSERT INTO users (register_number, role)
VALUES ('Gowtham123', 'admin')
ON CONFLICT (register_number) DO UPDATE SET role = 'admin';

-- 3. Participant Live Session & Score Cache
CREATE TABLE IF NOT EXISTS participant_sessions (
  register_number TEXT PRIMARY KEY REFERENCES users(register_number) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  hints_used INT NOT NULL DEFAULT 0,
  penalty_seconds INT NOT NULL DEFAULT 0,
  accusation_suspect TEXT NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participant_score ON participant_sessions(score DESC, penalty_seconds ASC);

-- 4. Puzzle Submissions Log
CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  register_number TEXT NOT NULL REFERENCES users(register_number) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL,                     -- e.g. 'cho-a', 'cho-b', ... 'lisbon-b'
  raw_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_puzzle UNIQUE (register_number, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(register_number);

-- 5. Fullscreen Violation Requests Queue
CREATE TABLE IF NOT EXISTS fullscreen_requests (
  id BIGSERIAL PRIMARY KEY,
  register_number TEXT NOT NULL REFERENCES users(register_number) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  exited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL,
  resolved_by TEXT REFERENCES users(register_number) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fs_requests_pending ON fullscreen_requests(status) WHERE status = 'pending';

-- Enable Realtime Replication for tables that need client sync
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_state;
  EXCEPTION WHEN duplicate_object THEN
    -- Table already in publication
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE fullscreen_requests;
  EXCEPTION WHEN duplicate_object THEN
    -- Table already in publication
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE participant_sessions;
  EXCEPTION WHEN duplicate_object THEN
    -- Table already in publication
  END;
END $$;

-- Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
