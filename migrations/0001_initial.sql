-- Pickleball Bot Initial Schema

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  telegram_chat_title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(group_id, member_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  title TEXT NOT NULL,
  scheduled_at TEXT,
  location TEXT,
  estimated_cost REAL,
  actual_cost REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'finalized', 'closed')),
  created_by_member_id INTEGER NOT NULL REFERENCES members(id),
  telegram_message_id TEXT,
  finalized_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  rsvp_status TEXT NOT NULL CHECK(rsvp_status IN ('join', 'maybe', 'skip')),
  source TEXT NOT NULL DEFAULT 'button' CHECK(source IN ('button', 'reaction', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, member_id)
);

CREATE TABLE IF NOT EXISTS session_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, member_id)
);

CREATE TABLE IF NOT EXISTS session_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  amount_due REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid')),
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, member_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_group_id ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_rsvps_session_id ON session_rsvps(session_id);
CREATE INDEX IF NOT EXISTS idx_session_players_session_id ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_session_splits_session_id ON session_splits(session_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);

CREATE TABLE IF NOT EXISTS ephemeral_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ephemeral_messages_chat_type ON ephemeral_messages(chat_id, type);
