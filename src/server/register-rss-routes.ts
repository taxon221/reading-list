import type { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "./auth";
import {
	importRssSubscription,
	initializeRssSubscription,
	type RssSubscriptionRow,
} from "./rss-import";
import type { AppBindings } from "./types";

function normalizeFeedUrl(value: unknown): string {
	const feedUrl = String(value || "").trim();
	if (!feedUrl) return "";
	try {
		const url = new URL(feedUrl);
		if (!["http:", "https:"].includes(url.protocol)) return "";
		return url.toString();
	} catch {
		return "";
	}
}

function getOwnedSubscription(id: string | number, userId: number) {
	return (
		(db
			.query("SELECT * FROM rss_subscriptions WHERE id = ? AND user_id = ?")
			.get(id, userId) as RssSubscriptionRow | undefined) || null
	);
}

function listSubscriptions(userId: number) {
	return db
		.query(
			`SELECT
				id,
				title,
				feed_url,
				site_url,
				last_checked_at,
				created_at
			FROM rss_subscriptions
			WHERE user_id = ?
			ORDER BY title COLLATE NOCASE, feed_url`,
		)
		.all(userId);
}

export function registerRssRoutes(app: Hono<AppBindings>) {
	app.get("/api/rss-subscriptions", (c) => {
		const currentUser = getCurrentUser(c);
		return c.json(listSubscriptions(currentUser.id));
	});

	app.post("/api/rss-subscriptions", async (c) => {
		const currentUser = getCurrentUser(c);
		const body = await c.req.json().catch(() => ({}));
		const feedUrl = normalizeFeedUrl(body?.feed_url);
		if (!feedUrl) return c.json({ error: "Valid feed_url is required" }, 400);

		const existing = db
			.query("SELECT * FROM rss_subscriptions WHERE user_id = ? AND feed_url = ?")
			.get(currentUser.id, feedUrl) as RssSubscriptionRow | undefined;
		if (existing) {
			return c.json({
				id: existing.id,
				followed: true,
				seen: 0,
				subscriptions: listSubscriptions(currentUser.id),
			});
		}

		db.query(
			`INSERT INTO rss_subscriptions (user_id, title, feed_url, site_url)
			 VALUES (?, '', ?, '')`,
		).run(currentUser.id, feedUrl);

		const subscription = db
			.query(
				"SELECT * FROM rss_subscriptions WHERE user_id = ? AND feed_url = ?",
			)
			.get(currentUser.id, feedUrl) as RssSubscriptionRow;
		let initResult: Awaited<ReturnType<typeof initializeRssSubscription>>;
		try {
			initResult = await initializeRssSubscription(subscription);
		} catch (error) {
			db.query("DELETE FROM rss_subscriptions WHERE id = ? AND user_id = ?").run(
				subscription.id,
				currentUser.id,
			);
			return c.json(
				{ error: error instanceof Error ? error.message : "RSS feed could not be loaded" },
				400,
			);
		}

		return c.json({
			id: subscription.id,
			followed: true,
			...initResult,
			subscriptions: listSubscriptions(currentUser.id),
		});
	});

	app.post("/api/rss-subscriptions/:id/import", async (c) => {
		const currentUser = getCurrentUser(c);
		const subscription = getOwnedSubscription(c.req.param("id"), currentUser.id);
		if (!subscription) return c.json({ error: "Subscription not found" }, 404);

		return c.json(await importRssSubscription(subscription));
	});

	app.post("/api/rss-subscriptions/import", async (c) => {
		const currentUser = getCurrentUser(c);
		const subscriptions = db
			.query("SELECT * FROM rss_subscriptions WHERE user_id = ? ORDER BY id")
			.all(currentUser.id) as RssSubscriptionRow[];
		const results = [];
		for (const subscription of subscriptions) {
			try {
				results.push({
					subscription_id: subscription.id,
					ok: true,
					...(await importRssSubscription(subscription)),
				});
			} catch (error) {
				results.push({
					subscription_id: subscription.id,
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return c.json({ results });
	});

	app.delete("/api/rss-subscriptions/:id", (c) => {
		const currentUser = getCurrentUser(c);
		const subscription = getOwnedSubscription(c.req.param("id"), currentUser.id);
		if (!subscription) return c.json({ error: "Subscription not found" }, 404);
		db.query("DELETE FROM rss_subscriptions WHERE id = ? AND user_id = ?").run(
			subscription.id,
			currentUser.id,
		);
		return c.json({ success: true });
	});
}
