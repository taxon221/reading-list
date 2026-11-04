import { appCode, createBrowser, until } from "./browser-fixture";
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
Bun.env.APP_PUBLIC_URL = "http://localhost";
Bun.env.ARTICLE_CAPTURE_ON_SAVE = "false";
Bun.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapAdminEmail;
Bun.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = accessIssuer;
Bun.env.CLOUDFLARE_ACCESS_AUD = accessAudience;
Bun.env.AUTH_MODE = "cloudflare";
Bun.env.RSS_ALLOW_PRIVATE_HOSTS = "true";

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
		"auth_sessions",
		"auth_passkeys",
		"auth_invites",
		"auth_challenges",
		"auth_recovery_codes",
		"article_snapshots",
		"media_cache",
		"pending_shares",
		"rss_subscription_seen",
		"rss_subscriptions",
		"uploaded_files",
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
		{ requestIP: () => ({ address: "127.0.0.1", family: "IPv4", port: 1234 }) },
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

type TestRequest = {
	body?: unknown;
	headers?: Record<string, string>;
	address?: string;
	url?: string;
};
function appRequest(
	path: string,
	{
		body,
		headers = {},
		address = "127.0.0.1",
		url = "http://localhost",
	}: TestRequest = {},
) {
	return app.fetch(
		new Request(
			new URL(path.startsWith("/") ? path : `/api/auth/${path}`, url),
			{
				method: body === undefined ? "GET" : "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: url,
					...headers,
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			},
		),
		{ requestIP: () => ({ address, family: "IPv4", port: 1234 }) },
	);
}

beforeEach(() => {
	Bun.env.AUTH_MODE = "cloudflare";
	Bun.env.APP_PUBLIC_URL = "http://localhost";
	delete Bun.env.APP_HOST;
	delete Bun.env.LOCAL_DEV_AUTH_EMAIL;
	resetCurrentSchema();
});

afterAll(() => {
	db.close();
	jwksServer.close();
	rmSync(testDataDir, { recursive: true, force: true });
});

describe("auth and user isolation", () => {
	test("preserves notes when creating an item from the iOS editor or share sheet", async () => {
		const response = await api(
			"/api/items",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/notes",
					title: "Notes",
					notes: "Keep this note",
				}),
			},
			bootstrapAdminEmail,
		);
		expect(response.status).toBe(201);
		const { id } = (await response.json()) as { id: number };
		const item = await apiJson<{ notes: string }>(
			`/api/items/${id}`,
			{},
			bootstrapAdminEmail,
		);
		expect(item.notes).toBe("Keep this note");
	});

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
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");

		const crossOriginForm = await api("/api/import/file", {
			method: "POST",
			headers: {
				"Content-Type": "text/plain",
				Origin: "https://evil.example",
			},
			body: "blocked",
		});
		expect(crossOriginForm.status).toBe(403);
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

	test("follows a RSS feed without importing existing posts and only imports future posts", async () => {
		let includeFuturePost = false;
		const feedServer = createServer((req, res) => {
			if (req.url !== "/rss/") {
				res.writeHead(404).end();
				return;
			}

			res
				.writeHead(200, { "content-type": "application/rss+xml" })
				.end(`<?xml version="1.0"?>
				<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
					<channel>
						<title>Test newsletter</title>
						<link>https://example.com/</link>
						<item>
							<title>Existing newsletter post</title>
							<link>https://example.com/existing-post/</link>
							<guid>post-existing</guid>
							<dc:creator>Newsletter Author</dc:creator>
						</item>
						${
							includeFuturePost
								? `<item>
							<title>Future newsletter post</title>
							<link>https://example.com/future-post/</link>
							<guid>post-future</guid>
							<dc:creator>Newsletter Author</dc:creator>
						</item>`
								: ""
						}
					</channel>
				</rss>`);
		});

		await new Promise<void>((resolve) => {
			feedServer.listen(0, "127.0.0.1", resolve);
		});

		try {
			const address = feedServer.address();
			if (!address || typeof address === "string") {
				throw new Error("Failed to start feed server.");
			}

			const feedUrl = `http://127.0.0.1:${address.port}/rss/`;
			const created = await apiJson<{ id: number; seen: number }>(
				"/api/rss-subscriptions",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ feed_url: feedUrl }),
				},
				bootstrapAdminEmail,
			);

			expect(created.seen).toBe(1);
			expect(
				await apiJson<ItemResponse[]>("/api/items", {}, bootstrapAdminEmail),
			).toEqual([]);

			includeFuturePost = true;
			const duplicate = await apiJson<{ id: number; seen: number }>(
				"/api/rss-subscriptions",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ feed_url: feedUrl }),
				},
				bootstrapAdminEmail,
			);
			expect(duplicate.id).toBe(created.id);
			expect(duplicate.seen).toBe(0);

			const rerun = await apiJson<{ imported: number; skipped: number }>(
				`/api/rss-subscriptions/${created.id}/import`,
				{ method: "POST" },
				bootstrapAdminEmail,
			);
			expect(rerun.imported).toBe(1);
			expect(rerun.skipped).toBe(1);

			const items = await apiJson<ItemResponse[]>(
				"/api/items",
				{},
				bootstrapAdminEmail,
			);
			expect(items.map((item) => item.title)).toEqual([
				"Future newsletter post",
			]);
			expect(items[0]?.tags.sort()).toEqual(["newsletter", "rss"]);
		} finally {
			feedServer.close();
		}
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

		const ownedItem = db
			.query(
				"INSERT INTO items (user_id, url, title, author, type) VALUES (?, ?, ?, ?, ?)",
			)
			.run(adminUser?.id, "/uploads/owned.pdf", "Owned PDF", "", "pdf");
		db.query(
			"INSERT INTO uploaded_files (item_id, filename, media_type) VALUES (?, ?, 'pdf')",
		).run(ownedItem.lastInsertRowid, "owned.pdf");

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

		const forgedItem = db
			.query(
				"INSERT INTO items (user_id, url, title, author, type) VALUES (?, ?, ?, ?, ?)",
			)
			.run(secondUser?.id, "/uploads/owned.pdf", "Forged PDF", "", "pdf");
		expect(
			(await api("/api/uploads/owned.pdf", {}, secondUserEmail)).status,
		).toBe(404);
		expect(
			(
				await api(
					`/api/items/${forgedItem.lastInsertRowid}`,
					{ method: "DELETE" },
					secondUserEmail,
				)
			).status,
		).toBe(200);
		expect(
			await (
				await api("/api/uploads/owned.pdf", {}, bootstrapAdminEmail)
			).text(),
		).toBe("owned-pdf");
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
	test.each([
		"invitation",
		"local setup",
		"reader invitation",
	])("verifies WebAuthn registration through %s, rejects replay and revokes sessions", async (method) => {
		Bun.env.AUTH_MODE = "app";
		if (method === "local setup") Bun.env.APP_HOST = "127.0.0.1";
		const { createInvite, hash } = await import("./server/sessions");
		const { isoCBOR } = await import("@simplewebauthn/server/helpers");
		const { generateKeyPairSync, createHash, randomBytes, sign } = await import(
			"node:crypto"
		);
		const enrollmentEmail =
			method === "reader invitation" ? secondUserEmail : bootstrapAdminEmail;
		if (method === "reader invitation") createUser(enrollmentEmail);
		const owner = db
			.query("SELECT id FROM users WHERE email=?")
			.get(bootstrapAdminEmail) as { id: number };
		if (method === "reader invitation")
			db.query("INSERT INTO items (user_id,url,title) VALUES (?,?,?)").run(
				owner.id,
				"https://example.com/owner-private",
				"Owner private item",
			);
		const user = db
			.query("SELECT id FROM users WHERE email=?")
			.get(enrollmentEmail) as { id: number };
		const jar = new Map<string, string>();
		async function call(path: string, body: unknown = {}, method = "POST") {
			const response = await appRequest(path, {
				body: method === "GET" ? undefined : body,
				headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join(";") },
			});
			for (const cookie of response.headers.getSetCookie()) {
				const [pair] = cookie.split(";");
				const at = pair.indexOf("=");
				jar.set(pair.slice(0, at), pair.slice(at + 1));
			}
			return response;
		}
		expect((await call("/api/auth/register/options")).status).toBe(401);
		const invite = createInvite(
			user.id,
			method === "reader invitation" ? owner.id : null,
		);
		const setup = method === "local setup";
		expect(
			(await (await call("/api/auth/info", {}, "GET")).json()).setupAvailable,
		).toBe(setup);
		const options = await call(
			"/api/auth/register/options",
			setup ? { localSetup: true } : { invite },
		).then((r) => r.json());
		expect(options.rp.id).toBe("localhost");
		if (method === "reader invitation") {
			expect(
				(await (await call("/api/auth/invite/details", { invite })).json())
					.email,
			).toBe(enrollmentEmail);
			expect((await call("/api/items", {}, "GET")).status).toBe(401);
		}
		const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
		const jwk = pair.publicKey.export({ format: "jwk" });
		const publicKey = isoCBOR.encode(
			new Map<number, number | Uint8Array>([
				[1, 2],
				[3, -7],
				[-1, 1],
				[-2, new Uint8Array(Buffer.from(jwk.x || "", "base64url"))],
				[-3, new Uint8Array(Buffer.from(jwk.y || "", "base64url"))],
			]),
		);
		const id = randomBytes(32);
		const rpHash = createHash("sha256").update("localhost").digest();
		const idLength = Buffer.alloc(2);
		idLength.writeUInt16BE(id.length);
		const authData = Buffer.concat([
			rpHash,
			Buffer.from([0x45]),
			Buffer.alloc(4),
			Buffer.alloc(16),
			idLength,
			id,
			publicKey,
		]);
		const clientData = (
			type: string,
			challenge: string,
			origin = "http://localhost",
		) => Buffer.from(JSON.stringify({ type, challenge, origin }));
		const registration = {
			id: id.toString("base64url"),
			rawId: id.toString("base64url"),
			type: "public-key",
			clientExtensionResults: {},
			response: {
				clientDataJSON: clientData(
					"webauthn.create",
					options.challenge,
				).toString("base64url"),
				attestationObject: Buffer.from(
					isoCBOR.encode(
						new Map<string, string | Uint8Array | Map<string, string>>([
							["fmt", "none"],
							["authData", new Uint8Array(authData)],
							["attStmt", new Map()],
						]),
					),
				).toString("base64url"),
				transports: ["internal"],
			},
		};
		const enrolled = await call("/api/auth/register/verify", {
			response: registration,
		});
		expect(enrolled.status).toBe(200);
		const data = await enrolled.json();
		expect(data.recoveryCodes).toHaveLength(8);
		expect(
			(await (await call("/api/auth/info", {}, "GET")).json()).setupAvailable,
		).toBe(false);
		expect((await call("/api/items", {}, "GET")).status).toBe(200);
		if (method === "reader invitation") {
			expect(await (await call("/api/items", {}, "GET")).json()).toEqual([]);
			expect((await call("/api/auth/manage/invites", {}, "GET")).status).toBe(
				403,
			);
		}
		if (setup)
			expect(
				db
					.query("SELECT token_hash FROM auth_invites WHERE token_hash=?")
					.get(hash(invite)),
			).toBeNull();
		else {
			expect(
				(
					db
						.query("SELECT accepted_at FROM auth_invites WHERE token_hash=?")
						.get(hash(invite)) as { accepted_at: number }
				).accepted_at,
			).toBeGreaterThan(0);
			expect((await call("/api/auth/invite/details", { invite })).status).toBe(
				410,
			);
			expect(
				(await call("/api/auth/register/options", { invite })).status,
			).toBe(401);
		}
		expect(
			(await call("/api/auth/register/verify", { response: registration }))
				.status,
		).toBe(400);
		const oldSession = jar.get("reading_session");
		expect((await call("/api/auth/logout")).status).toBe(200);
		expect((await call("/api/items", {}, "GET")).status).toBe(401);
		expect(
			(await call("/api/auth/register/options", { localSetup: true })).status,
		).toBe(401);
		const login = await call("/api/auth/login/options").then((r) => r.json());
		const client = clientData("webauthn.get", login.challenge);
		const counter = Buffer.alloc(4);
		counter.writeUInt32BE(1);
		const assertionData = Buffer.concat([rpHash, Buffer.from([0x05]), counter]);
		const assertion = {
			id: id.toString("base64url"),
			rawId: id.toString("base64url"),
			type: "public-key",
			clientExtensionResults: {},
			response: {
				clientDataJSON: client.toString("base64url"),
				authenticatorData: assertionData.toString("base64url"),
				signature: sign(
					"sha256",
					Buffer.concat([
						assertionData,
						createHash("sha256").update(client).digest(),
					]),
					pair.privateKey,
				).toString("base64url"),
				userHandle: Buffer.from(String(user.id)).toString("base64url"),
			},
		};
		const signedIn = await call("/api/auth/login/verify", {
			response: assertion,
		});
		expect(signedIn.status).toBe(200);
		expect(jar.get("reading_session")).not.toBe(oldSession);
		const cookie = signedIn.headers.get("set-cookie") || "";
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Strict");
		const devices = await call("/api/auth/manage/devices", {}, "GET").then(
			(r) => r.json(),
		);
		expect(devices.devices).toHaveLength(1);
		expect(
			(await call("/api/auth/manage/revoke", { id: devices.devices[0].id }))
				.status,
		).toBe(200);
		expect((await call("/api/items", {}, "GET")).status).toBe(401);
		expect(
			(
				await call("/api/auth/recover", {
					email: enrollmentEmail,
					code: data.recoveryCodes[0],
				})
			).status,
		).toBe(200);
		expect(
			(
				await call("/api/auth/recover", {
					email: enrollmentEmail,
					code: data.recoveryCodes[0],
				})
			).status,
		).toBe(401);
		expect((await call("/api/items", {}, "GET")).status).toBe(200);
	});

	test("tracks pending, revoked and expired invitations, replaces links safely and restricts management to the owner", async () => {
		Bun.env.AUTH_MODE = "app";
		const { hash, secret, rotateRecoveryCodes } = await import(
			"./server/sessions"
		);
		const owner = db
			.query("SELECT id FROM users WHERE email=?")
			.get(bootstrapAdminEmail) as { id: number };
		createUser(secondUserEmail);
		const reader = db
			.query("SELECT id FROM users WHERE email=?")
			.get(secondUserEmail) as { id: number };
		const now = Date.now();
		const ownerToken = secret(),
			readerToken = secret();
		for (const [token, id] of [
			[ownerToken, owner.id],
			[readerToken, reader.id],
		] as const)
			db.query("INSERT INTO auth_sessions VALUES (?,?,?,?,?,?)").run(
				hash(token),
				id,
				"Test",
				now,
				now,
				now + 60000,
			);
		const request = (path: string, body?: unknown, token = ownerToken) =>
			appRequest(path, {
				body,
				headers: { Cookie: token ? `reading_session=${token}` : "" },
			});
		const create = () =>
			request("manage/invite", { email: "invited@example.com" });
		const tokenFrom = (url: string) =>
			new URLSearchParams(new URL(url).hash.slice(1)).get("invite");
		const first = await create();
		expect(first.status).toBe(200);
		const original = tokenFrom((await first.json()).url);
		expect(
			(await request("invite/details", { invite: original }, "")).status,
		).toBe(200);
		expect((await request("manage/invites", undefined, "")).status).toBe(401);
		expect(
			(await request("manage/invites", undefined, readerToken)).status,
		).toBe(403);
		expect(
			(
				await request(
					"manage/invite",
					{ email: "someone@example.com" },
					readerToken,
				)
			).status,
		).toBe(403);
		let invites = (await (await request("manage/invites")).json()).invitations;
		expect(invites.map((i) => i.status)).toEqual(["pending"]);
		expect(JSON.stringify(invites)).not.toContain(original);
		expect(
			(
				await request(
					"manage/revoke-invite",
					{ id: invites[0].id },
					readerToken,
				)
			).status,
		).toBe(403);
		const replacement = tokenFrom((await (await create()).json()).url);
		expect(replacement).not.toBe(original);
		expect(
			(await request("invite/details", { invite: original }, "")).status,
		).toBe(410);
		expect(
			(await request("register/options", { invite: original }, "")).status,
		).toBe(401);
		invites = (await (await request("manage/invites")).json()).invitations;
		expect(invites.map((i) => i.status)).toEqual(["pending", "revoked"]);
		expect(
			(await request("manage/revoke-invite", { id: hash(replacement || "") }))
				.status,
		).toBe(200);
		expect(
			(await request("invite/details", { invite: replacement }, "")).status,
		).toBe(410);
		const expired = tokenFrom((await (await create()).json()).url);
		db.query("UPDATE auth_invites SET expires_at=? WHERE token_hash=?").run(
			now - 1,
			hash(expired || ""),
		);
		expect(
			(await request("invite/details", { invite: expired }, "")).status,
		).toBe(410);
		expect(
			(await (await request("manage/invites")).json()).invitations[0].status,
		).toBe("expired");
		const invited = db
			.query("SELECT id FROM users WHERE email='invited@example.com'")
			.get() as { id: number };
		rotateRecoveryCodes(invited.id);
		expect((await create()).status).toBe(409);
		db.query("UPDATE auth_sessions SET created_at=? WHERE id=?").run(
			now - 700000,
			hash(ownerToken),
		);
		expect(
			(await request("manage/invite", { email: "new@example.com" })).status,
		).toBe(403);
	});

	test("restricts automatic first-run setup to direct loopback and rechecks it at verification", async () => {
		Bun.env.AUTH_MODE = "app";
		Bun.env.APP_HOST = "127.0.0.1";
		const { rotateRecoveryCodes } = await import("./server/sessions");
		const user = db
			.query("SELECT id FROM users WHERE email=?")
			.get(bootstrapAdminEmail) as { id: number };
		const request = (path: string, options: TestRequest = {}) =>
			appRequest(path, {
				body: path.endsWith("info") ? undefined : {},
				...options,
			});
		expect((await (await request("info")).json()).setupAvailable).toBe(true);
		for (const override of [
			{ address: "203.0.113.5", headers: { "x-forwarded-for": "127.0.0.1" } },
			{ address: "203.0.113.5" },
			{ address: "" },
			{ headers: { forwarded: "for=127.0.0.1" } },
			{ headers: { "x-forwarded-for": "127.0.0.1" } },
			{ headers: { "x-forwarded-host": "localhost" } },
			{ headers: { "x-forwarded-proto": "http" } },
			{ url: "http://127.0.0.1", headers: { Origin: "http://localhost" } },
		]) {
			expect(
				(await (await request("info", override)).json()).setupAvailable,
			).toBe(false);
			expect(
				(
					await request("register/options", {
						...override,
						body: { localSetup: true },
					})
				).status,
			).toBe(401);
		}
		Bun.env.APP_HOST = "0.0.0.0";
		expect(
			(await request("register/options", { body: { localSetup: true } }))
				.status,
		).toBe(401);
		Bun.env.APP_HOST = "127.0.0.1";
		Bun.env.APP_PUBLIC_URL = "https://reading.example.com";
		expect(
			(
				await (
					await request("info", { url: "https://reading.example.com" })
				).json()
			).setupAvailable,
		).toBe(false);
		expect(
			(
				await request("register/options", {
					url: "https://reading.example.com",
					body: { localSetup: true },
				})
			).status,
		).toBe(401);
		Bun.env.APP_PUBLIC_URL = "http://localhost";
		expect(
			(
				await request("register/options", {
					headers: { Origin: "" },
					body: { localSetup: true },
				})
			).status,
		).toBe(401);
		expect(
			(
				await request("register/options", {
					headers: { Origin: "https://other.example" },
					body: { localSetup: true },
				})
			).status,
		).toBe(403);
		const options = await request("register/options", {
			body: { localSetup: true },
		});
		expect(options.status).toBe(200);
		const cookie = options.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");
		rotateRecoveryCodes(user.id);
		expect((await (await request("info")).json()).setupAvailable).toBe(false);
		expect(
			(await request("register/verify", { headers: { Cookie: cookie } }))
				.status,
		).toBe(401);
		expect(
			db.query("SELECT COUNT(*) AS count FROM auth_passkeys").get(),
		).toEqual({ count: 0 });
	});

	test("rejects forged localhost requests from a remote peer", async () => {
		Bun.env.AUTH_MODE = "local";
		Bun.env.LOCAL_DEV_AUTH_EMAIL = bootstrapAdminEmail;
		const response = await app.fetch(
			new Request("http://localhost/api/items", {
				headers: { Host: "localhost", "X-Forwarded-For": "127.0.0.1" },
			}),
			{
				requestIP: () => ({
					address: "203.0.113.8",
					family: "IPv4",
					port: 1234,
				}),
			},
		);
		expect(response.status).toBe(401);
		expect(
			(await app.fetch(new Request("http://localhost/api/items"))).status,
		).toBe(401);
	});

	test("keeps app sessions isolated and checks expiry, origin, invitation permissions and recent sign-in", async () => {
		Bun.env.AUTH_MODE = "app";
		createUser(secondUserEmail);
		const { hash, secret, createInvite } = await import("./server/sessions");
		const owner = db
			.query("SELECT id FROM users WHERE email=?")
			.get(bootstrapAdminEmail) as { id: number };
		const other = db
			.query("SELECT id FROM users WHERE email=?")
			.get(secondUserEmail) as { id: number };
		const token = secret();
		const now = Date.now();
		db.query("INSERT INTO auth_sessions VALUES (?,?,?,?,?,?)").run(
			hash(token),
			other.id,
			"Test device",
			now,
			now,
			now + 60000,
		);
		const request = (
			path: string,
			body: unknown = {},
			origin = "http://localhost",
		) =>
			appRequest(path, {
				body,
				headers: { Origin: origin, Cookie: `reading_session=${token}` },
			});
		expect(
			(await request("/api/auth/manage/invite", { email: "new@example.com" }))
				.status,
		).toBe(403);
		expect(
			(await request("/api/auth/login/options", {}, "https://evil.example"))
				.status,
		).toBe(403);
		db.query("UPDATE auth_sessions SET user_id=? WHERE id=?").run(
			owner.id,
			hash(token),
		);
		const invited = await request("/api/auth/manage/invite", {
			email: "new@example.com",
		});
		expect(invited.status).toBe(200);
		const link = await invited.json();
		expect(link.url).toStartWith("http://localhost/#invite=");
		expect(
			(await request("/api/auth/manage/invite", { email: bootstrapAdminEmail }))
				.status,
		).toBe(409);
		db.query("UPDATE auth_sessions SET created_at=? WHERE id=?").run(
			now - 700000,
			hash(token),
		);
		expect((await request("/api/auth/manage/recovery")).status).toBe(403);
		db.query("UPDATE auth_sessions SET expires_at=? WHERE id=?").run(
			now - 1,
			hash(token),
		);
		expect(
			(await request("/api/auth/manage/revoke", { id: "anything" })).status,
		).toBe(401);
		const invite = createInvite(owner.id);
		db.query("UPDATE auth_invites SET expires_at=? WHERE token_hash=?").run(
			now - 1,
			hash(invite),
		);
		expect(
			(await request("/api/auth/register/options", { invite })).status,
		).toBe(401);
	});

	test("deduplicates tracking URLs per account and rejects unsupported links", async () => {
		createUser(secondUserEmail);
		const create = (url: string, email = bootstrapAdminEmail) =>
			api(
				"/api/items",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url, title: "A saved link" }),
				},
				email,
			);
		const first = await create(
			"https://example.com/story?utm_source=email#section",
		);
		expect(first.status).toBe(201);
		const item = await first.json();
		const duplicate = await create("https://example.com/story");
		expect(duplicate.status).toBe(200);
		expect(await duplicate.json()).toEqual({
			id: item.id,
			success: true,
			duplicate: true,
		});
		expect(
			(await create("https://example.com/story", secondUserEmail)).status,
		).toBe(201);
		expect((await create("javascript:alert(1)")).status).toBe(400);

		// Items saved before canonicalization still count as duplicates.
		const owner = db
			.query("SELECT id FROM users WHERE email=?")
			.get(bootstrapAdminEmail) as { id: number };
		const legacyId = Number(
			db
				.query("INSERT INTO items (user_id,url,title) VALUES (?,?,?)")
				.run(owner.id, "https://example.com/legacy?utm_medium=x#top", "Old")
				.lastInsertRowid,
		);
		const legacy = await create("https://example.com/legacy");
		expect(legacy.status).toBe(200);
		expect((await legacy.json()).id).toBe(legacyId);
		expect((await create("https://example.com/legacy-two")).status).toBe(201);
	});

	test("serves durable snapshots only to their owner and sanitizes active content and external images", async () => {
		createUser(secondUserEmail);
		const { cleanArticle } = await import("./server/article-store");
		const clean = cleanArticle(
			'<p onclick="alert(1)">Hello<script>alert(1)</script><img src="https://example.com/image.png" onerror="alert(1)"><iframe src="https://tracker.example"></iframe><a href="javascript:alert(1)">link</a></p>',
			"https://example.com/story",
		);
		expect(clean).not.toContain("onclick");
		expect(clean).not.toContain("onerror");
		expect(clean).not.toContain("<script");
		expect(clean).not.toContain("<iframe");
		expect(clean).not.toContain("javascript:");
		expect(clean).toContain("/api/image?url=");
		const item = await apiJson<{ id: number }>(
			"/api/items",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: "https://example.com/snapshot",
					title: "Saved",
				}),
			},
			bootstrapAdminEmail,
		);
		db.query(
			"INSERT INTO article_snapshots (item_id,url,title,byline,excerpt,content) VALUES (?,?,?,?,?,?)",
		).run(
			item.id,
			"https://example.com/snapshot",
			"Saved",
			"Author",
			"Excerpt",
			"<p>Stable content</p>",
		);
		const snapshot = await api(
			`/api/items/${item.id}/content`,
			{},
			bootstrapAdminEmail,
		);
		expect(snapshot.status).toBe(200);
		expect((await snapshot.json()).content).toBe("<p>Stable content</p>");
		expect(
			(await api(`/api/items/${item.id}/content`, {}, secondUserEmail)).status,
		).toBe(404);
	});

	test("exports a complete account archive including uploads without credentials or other users' data", async () => {
		createUser(secondUserEmail);
		const JSZip = (await import("jszip")).default;
		const admin = db
			.query("SELECT id FROM users WHERE email=?")
			.get(bootstrapAdminEmail) as { id: number };
		const other = db
			.query("SELECT id FROM users WHERE email=?")
			.get(secondUserEmail) as { id: number };
		const result = db
			.query(
				"INSERT INTO items (user_id,url,title,notes,type) VALUES (?,?,?,?,?)",
			)
			.run(admin.id, "/uploads/export.pdf", "Exported", "My note", "pdf");
		db.query("INSERT INTO uploaded_files VALUES (?,?,?)").run(
			result.lastInsertRowid,
			"export.pdf",
			"pdf",
		);
		mkdirSync(join(testDataDir, "uploads"), { recursive: true });
		await Bun.write(join(testDataDir, "uploads", "export.pdf"), "pdf-fixture");
		db.query(
			"INSERT INTO highlights (user_id,item_id,selected_text,note) VALUES (?,?,?,?)",
		).run(admin.id, result.lastInsertRowid, "Quote", "Highlight note");
		db.query("INSERT INTO items (user_id,url,title) VALUES (?,?,?)").run(
			other.id,
			"https://example.com/private",
			"Another user's private title",
		);
		const response = await api("/api/export", {}, bootstrapAdminEmail);
		expect(response.status).toBe(200);
		const zip = await JSZip.loadAsync(await response.arrayBuffer());
		const raw = await zip.file("library.json")?.async("string");
		const library = JSON.parse(raw || "{}");
		expect(library.items).toHaveLength(1);
		expect(library.highlights).toHaveLength(1);
		expect(raw).not.toContain("Another user's private title");
		expect(raw).not.toContain("auth_sessions");
		expect(await zip.file("uploads/export.pdf")?.async("string")).toBe(
			"pdf-fixture",
		);
		const markdown = await api(
			"/api/export?format=highlights",
			{},
			bootstrapAdminEmail,
		).then((r) => r.text());
		expect(markdown).toContain("> Quote");
		expect(markdown).toContain("My note");
	});

	test("preserves an unauthenticated share privately through sign-in and consumes it once", async () => {
		Bun.env.AUTH_MODE = "app";
		const { hash, secret } = await import("./server/sessions");
		const form = new FormData();
		form.set("url", "https://example.com/shared");
		form.set("title", "Shared title");
		const shared = await app.fetch(
			new Request("http://localhost/share-target", {
				method: "POST",
				body: form,
			}),
		);
		expect(shared.status).toBe(303);
		expect(shared.headers.get("location")).toBe("/?share=auth-required");
		const shareCookie = shared.headers
			.getSetCookie()
			.find((c) => c.startsWith("reading_share="))
			?.split(";")[0];
		expect(shareCookie).toBeDefined();
		expect((await api("/api/pending-share")).status).toBe(401);
		const user = db
			.query("SELECT id FROM users WHERE email=?")
			.get(bootstrapAdminEmail) as { id: number };
		const token = secret();
		const now = Date.now();
		db.query("INSERT INTO auth_sessions VALUES (?,?,?,?,?,?)").run(
			hash(token),
			user.id,
			"Test",
			now,
			now,
			now + 60000,
		);
		const consume = () =>
			app.fetch(
				new Request("http://localhost/api/pending-share", {
					headers: { Cookie: `${shareCookie}; reading_session=${token}` },
				}),
			);
		const restored = await consume();
		expect(await restored.json()).toEqual({
			pending: true,
			url: "https://example.com/shared",
			title: "Shared title",
		});
		expect(await (await consume()).json()).toEqual({ pending: false });
	});

	test("recovers a failed draft, keeps tags editable and isolates it from other accounts", async () => {
		createUser(secondUserEmail);
		const { IDBFactory } = await import("fake-indexeddb");
		const storage = new IDBFactory();
		const browsers: ReturnType<typeof createBrowser>[] = [];
		let rejectSaves = true;
		async function open(email: string) {
			const fixture = createBrowser({ indexedDB: storage });
			browsers.push(fixture);
			fixture.w.fetch = async (path: string, init: RequestInit = {}) => {
				if (path.startsWith("/api/fetch-meta"))
					return Response.json({ title: "Draft", type: "article" });
				if (path === "/api/items" && init.method === "POST" && rejectSaves)
					throw new TypeError("Offline");
				return api(path, init, email);
			};
			fixture.w.eval(await appCode);
			return fixture;
		}
		const first = await open(bootstrapAdminEmail);
		try {
			await until(() =>
				first.el("items-list").textContent.includes("Your reading space"),
			);
			first.click("add-menu-button");
			first.w.document
				.querySelector<HTMLButtonElement>('[data-add-type="link"]')
				.click();
			first.input("url", "https://example.com/unfinished");
			first.input("title", "Unfinished reading");
			first.input("tag-input", "original");
			first.el("tag-input").dispatchEvent(
				new first.w.KeyboardEvent("keydown", {
					key: "Enter",
					bubbles: true,
					cancelable: true,
				}),
			);
			first.submit("add-item-form");
			await until(() =>
				first.el("toast-container").textContent.includes("Offline"),
			);
			const other = await open(secondUserEmail);
			await until(() =>
				other.el("items-list").textContent.includes("Your reading space"),
			);
			expect(other.el("add-modal").style.display).toBe("none");
			rejectSaves = false;
			const restored = await open(bootstrapAdminEmail);
			await until(() => restored.el("add-modal").style.display === "flex");
			expect(restored.el<HTMLInputElement>("title").value).toBe(
				"Unfinished reading",
			);
			restored.input("tag-input", "after-recovery");
			restored.el("tag-input").dispatchEvent(
				new restored.w.KeyboardEvent("keydown", {
					key: "Enter",
					bubbles: true,
					cancelable: true,
				}),
			);
			restored.submit("add-item-form");
			await until(() =>
				restored.el("toast-container").textContent.includes("Saved to"),
			);
			const items = await apiJson<ItemResponse[]>(
				"/api/items",
				{},
				bootstrapAdminEmail,
			);
			expect(items).toHaveLength(1);
			expect(items[0].tags).toEqual(["after-recovery", "original"]);
			await until(
				() =>
					restored.el("tag-options").textContent.includes("after-recovery") &&
					!!restored.el("items-list").querySelector(".item-title"),
			);
			for (const fixture of browsers) expect(fixture.errors).toEqual([]);
		} finally {
			for (const { w } of browsers) w.close();
		}
	});
});
