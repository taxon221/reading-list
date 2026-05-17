import { initDb } from "./db";
import { importAllRssSubscriptions } from "./server/rss-import";

async function main() {
	initDb();

	const results = await importAllRssSubscriptions();
	const imported = results.reduce((sum, result) => {
		const value = (result as { imported?: number }).imported;
		return sum + (value || 0);
	}, 0);
	const failed = results.filter((result) => !result.ok);

	console.log(
		`RSS import complete: ${imported} new item(s), ${failed.length} failed feed(s).`,
	);
	for (const result of results) {
		if (result.ok) {
			console.log(
				`- #${result.subscription_id}: imported ${result.imported}, skipped ${result.skipped}`,
			);
		} else {
			console.log(`- #${result.subscription_id}: failed: ${result.error}`);
		}
	}

	if (failed.length > 0) process.exit(1);
}

main();
