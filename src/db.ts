import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";

const dataDir = "./data";
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(`${dataDir}/reading-list.db`);

export function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'article',
      notes TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0
    )
  `);

  // Add notes column if it doesn't exist (for existing databases)
  try {
    db.run(`ALTER TABLE items ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
  } catch (e) {
    // Column already exists, ignore error
  }

  try {
    db.run(`ALTER TABLE items ADD COLUMN author TEXT NOT NULL DEFAULT ''`);
  } catch (e) {
    // Column already exists, ignore error
  }

  try {
    db.run(
      `ALTER TABLE items ADD COLUMN reading_progress TEXT NOT NULL DEFAULT ''`,
    );
  } catch (e) {
    // Column already exists, ignore error
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (item_id, tag_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS highlights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      selected_text TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);
}
