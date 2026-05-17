import { db } from "../db";
import { attachTagsToItem } from "./item-store";

export type RssSubscriptionRow = {
	id: number;
	user_id: number;
	title: string;
	feed_url: string;
	site_url: string;
	last_checked_at: string | null;
	created_at: string;
};

type ParsedFeedItem = {
	externalId: string;
	url: string;
	title: string;
	author: string;
	publishedAt: string;
};

type ParsedFeed = {
	title: string;
	siteUrl: string;
	items: ParsedFeedItem[];
};

export type RssImportResult = {
	imported: number;
	skipped: number;
	feedTitle: string;
	siteUrl: string;
};

const DEFAULT_RSS_TAGS = ["Newsletter", "rss"];

function decodeXml(value: string): string {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, "/")
		.trim();
}

function stripTags(value: string): string {
	return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function readTag(xml: string, tagName: string): string {
	const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
	return match ? stripTags(decodeXml(match[1] || "")) : "";
}

function readChannelLink(channelXml: string): string {
	const atomLink = channelXml.match(/<atom:link[^>]+href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*>/i);
	if (atomLink?.[1]) return decodeXml(atomLink[1]);
	return readTag(channelXml, "link");
}

export function parseRssFeed(xml: string): ParsedFeed {
	const channelMatch = xml.match(/<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel>/i);
	const channelXml = channelMatch?.[1] || xml;
	const title = readTag(channelXml, "title");
	const siteUrl = readChannelLink(channelXml);
	const items: ParsedFeedItem[] = [];
	const itemMatches = channelXml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi);

	for (const match of Array.from(itemMatches)) {
		const itemXml = match[1] || "";
		const url = readTag(itemXml, "link");
		const title = readTag(itemXml, "title") || url;
		const guid = readTag(itemXml, "guid");
		const author = readTag(itemXml, "dc:creator") || readTag(itemXml, "author");
		const publishedAt = readTag(itemXml, "pubDate") || readTag(itemXml, "published");
		const externalId = guid || url;
		if (!url || !externalId) continue;
		items.push({ externalId, url, title, author, publishedAt });
	}

	return { title, siteUrl, items };
}

async function fetchFeed(feedUrl: string): Promise<ParsedFeed> {
	const response = await fetch(feedUrl, {
		headers: { "User-Agent": "ReadingListRSS/1.0" },
	});
	if (!response.ok) {
		throw new Error(`Feed returned HTTP ${response.status}`);
	}
	const xml = await response.text();
	return parseRssFeed(xml);
}

function itemExistsForUser(userId: number, url: string): boolean {
	return !!db
		.query("SELECT id FROM items WHERE user_id = ? AND url = ? LIMIT 1")
		.get(userId, url);
}

function seenEntryExists(subscriptionId: number, externalId: string): boolean {
	return !!db
		.query(
			"SELECT external_id FROM rss_subscription_seen WHERE subscription_id = ? AND external_id = ? LIMIT 1",
		)
		.get(subscriptionId, externalId);
}

export async function initializeRssSubscription(
	subscription: RssSubscriptionRow,
): Promise<{ feedTitle: string; siteUrl: string; seen: number }> {
	const feed = await fetchFeed(subscription.feed_url);
	const initSeen = db.transaction(() => {
		const insertSeen = db.query(
			"INSERT OR IGNORE INTO rss_subscription_seen (subscription_id, external_id, published_at) VALUES (?, ?, ?)",
		);
		for (const feedItem of feed.items) {
			insertSeen.run(subscription.id, feedItem.externalId, feedItem.publishedAt);
		}
		db.query(
			"UPDATE rss_subscriptions SET title = COALESCE(NULLIF(title, ''), ?), site_url = COALESCE(NULLIF(site_url, ''), ?), last_checked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
		).run(feed.title, feed.siteUrl, subscription.id, subscription.user_id);
	});
	initSeen();
	return { feedTitle: feed.title, siteUrl: feed.siteUrl, seen: feed.items.length };
}

export async function importRssSubscription(
	subscription: RssSubscriptionRow,
): Promise<RssImportResult> {
	const feed = await fetchFeed(subscription.feed_url);
	let imported = 0;
	let skipped = 0;

	const insertSeen = db.query(
		"INSERT OR IGNORE INTO rss_subscription_seen (subscription_id, external_id, published_at) VALUES (?, ?, ?)",
	);
	const insertItem = db.query(
		"INSERT INTO items (user_id, url, title, author, type) VALUES (?, ?, ?, ?, 'article')",
	);
	const importItem = db.transaction((feedItem: ParsedFeedItem) => {
		insertSeen.run(subscription.id, feedItem.externalId, feedItem.publishedAt);
		if (itemExistsForUser(subscription.user_id, feedItem.url)) return false;

		const result = insertItem.run(
			subscription.user_id,
			feedItem.url,
			feedItem.title,
			feedItem.author,
		);
		attachTagsToItem(result.lastInsertRowid, subscription.user_id, DEFAULT_RSS_TAGS);
		return true;
	});

	for (const feedItem of feed.items) {
		if (seenEntryExists(subscription.id, feedItem.externalId)) {
			skipped += 1;
			continue;
		}
		if (importItem(feedItem)) {
			imported += 1;
		} else {
			skipped += 1;
		}
	}

	db.query(
		"UPDATE rss_subscriptions SET title = COALESCE(NULLIF(title, ''), ?), site_url = COALESCE(NULLIF(site_url, ''), ?), last_checked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
	).run(feed.title, feed.siteUrl, subscription.id, subscription.user_id);

	return { imported, skipped, feedTitle: feed.title, siteUrl: feed.siteUrl };
}

export async function importAllRssSubscriptions() {
	const subscriptions = db
		.query("SELECT * FROM rss_subscriptions ORDER BY id")
		.all() as RssSubscriptionRow[];
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
	return results;
}
