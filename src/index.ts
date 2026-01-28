import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { db, initDb } from "./db";

const app = new Hono();

initDb();

app.use("/*", cors());
app.use("/static/*", serveStatic({ root: "./public" }));
app.get(
  "/manifest.webmanifest",
  serveStatic({ path: "./public/manifest.webmanifest" }),
);
app.get("/", serveStatic({ path: "./public/index.html" }));

function detectType(url: string, contentType?: string): string {
  const urlLower = url.toLowerCase();

  if (
    urlLower.includes("youtube.com") ||
    urlLower.includes("youtu.be") ||
    urlLower.includes("vimeo.com") ||
    urlLower.includes("twitch.tv") ||
    urlLower.includes("dailymotion.com")
  ) {
    return "video";
  }

  if (
    urlLower.includes("podcasts.apple.com") ||
    urlLower.includes("open.spotify.com/episode") ||
    urlLower.includes("open.spotify.com/show") ||
    urlLower.includes("overcast.fm") ||
    urlLower.includes("pocketcasts.com") ||
    urlLower.includes("castro.fm") ||
    urlLower.includes("anchor.fm")
  ) {
    return "podcast";
  }

  if (urlLower.endsWith(".pdf")) {
    return "pdf";
  }

  if (contentType) {
    if (contentType.includes("application/pdf")) return "pdf";
    if (contentType.includes("video/")) return "video";
    if (contentType.includes("audio/")) return "podcast";
  }

  return "article";
}

function parseTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return decodeHtmlEntities(titleMatch[1].trim());

  const ogMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogMatch) return decodeHtmlEntities(ogMatch[1].trim());

  const ogMatchAlt = html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
  );
  if (ogMatchAlt) return decodeHtmlEntities(ogMatchAlt[1].trim());

  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (char === "\n") {
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    if (char === "\r") continue;

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function getHeaderIndex(headers: string[], names: string[]): number {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

function parseReadwiseTags(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let tags: string[] = [];

  if (trimmed.startsWith("[")) {
    const matches = trimmed.match(/'([^']+)'/g);
    if (matches && matches.length > 0) {
      tags = matches.map((value) => value.slice(1, -1));
    } else {
      const inner = trimmed.replace(/^\[|\]$/g, "");
      tags = inner.split(",").map((tag) => tag.trim());
    }
  } else {
    tags = trimmed.split(",").map((tag) => tag.trim());
  }

  const cleaned = tags
    .map((tag) =>
      tag
        .replace(/^['"]|['"]$/g, "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  return [...new Set(cleaned)];
}

function normalizeReadwiseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().replace("T", " ").replace("Z", "");
}

function fallbackTitle(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

app.get("/api/fetch-meta", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "URL is required" }, 400);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ReadingListBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    const type = detectType(url, contentType);
    let title = null;

    if (
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml")
    ) {
      const html = await response.text();
      title = parseTitle(html);
    }

    if (!title) {
      try {
        title = new URL(url).hostname.replace("www.", "");
      } catch {
        title = url;
      }
    }

    return c.json({ title, type });
  } catch {
    let fallbackTitle;
    try {
      fallbackTitle = new URL(url).hostname.replace("www.", "");
    } catch {
      fallbackTitle = url;
    }
    return c.json({ title: fallbackTitle, type: detectType(url) });
  }
});

app.get("/api/proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "URL is required" }, 400);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";

    // For PDFs, return the URL to be loaded directly in iframe
    if (contentType.includes("application/pdf")) {
      return c.json({ type: "pdf", url });
    }

    // For HTML content, process and return
    if (
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml")
    ) {
      let html = await response.text();

      // Extract the base URL for relative links
      const baseUrl = new URL(url);
      const baseHref = `${baseUrl.protocol}//${baseUrl.host}`;

      // Add base tag for relative URLs
      if (!html.includes("<base")) {
        html = html.replace(
          /<head([^>]*)>/i,
          `<head$1><base href="${baseHref}/">`,
        );
      }

      // Remove scripts that might cause issues
      html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

      // Fix relative URLs in common attributes
      html = html.replace(
        /(href|src|action)=["'](?!https?:\/\/|\/\/|#|javascript:|mailto:|data:)([^"']+)["']/gi,
        (match, attr, path) => {
          if (path.startsWith("/")) {
            return `${attr}="${baseHref}${path}"`;
          }
          return `${attr}="${baseHref}/${path}"`;
        },
      );

      return c.json({ type: "html", content: html, url });
    }

    // For other content types, return info
    return c.json({ type: "unsupported", contentType, url });
  } catch (error: any) {
    return c.json(
      { error: "Failed to fetch content", message: error.message },
      500,
    );
  }
});

app.post("/api/import/readwise", async (c) => {
  const contentType = c.req.header("content-type") || "";
  let csv = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (file && typeof file !== "string") {
      csv = await file.text();
    }
  } else if (
    contentType.includes("text/csv") ||
    contentType.includes("text/plain")
  ) {
    csv = await c.req.text();
  } else {
    const body = await c.req.json().catch(() => null);
    if (body?.csv) csv = body.csv;
  }

  if (!csv || !csv.trim()) {
    return c.json({ error: "CSV file is required" }, 400);
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return c.json({ error: "CSV is empty" }, 400);
  }

  const headerRow = rows.shift() || [];
  const headers = headerRow.map(normalizeHeader);

  const urlIndex = getHeaderIndex(headers, ["url"]);
  if (urlIndex === -1) {
    return c.json({ error: "CSV missing URL column" }, 400);
  }

  const titleIndex = getHeaderIndex(headers, ["title"]);
  const tagsIndex = getHeaderIndex(headers, [
    "document tags",
    "document_tags",
    "documenttags",
    "tags",
  ]);
  const savedIndex = getHeaderIndex(headers, [
    "saved date",
    "saved_date",
    "saved at",
    "saved_at",
    "saved",
  ]);

  let imported = 0;
  let duplicate = 0;
  let skipped = 0;
  let errors = 0;

  const seen = new Set<string>();
  const insertItem = db.query(
    "INSERT INTO items (url, title, type, created_at) VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))",
  );
  const existingItem = db.query("SELECT id FROM items WHERE url = ?");
  const insertTag = db.query("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const getTag = db.query("SELECT id FROM tags WHERE name = ?");
  const insertItemTag = db.query(
    "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
  );

  const importTx = db.transaction((dataRows: string[][]) => {
    for (const row of dataRows) {
      try {
        const url = row[urlIndex]?.trim();
        if (!url) {
          skipped++;
          continue;
        }

        if (seen.has(url)) {
          duplicate++;
          continue;
        }

        const existing = existingItem.get(url) as { id: number } | undefined;
        if (existing?.id) {
          duplicate++;
          continue;
        }

        seen.add(url);

        const title =
          (titleIndex !== -1 ? row[titleIndex] : "")?.trim() ||
          fallbackTitle(url);
        const tagsRaw = tagsIndex !== -1 ? row[tagsIndex] : "";
        const tags = parseReadwiseTags(tagsRaw);
        const savedRaw = savedIndex !== -1 ? row[savedIndex] : "";
        const createdAt = normalizeReadwiseDate(savedRaw);
        const type = detectType(url);

        const result = insertItem.run(
          url,
          title || "",
          type || "article",
          createdAt,
        );
        const itemId = result.lastInsertRowid;

        if (tags.length > 0) {
          for (const tagName of tags) {
            insertTag.run(tagName);
            const tag = getTag.get(tagName) as { id: number } | undefined;
            if (tag?.id) {
              insertItemTag.run(itemId, tag.id);
            }
          }
        }

        imported++;
      } catch {
        errors++;
      }
    }
  });

  importTx(rows);

  return c.json({ success: true, imported, duplicate, skipped, errors });
});

app.get("/api/items", (c) => {
  const tagsParam = c.req.query("tags");
  const typesParam = c.req.query("types");

  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
  const types = typesParam ? typesParam.split(",").filter(Boolean) : [];

  let query = "SELECT * FROM items";
  const conditions: string[] = [];
  const params: any[] = [];

  if (tags.length > 0) {
    const placeholders = tags.map(() => "?").join(",");
    conditions.push(`id IN (
      SELECT it.item_id FROM item_tags it
      JOIN tags t ON it.tag_id = t.id
      WHERE t.name IN (${placeholders})
    )`);
    params.push(...tags);
  }

  if (types.length > 0) {
    const placeholders = types.map(() => "?").join(",");
    conditions.push(`type IN (${placeholders})`);
    params.push(...types);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY created_at DESC";

  const items = db.query(query).all(...params);

  const itemsWithTags = items.map((item: any) => {
    const tags = db
      .query(
        `SELECT t.name FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ?`,
      )
      .all(item.id)
      .map((t: any) => t.name);
    const highlightCount = db
      .query("SELECT COUNT(*) as count FROM highlights WHERE item_id = ?")
      .get(item.id) as { count: number };
    return { ...item, tags, highlight_count: highlightCount?.count || 0 };
  });

  return c.json(itemsWithTags);
});

app.get("/api/tags", (c) => {
  const tags = db
    .query(
      "SELECT name, COUNT(item_tags.tag_id) as count FROM tags LEFT JOIN item_tags ON tags.id = item_tags.tag_id GROUP BY tags.id HAVING count > 0 ORDER BY name",
    )
    .all();
  return c.json(tags);
});

app.post("/api/items", async (c) => {
  const { url, title, type, tags } = await c.req.json();

  if (!url) return c.json({ error: "URL is required" }, 400);

  const result = db
    .query(`INSERT INTO items (url, title, type) VALUES (?, ?, ?)`)
    .run(url, title || "", type || "article");

  const itemId = result.lastInsertRowid;

  if (tags && Array.isArray(tags)) {
    for (const tagName of tags) {
      const trimmed = tagName.trim().toLowerCase();
      if (!trimmed) continue;

      db.query("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(trimmed);
      const tag = db
        .query("SELECT id FROM tags WHERE name = ?")
        .get(trimmed) as any;
      db.query("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)").run(
        itemId,
        tag.id,
      );
    }
  }

  return c.json({ id: itemId, success: true }, 201);
});

app.get("/api/items/:id", (c) => {
  const id = c.req.param("id");
  const item = db.query("SELECT * FROM items WHERE id = ?").get(id) as any;

  if (!item) return c.json({ error: "Item not found" }, 404);

  const tags = db
    .query(
      `SELECT t.name FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ?`,
    )
    .all(id)
    .map((t: any) => t.name);

  return c.json({ ...item, tags });
});

app.patch("/api/items/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (body.is_read !== undefined) {
    db.query("UPDATE items SET is_read = ? WHERE id = ?").run(
      body.is_read ? 1 : 0,
      id,
    );
  }

  if (body.title !== undefined) {
    db.query("UPDATE items SET title = ? WHERE id = ?").run(body.title, id);
  }

  if (body.notes !== undefined) {
    db.query("UPDATE items SET notes = ? WHERE id = ?").run(body.notes, id);
  }

  return c.json({ success: true });
});

app.put("/api/items/:id", async (c) => {
  const id = c.req.param("id");
  const { url, title, type, tags, notes } = await c.req.json();

  db.query(
    "UPDATE items SET url = ?, title = ?, type = ?, notes = ? WHERE id = ?",
  ).run(url, title || "", type || "article", notes || "", id);

  db.query("DELETE FROM item_tags WHERE item_id = ?").run(id);

  if (tags && Array.isArray(tags)) {
    for (const tagName of tags) {
      const trimmed = tagName.trim().toLowerCase();
      if (!trimmed) continue;

      db.query("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(trimmed);
      const tag = db
        .query("SELECT id FROM tags WHERE name = ?")
        .get(trimmed) as any;
      db.query("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)").run(
        id,
        tag.id,
      );
    }
  }

  return c.json({ success: true });
});

app.delete("/api/items/:id", (c) => {
  const id = c.req.param("id");
  db.query("DELETE FROM item_tags WHERE item_id = ?").run(id);
  db.query("DELETE FROM highlights WHERE item_id = ?").run(id);
  db.query("DELETE FROM items WHERE id = ?").run(id);
  return c.json({ success: true });
});

// Highlights API
app.get("/api/highlights", (c) => {
  const highlights = db
    .query(
      `SELECT h.*, i.title as item_title, i.url as item_url, i.type as item_type
       FROM highlights h
       JOIN items i ON h.item_id = i.id
       ORDER BY h.created_at DESC`,
    )
    .all();
  return c.json(highlights);
});

app.get("/api/items/:id/highlights", (c) => {
  const itemId = c.req.param("id");
  const highlights = db
    .query("SELECT * FROM highlights WHERE item_id = ? ORDER BY created_at ASC")
    .all(itemId);
  return c.json(highlights);
});

app.post("/api/items/:id/highlights", async (c) => {
  const itemId = c.req.param("id");
  const { selected_text, note } = await c.req.json();

  if (!selected_text) {
    return c.json({ error: "Selected text is required" }, 400);
  }

  const result = db
    .query(
      "INSERT INTO highlights (item_id, selected_text, note) VALUES (?, ?, ?)",
    )
    .run(itemId, selected_text, note || "");

  const highlight = db
    .query("SELECT * FROM highlights WHERE id = ?")
    .get(result.lastInsertRowid);

  return c.json(highlight, 201);
});

app.patch("/api/highlights/:id", async (c) => {
  const id = c.req.param("id");
  const { note } = await c.req.json();

  db.query("UPDATE highlights SET note = ? WHERE id = ?").run(note || "", id);

  const highlight = db.query("SELECT * FROM highlights WHERE id = ?").get(id);
  return c.json(highlight);
});

app.delete("/api/highlights/:id", (c) => {
  const id = c.req.param("id");
  db.query("DELETE FROM highlights WHERE id = ?").run(id);
  return c.json({ success: true });
});

const port = Bun.env.PORT || 3000;
console.log(`Reading List running at http://localhost:${port}`);

export default { port, fetch: app.fetch };
