import { describe, expect, test } from "bun:test";
import {
	decodeHtmlEntities,
	getSafeRemoteUrl,
	parseTitle,
} from "./content-utils";

describe("article metadata parsing", () => {
	test("prefers an article heading over a site-decorated document title", () => {
		const html = `<!doctype html>
			<html><head>
				<title>Self-hosting in the era of LLMs and cheap compute &#8211; Xkeeper&#039;s blog</title>
			</head><body><article>
				<h1 class="entry-title">Self-hosting in the era of LLMs and cheap compute</h1>
			</article></body></html>`;

		expect(parseTitle(html)).toBe(
			"Self-hosting in the era of LLMs and cheap compute",
		);
	});

	test("rejects private remote targets", async () => {
		expect(await getSafeRemoteUrl("http://127.0.0.1/private")).toBeNull();
		expect(
			await getSafeRemoteUrl("http://[::ffff:127.0.0.1]/private"),
		).toBeNull();
		expect(await getSafeRemoteUrl("http://[::ffff:a00:1]/private")).toBeNull();
		expect(
			await getSafeRemoteUrl("https://user:pass@example.com/private"),
		).toBeNull();
	});

	test("decodes entities once, including hex, emoji and typographic names", () => {
		expect(decodeHtmlEntities("Tom &amp;amp; Jerry &amp;lt;3")).toBe(
			"Tom &amp; Jerry &lt;3",
		);
		expect(decodeHtmlEntities("Ship it &#x1F680; &#128640;")).toBe(
			"Ship it \u{1F680} \u{1F680}",
		);
		expect(decodeHtmlEntities("A &ndash; B&hellip; &rsquo;s &unknown;")).toBe(
			"A \u2013 B\u2026 \u2019s &unknown;",
		);
		expect(decodeHtmlEntities("Bad &#xD800; &#57343;")).toBe(
			"Bad \ufffd \ufffd",
		);
	});
});
