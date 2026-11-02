import { getConnInfo } from "hono/bun";
import type { AppContext } from "./types";

// Behind a reverse proxy or tunnel every request arrives from the proxy, so the
// real client address only comes from its headers. Only trust those headers
// when TRUST_PROXY=true; otherwise anyone could spoof them to dodge limits.
export function clientAddress(c: AppContext) {
	if (Bun.env.TRUST_PROXY === "true") {
		const forwarded =
			c.req.header("cf-connecting-ip") ||
			c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
		if (forwarded) return forwarded;
	}
	try {
		return getConnInfo(c).remote.address || "unknown";
	} catch {
		return "unknown";
	}
}

const buckets = new Map<string, { count: number; until: number }>();
const maxBuckets = 10_000;

/** Returns false once `key` has been used more than `limit` times in `windowMs`. */
export function allowRequest(key: string, limit: number, windowMs: number) {
	const now = Date.now();
	let bucket = buckets.get(key);
	if (!bucket || bucket.until <= now) {
		if (buckets.size >= maxBuckets) {
			for (const [entry, value] of buckets)
				if (value.until <= now) buckets.delete(entry);
			// Still full: drop the oldest entry rather than locking everyone out.
			if (buckets.size >= maxBuckets)
				buckets.delete(buckets.keys().next().value as string);
		}
		bucket = { count: 0, until: now + windowMs };
		buckets.set(key, bucket);
	}
	return ++bucket.count <= limit;
}
