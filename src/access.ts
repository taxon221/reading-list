import { createRemoteJWKSet, jwtVerify } from "jose";

export type AccessIdentity = {
	email: string;
	displayName: string;
};

type AccessConfig = {
	audience: string;
	certsUrl: URL;
	issuer: string;
};

function normalizeEmail(value: string | undefined | null): string {
	return (value || "").trim().toLowerCase();
}

function normalizeIssuer(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, "");
	if (!trimmed) return "";
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

function defaultDisplayName(email: string): string {
	const localPart = email.split("@")[0]?.trim();
	return localPart || email;
}

function getAccessConfig(): AccessConfig | null {
	const issuer = normalizeIssuer(Bun.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN || "");
	const audience = (Bun.env.CLOUDFLARE_ACCESS_AUD || "").trim();

	if (!issuer || !audience) return null;

	const certsUrl = new URL(
		Bun.env.CLOUDFLARE_ACCESS_JWKS_URL || `${issuer}/cdn-cgi/access/certs`,
	);

	return { audience, certsUrl, issuer };
}

export async function verifyAccessToken(
	token: string | undefined | null,
): Promise<AccessIdentity | null> {
	if (!token) return null;
	const accessConfig = getAccessConfig();
	if (!accessConfig) return null;

	const cloudflareJwks = createRemoteJWKSet(accessConfig.certsUrl);

	const { payload } = await jwtVerify(token, cloudflareJwks, {
		issuer: accessConfig.issuer,
		audience: accessConfig.audience,
	});

	const email = normalizeEmail(
		typeof payload.email === "string" ? payload.email : "",
	);
	if (!email) {
		throw new Error(
			"Validated Cloudflare Access token is missing an email claim.",
		);
	}

	return {
		email,
		displayName:
			typeof payload.name === "string" && payload.name.trim()
				? payload.name.trim()
				: defaultDisplayName(email),
	};
}
