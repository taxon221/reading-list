import { describe, expect, test } from "bun:test";
import { parseTitle } from "./content-utils";

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
});
