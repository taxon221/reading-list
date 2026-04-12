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

function getConfiguredAuthMode() {
	const value = (Bun.env.AUTH_MODE || "").trim().toLowerCase();
	if (value === "local" || value === "cloudflare") return value;
	return "";
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

	return {
		authMode: getConfiguredAuthMode(),
		publicAppUrl,
		loginUrl: authRouteBase,
		logoutUrl: authRouteBase ? `${authRouteBase}/auth/logout` : "",
		switchAccountUrl: authRouteBase ? `${authRouteBase}/auth/switch` : "",
		currentUser: user
			? {
					email: user.email,
					displayName: user.display_name,
					isAdmin: Boolean(user.is_admin),
				}
			: null,
	};
}

function getLocalDevIdentity(c: AppContext) {
	if (getConfiguredAuthMode() !== "local") return null;

	const localDevAuthEmail = getLocalDevAuthEmail();
	if (!localDevAuthEmail) return null;

	const hostname = new URL(c.req.url).hostname.toLowerCase();
	if (!isLoopbackHostname(hostname)) return null;

	return {
		email: localDevAuthEmail,
		displayName: defaultDisplayName(localDevAuthEmail),
	};
}

export async function resolveRequestUser(c: AppContext) {
	let identity = getLocalDevIdentity(c);

	if (!identity && getConfiguredAuthMode() === "cloudflare") {
		identity = await verifyAccessToken(
			c.req.header("cf-access-jwt-assertion"),
		).catch(() => null);
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
