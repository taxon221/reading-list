import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const testDataDir = mkdtempSync(join(tmpdir(), "reading-list-test-"));
const bootstrapAdminEmail = "admin@example.com";
const secondUserEmail = "user2@example.com";
const accessAudience = "reading-list-test-audience";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const publicJwk = await exportJWK(publicKey);
publicJwk.alg = "RS256";
publicJwk.kid = "test-key";
publicJwk.use = "sig";

const jwksServer = createServer((req, res) => {
	if (req.url !== "/cdn-cgi/access/certs") {
		res.writeHead(404).end();
		return;
	}

	res
		.writeHead(200, { "content-type": "application/json" })
		.end(JSON.stringify({ keys: [publicJwk] }));
});

await new Promise<void>((resolve) => {
	jwksServer.listen(0, "127.0.0.1", resolve);
});

const jwksAddress = jwksServer.address();
if (!jwksAddress || typeof jwksAddress === "string") {
	throw new Error("Failed to start local JWKS server for tests.");
}

const accessIssuer = `http://127.0.0.1:${jwksAddress.port}`;

Bun.env.DATA_DIR = testDataDir;
Bun.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapAdminEmail;
Bun.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = accessIssuer;
Bun.env.CLOUDFLARE_ACCESS_AUD = accessAudience;
Bun.env.AUTH_MODE = "cloudflare";

const { db, initDb } = await import("./db");
const appModule = await import("./index");
const app = appModule.default;

type UserRow = {
	id: number;
	email: string;
	is_admin: number;
};

type ItemResponse = {
	id: number;
	title: string;
	tags: string[];
	highlight_count: number;
};

function dropAllTables() {
	db.exec("PRAGMA foreign_keys = OFF");

	for (const table of [
		"item_tags",
		"highlights",
		"user_preferences",
		"tags_legacy",
		"tags",
		"items",
		"users",
	]) {
		db.run(`DROP TABLE IF EXISTS ${table}`);
	}

	db.exec("PRAGMA foreign_keys = ON");
}

function resetCurrentSchema() {
	dropAllTables();
	initDb();
}

function createUser(email: string) {
	db.query(
		"INSERT INTO users (email, display_name, is_admin) VALUES (?, ?, 0)",
	).run(email, email.split("@")[0]);
}

async function createAccessToken(email: string, audience = accessAudience) {
	return await new SignJWT({ email, name: email.split("@")[0] })
		.setProtectedHeader({ alg: "RS256", kid: "test-key" })
		.setIssuer(accessIssuer)
		.setAudience(audience)
		.setIssuedAt()
		.setExpirationTime("10m")
		.sign(privateKey);
}

async function api(
	path: string,
	init: RequestInit = {},
	email?: string,
): Promise<Response> {
	const headers = new Headers(init.headers);
	if (email) {
		headers.set("cf-access-jwt-assertion", await createAccessToken(email));
	}

	return app.fetch(
		new Request(`http://localhost${path}`, {
			...init,
			headers,
		}),
	);
}

async function apiJson<T>(
	path: string,
	init: RequestInit = {},
	email?: string,
): Promise<T> {
	const response = await api(path, init, email);
	return (await response.json()) as T;
}

beforeEach(() => {
	Bun.env.AUTH_MODE = "cloudflare";
	delete Bun.env.LOCAL_DEV_AUTH_EMAIL;
	resetCurrentSchema();
});

afterAll(() => {
	db.close();
	jwksServer.close();
	rmSync(testDataDir, { recursive: true, force: true });
});

describe("auth and user isolation", () => {
	test("rejects missing identities while auto-provisioning users and the bootstrap admin", async () => {
		const missingIdentity = await api("/api/items");
		expect(missingIdentity.status).toBe(401);

		const unknownUser = await api("/api/items", {}, "stranger@example.com");
		expect(unknownUser.status).toBe(200);
		expect(await unknownUser.json()).toEqual([]);

		const createdUser = db
			.query("SELECT id, email, is_admin FROM users WHERE email = ?")
			.get("stranger@example.com") as UserRow | undefined;

		expect(createdUser?.email).toBe("stranger@example.com");
		expect(createdUser?.is_admin).toBe(0);

		const bootstrapAdmin = await api("/api/items", {}, bootstrapAdminEmail);
		expect(bootstrapAdmin.status).toBe(200);
		expect(await bootstrapAdmin.json()).toEqual([]);

		const adminUser = db
			.query("SELECT id, email, is_admin FROM users WHERE email = ?")
			.get(bootstrapAdminEmail) as UserRow | undefined;

		expect(adminUser?.email).toBe(bootstrapAdminEmail);
		expect(adminUser?.is_admin).toBe(1);
	});

	test("allows explicit localhost dev auth without Cloudflare headers", async () => {
		Bun.env.AUTH_MODE = "local";
		Bun.env.LOCAL_DEV_AUTH_EMAIL = bootstrapAdminEmail;

		const response = await api("/api/items");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	test("keeps items, tags, and highlights isolated per user", async () => {
		createUser(secondUserEmail);

		const adminCreate = await apiJson<{ id: number }>(
			"/api/items",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/admin",
					title: "Admin item",
					tags: ["admin-tag"],
				}),
			},
			bootstrapAdminEmail,
		);

		const secondCreate = await apiJson<{ id: number }>(
			"/api/items",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/user2",
					title: "User two item",
					tags: ["user-tag"],
				}),
			},
			secondUserEmail,
		);

		const adminHighlight = await apiJson<{ id: number }>(
			`/api/items/${adminCreate.id}/highlights`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					selected_text: "admin quote",
					note: "admin note",
				}),
			},
			bootstrapAdminEmail,
		);

		const adminItems = await apiJson<ItemResponse[]>(
			"/api/items",
			{},
			bootstrapAdminEmail,
		);
		expect(adminItems).toHaveLength(1);
		expect(adminItems[0]?.id).toBe(adminCreate.id);
		expect(adminItems[0]?.tags).toEqual(["admin-tag"]);
		expect(adminItems[0]?.highlight_count).toBe(1);

		const secondUserItems = await apiJson<ItemResponse[]>(
			"/api/items",
			{},
			secondUserEmail,
		);
		expect(secondUserItems).toHaveLength(1);
		expect(secondUserItems[0]?.id).toBe(secondCreate.id);
		expect(secondUserItems[0]?.tags).toEqual(["user-tag"]);
		expect(secondUserItems[0]?.highlight_count).toBe(0);

		const adminTags = await apiJson<Array<{ name: string; count: number }>>(
			"/api/tags",
			{},
			bootstrapAdminEmail,
		);
		expect(adminTags).toEqual([{ name: "admin-tag", count: 1 }]);

		const secondUserTags = await apiJson<
			Array<{ name: string; count: number }>
		>("/api/tags", {}, secondUserEmail);
		expect(secondUserTags).toEqual([{ name: "user-tag", count: 1 }]);

		const blockedRead = await api(
			`/api/items/${adminCreate.id}`,
			{},
			secondUserEmail,
		);
		expect(blockedRead.status).toBe(404);

		const blockedUpdate = await api(
			`/api/items/${adminCreate.id}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Nope" }),
			},
			secondUserEmail,
		);
		expect(blockedUpdate.status).toBe(404);

		const blockedHighlightDelete = await api(
			`/api/highlights/${adminHighlight.id}`,
			{ method: "DELETE" },
			secondUserEmail,
		);
		expect(blockedHighlightDelete.status).toBe(404);
	});

	test("stores saved views per user account", async () => {
		createUser(secondUserEmail);

		const adminViews = [
			{
				id: "admin-view",
				name: "Admin only",
				filters: { selectedTags: ["admin-tag"] },
			},
		];
		const secondUserViews = [
			{
				id: "user2-view",
				name: "User two only",
				filters: { selectedTypes: ["article"] },
			},
		];

		const adminSave = await api(
			"/api/preferences/saved-views",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ savedViews: adminViews }),
			},
			bootstrapAdminEmail,
		);
		expect(adminSave.status).toBe(200);

		const secondUserSave = await api(
			"/api/preferences/saved-views",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ savedViews: secondUserViews }),
			},
			secondUserEmail,
		);
		expect(secondUserSave.status).toBe(200);

		const loadedAdminViews = await apiJson<typeof adminViews>(
			"/api/preferences/saved-views",
			{},
			bootstrapAdminEmail,
		);
		expect(loadedAdminViews).toEqual(adminViews);

		const loadedSecondUserViews = await apiJson<typeof secondUserViews>(
			"/api/preferences/saved-views",
			{},
			secondUserEmail,
		);
		expect(loadedSecondUserViews).toEqual(secondUserViews);
	});

	test("auto-marks items read from progress without affecting other users", async () => {
		createUser(secondUserEmail);

		const adminCreate = await apiJson<{ id: number }>(
			"/api/items",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/admin-read",
					title: "Admin read item",
				}),
			},
			bootstrapAdminEmail,
		);

		await apiJson<{ id: number }>(
			"/api/items",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/user2-unread",
					title: "User two unread item",
				}),
			},
			secondUserEmail,
		);

		await api(
			`/api/items/${adminCreate.id}/progress`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					progress: { kind: "article", ratio: 1 },
				}),
			},
			bootstrapAdminEmail,
		);

		const adminItems = await apiJson<Array<{ id: number; is_read: number }>>(
			"/api/items",
			{},
			bootstrapAdminEmail,
		);
		expect(adminItems).toHaveLength(1);
		expect(adminItems[0]?.id).toBe(adminCreate.id);
		expect(adminItems[0]?.is_read).toBe(1);

		const secondUserItems = await apiJson<Array<{ is_read: number }>>(
			"/api/items",
			{},
			secondUserEmail,
		);
		expect(secondUserItems).toHaveLength(1);
		expect(secondUserItems[0]?.is_read).toBe(0);
	});

	test("serves uploaded files only to the owning user", async () => {
		createUser(secondUserEmail);
		mkdirSync(join(testDataDir, "uploads"), { recursive: true });
		await Bun.write(join(testDataDir, "uploads", "owned.pdf"), "owned-pdf");

		const adminUser = db
			.query("SELECT id FROM users WHERE email = ?")
			.get(bootstrapAdminEmail) as { id: number } | undefined;
		const secondUser = db
			.query("SELECT id FROM users WHERE email = ?")
			.get(secondUserEmail) as { id: number } | undefined;

		db.query(
			"INSERT INTO items (user_id, url, title, author, type) VALUES (?, ?, ?, ?, ?)",
		).run(adminUser?.id, "/uploads/owned.pdf", "Owned PDF", "", "pdf");

		db.query(
			"INSERT INTO items (user_id, url, title, author, type) VALUES (?, ?, ?, ?, ?)",
		).run(
			secondUser?.id,
			"https://example.com/user2",
			"User two item",
			"",
			"article",
		);

		const ownerResponse = await api(
			"/api/uploads/owned.pdf",
			{},
			bootstrapAdminEmail,
		);
		expect(ownerResponse.status).toBe(200);
		expect(ownerResponse.headers.get("content-type")).toContain(
			"application/pdf",
		);
		expect(await ownerResponse.text()).toBe("owned-pdf");

		const blockedResponse = await api(
			"/api/uploads/owned.pdf",
			{},
			secondUserEmail,
		);
		expect(blockedResponse.status).toBe(404);
	});

	test("migrates legacy single-user data to the bootstrap admin", async () => {
		dropAllTables();

		db.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'article',
        notes TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read INTEGER DEFAULT 0
      );
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE item_tags (
        item_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (item_id, tag_id)
      );
      CREATE TABLE highlights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        selected_text TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
		db.query(
			"INSERT INTO items (url, title, author, type, notes) VALUES (?, ?, ?, ?, ?)",
		).run(
			"https://legacy.example.com",
			"Legacy item",
			"Legacy author",
			"article",
			"legacy note",
		);
		db.query("INSERT INTO tags (name) VALUES (?)").run("legacy-tag");
		db.query("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)").run(1, 1);
		db.query(
			"INSERT INTO highlights (item_id, selected_text, note) VALUES (?, ?, ?)",
		).run(1, "legacy quote", "legacy note");

		initDb();

		const adminUser = db
			.query("SELECT id, email, is_admin FROM users WHERE email = ?")
			.get(bootstrapAdminEmail) as UserRow | undefined;

		expect(adminUser?.is_admin).toBe(1);

		const migratedItem = db
			.query("SELECT user_id, title, author, notes FROM items WHERE id = 1")
			.get() as {
			user_id: number;
			title: string;
			author: string;
			notes: string;
		};
		expect(migratedItem).toEqual({
			user_id: adminUser?.id || 0,
			title: "Legacy item",
			author: "Legacy author",
			notes: "legacy note",
		});

		const migratedTag = db
			.query("SELECT user_id, name FROM tags WHERE id = 1")
			.get() as { user_id: number; name: string };
		expect(migratedTag).toEqual({
			user_id: adminUser?.id || 0,
			name: "legacy-tag",
		});

		const migratedHighlight = db
			.query("SELECT user_id, item_id, note FROM highlights WHERE id = 1")
			.get() as { user_id: number; item_id: number; note: string };
		expect(migratedHighlight).toEqual({
			user_id: adminUser?.id || 0,
			item_id: 1,
			note: "legacy note",
		});
	});
});
