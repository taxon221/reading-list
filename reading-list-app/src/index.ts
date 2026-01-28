import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { db, initDb } from "./db";

const app = new Hono();

initDb();

app.use("/*", cors());
app.use("/static/*", serveStatic({ root: "./public" }));
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
    return { ...item, tags };
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

  return c.json({ success: true });
});

app.put("/api/items/:id", async (c) => {
  const id = c.req.param("id");
  const { url, title, type, tags } = await c.req.json();

  db.query("UPDATE items SET url = ?, title = ?, type = ? WHERE id = ?").run(
    url,
    title || "",
    type || "article",
    id,
  );

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
  db.query("DELETE FROM items WHERE id = ?").run(id);
  return c.json({ success: true });
});

const port = Bun.env.PORT || 3000;
console.log(`Reading List running at http://localhost:${port}`);

export default { port, fetch: app.fetch };
