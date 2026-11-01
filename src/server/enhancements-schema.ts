import type { Database } from "bun:sqlite";

export function createEnhancementsSchema(db: Database) {
	db.exec(`
 CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS auth_passkeys (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL, created_at INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS auth_invites (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS auth_recovery_codes (
  code_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
 );
 CREATE TABLE IF NOT EXISTS article_snapshots (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  url TEXT NOT NULL, title TEXT NOT NULL, byline TEXT NOT NULL, excerpt TEXT NOT NULL,
  content TEXT NOT NULL, saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS media_cache (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, url TEXT NOT NULL,
  content_type TEXT NOT NULL, body BLOB NOT NULL, saved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, url)
 );
 CREATE TABLE IF NOT EXISTS pending_shares (
  token_hash TEXT PRIMARY KEY, payload BLOB NOT NULL, expires_at INTEGER NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
 CREATE INDEX IF NOT EXISTS idx_items_user_url ON items(user_id, url);
 `);
	const inviteColumns = new Set(
		(
			db.query("PRAGMA table_info(auth_invites)").all() as { name: string }[]
		).map((column) => column.name),
	);
	for (const [name, definition] of [
		["created_at", "INTEGER NOT NULL DEFAULT 0"],
		["created_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
		["accepted_at", "INTEGER"],
		["revoked_at", "INTEGER"],
	]) {
		if (!inviteColumns.has(name))
			db.exec(`ALTER TABLE auth_invites ADD COLUMN ${name} ${definition}`);
	}
	db.query(
		"UPDATE auth_invites SET created_at=expires_at-86400000 WHERE created_at=0",
	).run();
}
