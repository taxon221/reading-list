import { getConnInfo } from "hono/bun";
import { sessionUser } from "./sessions";
import { verifyAccessToken } from "../access";
import { db } from "../db";
import type { AppContext, CurrentUser } from "./types";

const bootstrapAdminEmail = normalizeEmail(Bun.env.BOOTSTRAP_ADMIN_EMAIL);
const publicAppUrl = normalizeUrl(Bun.env.APP_PUBLIC_URL);
const cloudflareAccessTeamDomain = normalizeUrl(
	Bun.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
);

function normalizeEmail(value: string | undefined | null): string {
	return (value || "").trim().toLowerCase();
}

function normalizeUrl(value: string | undefined | null): string {
	return (value || "").trim().replace(/\/+$/, "");
}

function defaultDisplayName(email: string): string {
	const localPart = email.split("@")[0]?.trim();
	return localPart || email;
}

function getLocalDevAuthEmail(): string {
	return normalizeEmail(Bun.env.LOCAL_DEV_AUTH_EMAIL);
}

export function getConfiguredAuthMode() {
	const value = (Bun.env.AUTH_MODE || "").trim().toLowerCase();
	if (value === "app" || value === "local" || value === "cloudflare")
		return value;
	return "app";
}

export function getCurrentUser(c: AppContext): CurrentUser {
	return c.get("currentUser");
}

function isLoopbackHostname(hostname: string): boolean {
	return (
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
	);
}

function getForwardedPublicOrigin(c: AppContext): string {
	const rawProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
	const rawHost = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
	if (!rawProto || !rawHost) return "";

	const proto = rawProto.toLowerCase();
	if (proto !== "http" && proto !== "https") return "";

	const host = rawHost.toLowerCase();
	if (!host || host.includes("/") || host.includes(" ")) return "";

	return `${proto}://${host}`;
}

function getAuthRouteBase(c: AppContext): string {
	if (publicAppUrl) return publicAppUrl;

	const requestUrl = new URL(c.req.url);
	if (isLoopbackHostname(requestUrl.hostname)) {
		const forwarded = getForwardedPublicOrigin(c);
		if (forwarded) return forwarded;
		return "";
	}

	return requestUrl.origin;
}

export function getAppLogoutTarget(c: AppContext): string {
	const authRouteBase = getAuthRouteBase(c);
	return authRouteBase ? `${authRouteBase}/cdn-cgi/access/logout` : "";
}

export function getSwitchAccountTarget(c: AppContext): string {
	if (getConfiguredAuthMode() === "cloudflare" && cloudflareAccessTeamDomain) {
		return `${cloudflareAccessTeamDomain}/cdn-cgi/access/logout`;
	}

	return getAppLogoutTarget(c);
}

export async function getAuthUiUrls(c: AppContext) {
	const authRouteBase = getAuthRouteBase(c);
	const { user } = await resolveRequestUser(c);
	const appAuth = getConfiguredAuthMode() === "app";

	return {
		authMode: getConfiguredAuthMode(),
		setupAvailable: appAuth && !user && Boolean(getLocalSetupUser(c)),
		publicAppUrl,
		loginUrl: appAuth ? "/#signin" : authRouteBase,
		logoutUrl: appAuth
			? "/api/auth/logout"
			: authRouteBase
				? `${authRouteBase}/auth/logout`
				: "",
		switchAccountUrl: appAuth
			? ""
			: authRouteBase
				? `${authRouteBase}/auth/switch`
				: "",
		currentUser: user
			? {
					email: user.email,
					displayName: user.display_name,
					isAdmin: Boolean(user.is_admin),
				}
			: null,
	};
}

// First-run setup is only available to a browser talking directly to a server
// explicitly bound to loopback. Hosted installations still require invitations.
export function getLocalSetupUser(c: AppContext): CurrentUser | null {
	if (
		getConfiguredAuthMode() !== "app" ||
		!["127.0.0.1", "::1"].includes(Bun.env.APP_HOST || "") ||
		!bootstrapAdminEmail ||
		!Bun.env.APP_PUBLIC_URL ||
		c.req.header("forwarded") ||
		c.req.header("x-forwarded-for") ||
		c.req.header("x-forwarded-host") ||
		c.req.header("x-forwarded-proto")
	)
		return null;
	const configured = new URL(Bun.env.APP_PUBLIC_URL);
	const requested = new URL(c.req.url);
	if (
		!isLoopbackHostname(configured.hostname) ||
		requested.origin !== configured.origin
	)
		return null;
	try {
		if (
			!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
				getConnInfo(c).remote.address || "",
			)
		)
			return null;
	} catch {
		return null;
	}
	return db
		.query(
			`SELECT u.* FROM users u WHERE u.email=? AND u.is_admin=1
			 AND NOT EXISTS (SELECT 1 FROM auth_passkeys WHERE user_id=u.id)
			 AND NOT EXISTS (SELECT 1 FROM auth_recovery_codes WHERE user_id=u.id)`,
		)
		.get(bootstrapAdminEmail) as CurrentUser | null;
}

function getLocalDevIdentity(c: AppContext) {
	if (getConfiguredAuthMode() !== "local") return null;

	const localDevAuthEmail = getLocalDevAuthEmail();
	if (!localDevAuthEmail) return null;

	let address = "";
	try {
		address = getConnInfo(c).remote.address || "";
	} catch {
		return null;
	}
	if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) return null;
	const hostname = new URL(c.req.url).hostname.toLowerCase();
	if (!isLoopbackHostname(hostname)) return null;

	return {
		email: localDevAuthEmail,
		displayName: defaultDisplayName(localDevAuthEmail),
	};
}

function readCookieValue(
	cookieHeader: string | undefined,
	name: string,
): string {
	if (!cookieHeader) return "";

	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		if (!trimmed.startsWith(`${name}=`)) continue;
		try {
			return decodeURIComponent(trimmed.slice(name.length + 1));
		} catch {
			return trimmed.slice(name.length + 1);
		}
	}

	return "";
}

function getAccessJwtFromRequest(c: AppContext): string {
	const headerToken = (c.req.header("cf-access-jwt-assertion") || "").trim();
	if (headerToken) return headerToken;

	return readCookieValue(c.req.header("cookie"), "CF_Authorization").trim();
}

export async function resolveRequestUser(c: AppContext) {
	if (getConfiguredAuthMode() === "app") {
		const user = sessionUser(c);
		return { status: user ? 200 : 401, user };
	}
	let identity = getLocalDevIdentity(c);

	if (!identity && getConfiguredAuthMode() === "cloudflare") {
		identity = await verifyAccessToken(getAccessJwtFromRequest(c)).catch(
			() => null,
		);
	}

	if (!identity?.email) {
		return { status: 401, user: null };
	}

	return {
		status: 200,
		user:
			findUserByEmail(identity.email) ||
			ensureUser(identity.email, identity.displayName),
	};
}

function findUserByEmail(email: string): CurrentUser | null {
	return (
		(db.query("SELECT * FROM users WHERE email = ?").get(email) as
			| CurrentUser
			| undefined) || null
	);
}

function ensureUser(email: string, displayName: string): CurrentUser | null {
	if (!email) return null;

	const isAdmin = email === bootstrapAdminEmail ? 1 : 0;

	db.query(
		`
      INSERT INTO users (email, display_name, is_admin)
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        display_name = COALESCE(NULLIF(excluded.display_name, ''), users.display_name),
        is_admin = CASE
          WHEN excluded.is_admin = 1 THEN 1
          ELSE users.is_admin
        END
    `,
	).run(email, displayName || defaultDisplayName(email), isAdmin);

	return findUserByEmail(email);
}
