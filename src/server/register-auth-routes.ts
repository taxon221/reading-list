import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticatorTransport,
} from "@simplewebauthn/server";
import type { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "../db";
import {
	resolveRequestUser,
	getConfiguredAuthMode,
	getLocalSetupUser,
} from "./auth";
import {
	cookieOptions,
	createInvite,
	createSession,
	endSession,
	hash,
	inviteTtl,
	isRecentSession,
	rotateRecoveryCodes,
	secret,
	sessionId,
} from "./sessions";
import { allowRequest, clientAddress } from "./rate-limit";
import type { AppBindings, AppContext, CurrentUser } from "./types";

type Challenge = {
	kind: "register" | "login";
	challenge: string;
	userId?: number;
	invite?: string;
	localSetup?: boolean;
};
type Passkey = {
	id: string;
	user_id: number;
	public_key: Uint8Array;
	counter: number;
	transports: string;
	name: string;
};
function reject(
	c: AppContext,
	error: string,
	status: 400 | 401 | 403 | 409 | 410 | 415 | 429 = 400,
) {
	return c.json({ error }, status);
}
function origin(c: AppContext) {
	const url = new URL(Bun.env.APP_PUBLIC_URL || c.req.url);
	if (
		url.protocol !== "https:" &&
		!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
	)
		throw new Error("APP_PUBLIC_URL must use HTTPS.");
	return url.origin;
}
function challenge(c: AppContext, payload: Challenge) {
	const token = secret();
	db.query("DELETE FROM auth_challenges WHERE expires_at<=?").run(Date.now());
	db.query("INSERT INTO auth_challenges VALUES (?, ?, ?)").run(
		hash(token),
		JSON.stringify(payload),
		Date.now() + 300000,
	);
	setCookie(c, "reading_challenge", token, {
		...cookieOptions(c),
		maxAge: 300,
	});
}
function consumeChallenge(c: AppContext, kind: Challenge["kind"]) {
	const id = hash(getCookie(c, "reading_challenge") || "");
	deleteCookie(c, "reading_challenge", { path: "/" });
	const row = db
		.query(
			"DELETE FROM auth_challenges WHERE id=? AND expires_at>? RETURNING payload",
		)
		.get(id, Date.now()) as { payload: string } | null;
	const payload = row ? (JSON.parse(row.payload) as Challenge) : null;
	if (!payload || payload.kind !== kind)
		throw new Error("Sign-in expired. Please try again.");
	return payload;
}
function invitedUser(token: unknown) {
	if (typeof token !== "string" || token.length > 128) return null;
	return db
		.query(
			"SELECT u.* FROM users u JOIN auth_invites i ON i.user_id=u.id WHERE i.token_hash=? AND i.expires_at>? AND i.accepted_at IS NULL AND i.revoked_at IS NULL",
		)
		.get(hash(token), Date.now()) as CurrentUser | null;
}
export function registerAuthRoutes(app: Hono<AppBindings>) {
	app.use("/api/auth/*", async (c, next) => {
		if (c.req.method === "GET") return next();
		if (getConfiguredAuthMode() !== "app")
			return reject(c, "Use your configured sign-in method.");
		const suppliedOrigin = c.req.header("origin");
		if (suppliedOrigin && suppliedOrigin !== origin(c))
			return reject(c, "Invalid origin", 403);
		if (!c.req.header("content-type")?.startsWith("application/json"))
			return reject(c, "JSON is required", 415);
		if (!allowRequest(`auth:${clientAddress(c)}:${c.req.path}`, 30, 600000))
			return reject(
				c,
				"Too many attempts. Please try again in ten minutes.",
				429,
			);
		// Handler errors are turned into a generic 400 by app.onError.
		await next();
	});
	app.post("/api/auth/invite/details", async (c) => {
		const body = await c.req.json();
		const user = invitedUser(body.invite);
		if (!user)
			return reject(
				c,
				"This invitation has expired, was revoked, or has already been used. Ask the owner for a new link, or sign in if you've already joined.",
				410,
			);
		const invite = db
			.query(
				"SELECT expires_at,created_by FROM auth_invites WHERE token_hash=?",
			)
			.get(hash(body.invite)) as {
			expires_at: number;
			created_by: number | null;
		};
		return c.json({
			email: user.email,
			expiresAt: invite.expires_at,
			kind: invite.created_by === null ? "setup" : "reader",
		});
	});
	app.post("/api/auth/register/options", async (c) => {
		const body = await c.req.json();
		const existing = await resolveRequestUser(c);
		const invited = invitedUser(body.invite);
		if (typeof body.invite === "string" && !invited)
			return reject(
				c,
				"This invitation has expired, was revoked, or has already been used. Ask for a new link, or sign in if you've already joined.",
				401,
			);
		const localSetup =
			!existing.user &&
			body.localSetup === true &&
			c.req.header("origin") === origin(c)
				? getLocalSetupUser(c)
				: null;
		const user =
			invited || (isRecentSession(c) ? existing.user : null) || localSetup;
		if (!user)
			return c.json(
				{
					error:
						typeof body.invite === "string"
							? "This invitation has expired or was already used. Ask for a new link, or sign in if you already have a passkey."
							: body.localSetup
								? "Account setup is no longer available. Sign in to continue."
								: "Sign in again to add another passkey.",
				},
				401,
			);
		const keys = db
			.query("SELECT id, transports FROM auth_passkeys WHERE user_id=?")
			.all(user.id) as Passkey[];
		const options = await generateRegistrationOptions({
			rpName: "Reading List",
			rpID: new URL(origin(c)).hostname,
			userID: new TextEncoder().encode(String(user.id)),
			userName: user.email,
			attestationType: "none",
			excludeCredentials: keys.map((k) => ({
				id: k.id,
				transports: JSON.parse(k.transports),
			})),
			authenticatorSelection: {
				residentKey: "required",
				userVerification: "required",
			},
		});
		challenge(c, {
			kind: "register",
			challenge: options.challenge,
			userId: user.id,
			invite: invited ? hash(body.invite) : undefined,
			localSetup: !invited && !existing.user && Boolean(localSetup),
		});
		return c.json(options);
	});
	app.post("/api/auth/register/verify", async (c) => {
		const saved = consumeChallenge(c, "register");
		const body = await c.req.json();
		if (
			!saved.invite &&
			!saved.localSetup &&
			(!isRecentSession(c) ||
				(await resolveRequestUser(c)).user?.id !== saved.userId)
		)
			return reject(c, "Sign in again.", 401);
		if (saved.localSetup && getLocalSetupUser(c)?.id !== saved.userId)
			return reject(c, "Setup is already complete. Please sign in.", 401);
		const verified = await verifyRegistrationResponse({
			response: body.response,
			expectedChallenge: saved.challenge,
			expectedOrigin: origin(c),
			expectedRPID: new URL(origin(c)).hostname,
			requireUserVerification: true,
		});
		if (!verified.verified || !verified.registrationInfo || !saved.userId)
			return reject(c, "Passkey could not be verified.");
		const info = verified.registrationInfo.credential;
		const userId = saved.userId;
		const first = !db
			.query("SELECT id FROM auth_passkeys WHERE user_id=?")
			.get(userId);
		db.transaction(() => {
			if (saved.localSetup) {
				if (getLocalSetupUser(c)?.id !== userId)
					throw new Error("Setup is already complete");
				db.query("DELETE FROM auth_invites WHERE user_id=?").run(userId);
			}
			if (
				saved.invite &&
				!db
					.query(
						"UPDATE auth_invites SET accepted_at=? WHERE token_hash=? AND user_id=? AND expires_at>? AND accepted_at IS NULL AND revoked_at IS NULL RETURNING user_id",
					)
					.get(Date.now(), saved.invite, userId, Date.now())
			)
				throw new Error("Invitation expired");
			if (saved.invite)
				db.query(
					"UPDATE auth_invites SET revoked_at=? WHERE user_id=? AND token_hash<>? AND accepted_at IS NULL AND revoked_at IS NULL",
				).run(Date.now(), userId, saved.invite);
			db.query("INSERT INTO auth_passkeys VALUES (?, ?, ?, ?, ?, ?, ?)").run(
				info.id,
				userId,
				info.publicKey,
				info.counter,
				JSON.stringify(info.transports || []),
				String(body.name || "Passkey").slice(0, 80),
				Date.now(),
			);
		})();
		endSession(c);
		createSession(c, userId);
		return c.json({
			ok: true,
			recoveryCodes: first ? rotateRecoveryCodes(userId) : undefined,
		});
	});
	app.post("/api/auth/login/options", async (c) => {
		const options = await generateAuthenticationOptions({
			rpID: new URL(origin(c)).hostname,
			userVerification: "required",
		});
		challenge(c, { kind: "login", challenge: options.challenge });
		return c.json(options);
	});
	app.post("/api/auth/login/verify", async (c) => {
		const saved = consumeChallenge(c, "login");
		const body = await c.req.json();
		const key = db
			.query("SELECT * FROM auth_passkeys WHERE id=?")
			.get(body.response?.id || "") as Passkey | null;
		if (!key) return reject(c, "Passkey not recognized.", 401);
		if (
			body.response.response?.userHandle &&
			body.response.response.userHandle !==
				Buffer.from(String(key.user_id)).toString("base64url")
		)
			return reject(c, "Passkey could not be verified.", 401);
		const result = await verifyAuthenticationResponse({
			response: body.response,
			expectedChallenge: saved.challenge,
			expectedOrigin: origin(c),
			expectedRPID: new URL(origin(c)).hostname,
			credential: {
				id: key.id,
				publicKey: new Uint8Array(key.public_key),
				counter: key.counter,
				transports: JSON.parse(key.transports) as AuthenticatorTransport[],
			},
			requireUserVerification: true,
		});
		if (!result.verified) return reject(c, "Sign-in failed.", 401);
		db.query("UPDATE auth_passkeys SET counter=? WHERE id=?").run(
			result.authenticationInfo.newCounter,
			key.id,
		);
		endSession(c);
		createSession(c, key.user_id);
		return c.json({ ok: true });
	});
	app.post("/api/auth/recover", async (c) => {
		const body = await c.req.json();
		const code =
			typeof body.code === "string"
				? body.code.trim().toLowerCase().replaceAll("-", "")
				: "";
		const email =
			typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
		const user = db.transaction(() => {
			const row = db
				.query(
					"SELECT u.* FROM users u JOIN auth_recovery_codes r ON u.id=r.user_id WHERE r.code_hash=? AND u.email=?",
				)
				.get(hash(code), email) as CurrentUser | null;
			if (!row) return null;
			db.query("DELETE FROM auth_recovery_codes WHERE code_hash=?").run(
				hash(code),
			);
			db.query("DELETE FROM auth_sessions WHERE user_id=?").run(row.id);
			return row;
		})();
		if (!user) return reject(c, "Email or recovery code is incorrect.", 401);
		createSession(c, user.id);
		return c.json({ ok: true });
	});
	app.post("/api/auth/logout", (c) => {
		endSession(c);
		return c.json({ ok: true });
	});
	app.use("/api/auth/manage/*", async (c, next) => {
		const { user } = await resolveRequestUser(c);
		if (!user) return reject(c, "Sign in again.", 401);
		const action = c.req.path.split("/").at(-1);
		const ownerOnly = ["invites", "invite", "revoke-invite"].includes(action);
		if (ownerOnly && !user.is_admin)
			return reject(c, "Only the owner can manage invitations.", 403);
		if (
			["remove-passkey", "recovery", "invite", "revoke-invite"].includes(
				action,
			) &&
			!isRecentSession(c)
		)
			return c.json(
				{
					error: "Confirm your sign-in to change security settings.",
					reauthRequired: true,
				},
				403,
			);
		c.set("currentUser", user);
		await next();
	});
	app.get("/api/auth/manage/devices", (c) => {
		const user = c.get("currentUser");
		const devices = db
			.query(
				"SELECT id,name,created_at,last_seen_at,expires_at FROM auth_sessions WHERE user_id=? AND expires_at>? ORDER BY last_seen_at DESC",
			)
			.all(user.id, Date.now()) as { id: string }[];
		const passkeys = db
			.query("SELECT id,name,created_at FROM auth_passkeys WHERE user_id=?")
			.all(user.id);
		return c.json({
			devices: devices.map((d) => ({ ...d, current: d.id === sessionId(c) })),
			passkeys,
		});
	});
	app.post("/api/auth/manage/revoke", async (c) => {
		const body = await c.req.json();
		db.query("DELETE FROM auth_sessions WHERE id=? AND user_id=?").run(
			String(body.id || ""),
			c.get("currentUser").id,
		);
		return c.json({ ok: true });
	});
	app.post("/api/auth/manage/remove-passkey", async (c) => {
		const user = c.get("currentUser");
		const { id } = await c.req.json();
		const count = db
			.query("SELECT COUNT(*) AS count FROM auth_passkeys WHERE user_id=?")
			.get(user.id) as { count: number };
		if (count.count <= 1)
			return reject(
				c,
				"Add another passkey before removing your last one.",
				409,
			);
		db.query("DELETE FROM auth_passkeys WHERE id=? AND user_id=?").run(
			String(id || ""),
			user.id,
		);
		return c.json({ ok: true });
	});
	app.post("/api/auth/manage/recovery", (c) => {
		return c.json({
			recoveryCodes: rotateRecoveryCodes(c.get("currentUser").id),
		});
	});
	app.get("/api/auth/manage/invites", (c) => {
		const user = c.get("currentUser");
		const invites = db
			.query(`SELECT i.token_hash AS id,u.email,i.created_at AS createdAt,i.expires_at AS expiresAt,
		 i.accepted_at AS acceptedAt,i.revoked_at AS revokedAt,
		 CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted' WHEN i.revoked_at IS NOT NULL THEN 'revoked'
		 WHEN i.expires_at<=? THEN 'expired' ELSE 'pending' END AS status
		 FROM auth_invites i JOIN users u ON u.id=i.user_id WHERE i.created_by=? ORDER BY i.created_at DESC,i.rowid DESC`)
			.all(Date.now(), user.id);
		return c.json({ invitations: invites });
	});
	app.post("/api/auth/manage/revoke-invite", async (c) => {
		const user = c.get("currentUser");
		const body = await c.req.json();
		const revoked = db
			.query(
				"UPDATE auth_invites SET revoked_at=? WHERE token_hash=? AND created_by=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? RETURNING token_hash",
			)
			.get(Date.now(), String(body.id || ""), user.id, Date.now());
		return revoked
			? c.json({ ok: true })
			: reject(c, "This invitation is no longer pending.", 409);
	});
	app.post("/api/auth/manage/invite", async (c) => {
		const user = c.get("currentUser");
		const body = await c.req.json();
		const email = String(body.email || "")
			.trim()
			.toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
			return reject(c, "Enter a valid email.");
		const existing = db
			.query("SELECT id,is_admin FROM users WHERE email=?")
			.get(email) as { id: number; is_admin: number } | null;
		if (
			existing &&
			(existing.is_admin ||
				!db
					.query(
						"SELECT token_hash FROM auth_invites WHERE user_id=? AND created_by=?",
					)
					.get(existing.id, user.id) ||
				db
					.query(
						"SELECT id FROM auth_passkeys WHERE user_id=? UNION ALL SELECT code_hash FROM auth_recovery_codes WHERE user_id=? UNION ALL SELECT id FROM auth_sessions WHERE user_id=?",
					)
					.get(existing.id, existing.id, existing.id))
		)
			return reject(
				c,
				"This reader already has an account. They can sign in with their passkey or a recovery code.",
				409,
			);
		const token = db.transaction(() => {
			const id =
				existing?.id ||
				Number(
					db
						.query("INSERT INTO users (email,display_name) VALUES (?,?)")
						.run(email, email.split("@")[0] || email).lastInsertRowid,
				);
			db.query(
				"UPDATE auth_invites SET revoked_at=? WHERE user_id=? AND accepted_at IS NULL AND revoked_at IS NULL",
			).run(Date.now(), id);
			return createInvite(id, user.id);
		})();
		return c.json({
			url: `${origin(c)}/#invite=${token}`,
			expiresAt: Date.now() + inviteTtl,
		});
	});
}
