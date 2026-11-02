import { createHash, randomBytes } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "../db";
import type { AppContext, CurrentUser } from "./types";

export const secret = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const duration = 30 * 24 * 60 * 60 * 1000;
export const inviteTtl = 24 * 60 * 60 * 1000;
export const sessionCookie = "reading_session";
export function cookieOptions(c: AppContext) {
	return {
		httpOnly: true,
		secure: new URL(Bun.env.APP_PUBLIC_URL || c.req.url).protocol === "https:",
		sameSite: "Strict" as const,
		path: "/",
	};
}
export function sessionId(c: AppContext) {
	const bearer = c.req
		.header("authorization")
		?.match(/^Bearer ([\w-]+)$/i)?.[1];
	const token = bearer || getCookie(c, sessionCookie);
	return token ? hash(token) : "";
}
export function sessionUser(c: AppContext): CurrentUser | null {
	const id = sessionId(c);
	if (!id) return null;
	const user = db
		.query(
			`SELECT u.* FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires_at>?`,
		)
		.get(id, Date.now()) as CurrentUser | null;
	if (user)
		db.query("UPDATE auth_sessions SET last_seen_at=? WHERE id=?").run(
			Date.now(),
			id,
		);
	return user;
}
export function isRecentSession(c: AppContext) {
	return !!db
		.query(
			"SELECT id FROM auth_sessions WHERE id=? AND created_at>? AND expires_at>?",
		)
		.get(sessionId(c), Date.now() - 600000, Date.now());
}
export function createSession(c: AppContext, userId: number) {
	const token = secret();
	const now = Date.now();
	db.query("DELETE FROM auth_sessions WHERE expires_at<=?").run(now);
	db.query("INSERT INTO auth_sessions VALUES (?, ?, ?, ?, ?, ?)").run(
		hash(token),
		userId,
		(c.req.header("user-agent") || "Device").slice(0, 160),
		now,
		now,
		now + duration,
	);
	setCookie(c, sessionCookie, token, {
		...cookieOptions(c),
		maxAge: duration / 1000,
	});
	return token;
}
export function endSession(c: AppContext) {
	db.query("DELETE FROM auth_sessions WHERE id=?").run(sessionId(c));
	deleteCookie(c, sessionCookie, { path: "/" });
}
export function createInvite(userId: number, createdBy: number | null = null) {
	const token = secret();
	db.query(
		"INSERT INTO auth_invites (token_hash,user_id,expires_at,created_at,created_by) VALUES (?, ?, ?, ?, ?)",
	).run(hash(token), userId, Date.now() + inviteTtl, Date.now(), createdBy);
	return token;
}
export function rotateRecoveryCodes(userId: number) {
	const codes = Array.from(
		{ length: 8 },
		() => randomBytes(16).toString("hex").match(/.{4}/g)?.join("-") || secret(),
	);
	db.transaction(() => {
		db.query("DELETE FROM auth_recovery_codes WHERE user_id=?").run(userId);
		for (const code of codes)
			db.query("INSERT INTO auth_recovery_codes VALUES (?, ?)").run(
				hash(code.replaceAll("-", "")),
				userId,
			);
	})();
	return codes;
}
