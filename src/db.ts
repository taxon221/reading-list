import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";

export const dataDir = Bun.env.DATA_DIR || "./data";
if (!existsSync(dataDir)) {
	mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(`${dataDir}/reading-list.db`);

type TableColumn = {
	name: string;
};

function tableExists(name: string): boolean {
	return !!db
		.query(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
		)
		.get(name);
}

function getTableColumns(table: string): string[] {
	if (!tableExists(table)) return [];
	return (db.query(`PRAGMA table_info(${table})`).all() as TableColumn[]).map(
		(column) => column.name,
	);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
	if (getTableColumns(table).includes(column)) return;
	db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function getTableSql(table: string): string {
	const row = db
		.query(
			"SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
		)
		.get(table) as { sql: string } | undefined;
	return row?.sql || "";
}

function normalizeEmail(value: string | undefined | null): string {
	return (value || "").trim().toLowerCase();
}

function defaultDisplayName(email: string): string {
	const localPart = email.split("@")[0]?.trim();
	return localPart || email;
}

function getBootstrapAdminEmail(): string {
	const email = normalizeEmail(Bun.env.BOOTSTRAP_ADMIN_EMAIL);
	if (!email) {
		throw new Error("BOOTSTRAP_ADMIN_EMAIL is required.");
	}
	return email;
}

function ensureBootstrapAdmin(email: string): number {
	db.query(
		`
      INSERT INTO users (email, display_name, is_admin)
      VALUES (?, ?, 1)
      ON CONFLICT(email) DO UPDATE SET is_admin = 1
    `,
	).run(email, defaultDisplayName(email));

	const user = db.query("SELECT id FROM users WHERE email = ?").get(email) as
		| { id: number }
		| undefined;

	if (!user) {
		throw new Error(`Failed to create bootstrap admin user for ${email}.`);
	}

	return user.id;
}

function createUsersTable() {
	db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function createUserPreferencesTable() {
	db.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      saved_views TEXT NOT NULL DEFAULT '[]',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

function createItemsTable() {
	db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'article',
      preview_image TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0,
      reading_time_minutes INTEGER DEFAULT NULL,
      reading_progress TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

function createTagsTable() {
	db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      UNIQUE (user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

function createItemTagsTable() {
	db.run(`
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (item_id, tag_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);
}

function createHighlightsTable() {
	db.run(`
    CREATE TABLE IF NOT EXISTS highlights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      selected_text TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);
}

function migrateTagsTable(bootstrapAdminId: number) {
	const columns = getTableColumns("tags");
	const sql = getTableSql("tags");
	const hasScopedUnique = /UNIQUE\s*\(\s*user_id\s*,\s*name\s*\)/i.test(sql);
	const needsRebuild = !columns.includes("user_id") || !hasScopedUnique;

	if (!needsRebuild) return;

	db.run("ALTER TABLE tags RENAME TO tags_legacy");
	createTagsTable();

	const legacyColumns = getTableColumns("tags_legacy");
	const legacyTags = legacyColumns.includes("user_id")
		? (db
				.query(
					"SELECT id, name, COALESCE(user_id, ?) AS user_id FROM tags_legacy",
				)
				.all(bootstrapAdminId) as Array<{
				id: number;
				name: string;
				user_id: number;
			}>)
		: (db
				.query("SELECT id, name, ? AS user_id FROM tags_legacy")
				.all(bootstrapAdminId) as Array<{
				id: number;
				name: string;
				user_id: number;
			}>);

	const insertTag = db.query(
		"INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)",
	);

	for (const tag of legacyTags) {
		insertTag.run(tag.id, tag.user_id || bootstrapAdminId, tag.name);
	}

	db.run("DROP TABLE tags_legacy");
}

function createIndexes() {
	db.run(
		"CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id)",
	);
	db.run("CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id)");
	db.run("CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id)");
	db.run(
		"CREATE INDEX IF NOT EXISTS idx_highlights_user_id ON highlights(user_id)",
	);
}

function syncItemsSchema(bootstrapAdminId: number) {
	createItemsTable();
	addColumnIfMissing("items", "notes", "notes TEXT NOT NULL DEFAULT ''");
	addColumnIfMissing("items", "author", "author TEXT NOT NULL DEFAULT ''");
	addColumnIfMissing(
		"items",
		"preview_image",
		"preview_image TEXT NOT NULL DEFAULT ''",
	);
	addColumnIfMissing(
		"items",
		"reading_time_minutes",
		"reading_time_minutes INTEGER DEFAULT NULL",
	);
	addColumnIfMissing(
		"items",
		"reading_progress",
		"reading_progress TEXT NOT NULL DEFAULT ''",
	);
	addColumnIfMissing(
		"items",
		"user_id",
		"user_id INTEGER REFERENCES users(id)",
	);
	db.query("UPDATE items SET user_id = ? WHERE user_id IS NULL").run(
		bootstrapAdminId,
	);
}

function syncTagsSchema(bootstrapAdminId: number) {
	if (tableExists("tags")) {
		migrateTagsTable(bootstrapAdminId);
		return;
	}

	createTagsTable();
}

function syncHighlightsSchema(bootstrapAdminId: number) {
	createHighlightsTable();
	addColumnIfMissing(
		"highlights",
		"user_id",
		"user_id INTEGER REFERENCES users(id)",
	);
	db.query(
		`
        UPDATE highlights
        SET user_id = COALESCE(
          user_id,
          (SELECT items.user_id FROM items WHERE items.id = highlights.item_id),
          ?
        )
        WHERE user_id IS NULL
      `,
	).run(bootstrapAdminId);
}

export function initDb() {
	const bootstrapAdminEmail = getBootstrapAdminEmail();

	db.exec("PRAGMA foreign_keys = OFF");

	try {
		db.transaction(() => {
			createUsersTable();
			createUserPreferencesTable();
			const bootstrapAdminId = ensureBootstrapAdmin(bootstrapAdminEmail);

			syncItemsSchema(bootstrapAdminId);
			syncTagsSchema(bootstrapAdminId);
			createItemTagsTable();
			syncHighlightsSchema(bootstrapAdminId);
			createIndexes();
		})();
	} finally {
		db.exec("PRAGMA foreign_keys = ON");
	}
}
