import { db, initDb } from "./db";
import {
	fetchRemoteMetadata,
	normalizeStoredPreviewImage,
} from "./server/content-utils";

type ItemRow = {
	id: number;
	url: string;
};

type BackfillStats = {
	scanned: number;
	updated: number;
	unchanged: number;
	failed: number;
};

function readNumericFlag(name: string, fallback: number): number {
	const arg = Bun.argv.find((value) => value.startsWith(`--${name}=`));
	const parsed = Number(arg?.split("=")[1] || "");
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runWorker(
	items: ItemRow[],
	updatePreviewImage: ReturnType<typeof db.query>,
	stats: BackfillStats,
) {
	for (const item of items) {
		stats.scanned += 1;

		try {
			const metadata = await fetchRemoteMetadata(item.url);
			const previewImage = normalizeStoredPreviewImage(metadata?.image);
			if (!previewImage) {
				stats.unchanged += 1;
			} else {
				updatePreviewImage.run(previewImage, item.id);
				stats.updated += 1;
			}
		} catch {
			stats.failed += 1;
		}

		if (stats.scanned % 25 === 0) {
			console.log(
				`progress scanned=${stats.scanned} updated=${stats.updated} unchanged=${stats.unchanged} failed=${stats.failed}`,
			);
		}
	}
}

async function main() {
	initDb();

	const limit = readNumericFlag("limit", Number.MAX_SAFE_INTEGER);
	const concurrency = readNumericFlag("concurrency", 6);
	const items = db
		.query(
			`
				SELECT id, url
				FROM items
				WHERE TRIM(preview_image) = ''
					AND (url LIKE 'http://%' OR url LIKE 'https://%')
				ORDER BY id ASC
				LIMIT ?
			`,
		)
		.all(limit) as ItemRow[];

	if (items.length === 0) {
		console.log("No items need preview-image backfill.");
		return;
	}

	const updatePreviewImage = db.query(
		"UPDATE items SET preview_image = ? WHERE id = ?",
	);
	const workerCount = Math.min(concurrency, items.length);
	const buckets = Array.from({ length: workerCount }, () => [] as ItemRow[]);
	for (const [index, item] of items.entries()) {
		buckets[index % workerCount].push(item);
	}

	const stats: BackfillStats = {
		scanned: 0,
		updated: 0,
		unchanged: 0,
		failed: 0,
	};

	console.log(
		`Backfilling preview images for ${items.length} items with concurrency ${workerCount}...`,
	);

	await Promise.all(
		buckets.map((bucket) => runWorker(bucket, updatePreviewImage, stats)),
	);

	console.log(
		JSON.stringify(
			{
				scanned: stats.scanned,
				updated: stats.updated,
				unchanged: stats.unchanged,
				failed: stats.failed,
			},
			null,
			2,
		),
	);
}

await main();
