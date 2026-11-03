import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildBrowserCode, createBrowser, until } from "./browser-fixture";

const folder = mkdtempSync(join(tmpdir(), "reading-progress-ui-"));
const entry = join(folder, "entry.js");
await Bun.write(
	entry,
	`
import { initList } from ${JSON.stringify(resolve("public/static/app/list.js"))};
import { initReader } from ${JSON.stringify(resolve("public/static/app/reader.js"))};
import { state } from ${JSON.stringify(resolve("public/static/app/shared.js"))};
const app = { state };
state.authUi.currentUser = { email: "reader@example.com" };
initList(app); initReader(app);
window.progressFixture = { app, state };
`,
);
const code = await buildBrowserCode(entry);
afterAll(() => rmSync(folder, { recursive: true, force: true }));
const item = () => ({
	id: 1,
	title: "Reading fixture",
	url: "/uploads/fixture.pdf",
	type: "pdf",
	tags: [],
	is_read: 0,
	reading_progress: "",
	created_at: "2026-11-04",
});
function openBrowser(
	fetch: (path: string, init?: RequestInit) => Promise<Response>,
) {
	const { browser, w, errors } = createBrowser();
	w.fetch = fetch;
	w.eval(code);
	const { app, state } = w.progressFixture;
	const progress = (ratio: number) => {
		w.dispatchEvent(
			new w.MessageEvent("message", {
				origin: "http://localhost",
				source: state.readerIframe.contentWindow,
				data: { type: "reading-progress", kind: "pdf", ratio },
			}),
		);
	};
	const close = () => {
		w.history.replaceState({}, "", "/");
		app.closeReader({ fromHistory: true });
	};
	return { browser, w, app, state, progress, errors, close };
}

test("shows progress immediately on close and never rolls it back for slow saves or an older library response", async () => {
	const writes: { ratio: number; resolve: (response: Response) => void }[] = [];
	let reads = 0;
	let releaseLibrary: ((response: Response) => void) | undefined;
	const fixture = openBrowser(async (path, init = {}) => {
		if (path.endsWith("/progress"))
			return new Promise<Response>((resolve) =>
				writes.push({
					ratio: JSON.parse(String(init.body)).progress.ratio,
					resolve,
				}),
			);
		if (path === "/api/items") {
			if (++reads > 1)
				return new Promise<Response>((resolve) => {
					releaseLibrary = resolve;
				});
			return Response.json([
				item(),
				{ ...item(), id: 2, title: "Untouched item" },
			]);
		}
		return Response.json([]);
	});
	const { app, w, progress, errors, close } = fixture;
	const label = () =>
		w.document.querySelector(".item-progress-label")?.textContent;
	try {
		await app.loadItems();
		const untouched = w.document.querySelector('.item[data-id="2"]');
		await app.openReader(1, "/uploads/fixture.pdf", "Reading fixture", "pdf");
		progress(0.25);
		close();
		expect(label()).toBe("25%");
		expect(reads).toBe(1);
		expect(w.document.querySelector('.item[data-id="2"]')).toBe(untouched);
		expect(writes.map((write) => write.ratio)).toEqual([0.25]);
		const staleRefresh = app.loadItems();
		await app.openReader(1, "/uploads/fixture.pdf", "Reading fixture", "pdf");
		progress(0.65);
		close();
		expect(label()).toBe("65%");
		expect(reads).toBe(2);
		expect(writes).toHaveLength(1);
		writes[0].resolve(Response.json({ success: true }));
		await until(() => writes.length === 2);
		expect(writes[1].ratio).toBe(0.65);
		expect(label()).toBe("65%");
		writes[1].resolve(Response.json({ success: true }));
		await until(() => w.localStorage.length === 0);
		releaseLibrary?.(
			Response.json([item(), { ...item(), id: 2, title: "Untouched item" }]),
		);
		await staleRefresh;
		expect(label()).toBe("65%");
		expect(errors).toEqual([]);
	} finally {
		fixture.browser.window.close();
	}
});

test("saves during continuous reading and updates completed filters immediately even if saving fails", async () => {
	let writes = 0;
	const fixture = openBrowser(async (path) => {
		if (path.endsWith("/progress")) {
			writes++;
			return Response.json({}, { status: 503 });
		}
		return Response.json(path === "/api/items" ? [item()] : []);
	});
	const { app, w, progress, state, close } = fixture;
	try {
		await app.loadItems();
		(
			w.document.querySelector('[data-status="unread"]') as HTMLButtonElement
		).click();
		await app.openReader(1, "/uploads/fixture.pdf", "Reading fixture", "pdf");
		for (const ratio of [0.1, 0.2, 0.3, 0.4, 0.5]) {
			progress(ratio);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		expect(writes).toBeGreaterThan(0);
		expect(state.currentReaderId).toBe(1);
		progress(0.99);
		close();
		expect(state.itemsById.get(1).is_read).toBe(1);
		expect(w.document.querySelector('.item[data-id="1"]')).toBeNull();
		(
			w.document.querySelector('[data-status="all"]') as HTMLButtonElement
		).click();
		expect(w.document.querySelector(".item-progress-label")?.textContent).toBe(
			"99%",
		);
		await app.loadItems();
		expect(w.document.querySelector(".item-progress-label")?.textContent).toBe(
			"99%",
		);
		expect(
			w.localStorage.getItem("reading-progress:reader@example.com:1"),
		).toContain("0.99");
	} finally {
		fixture.browser.window.close();
	}
});

test("keeps queued progress with its original account when accounts change", async () => {
	let writes = 0;
	const fixture = openBrowser(async (path) => {
		if (path.endsWith("/progress")) writes++;
		return Response.json(path === "/api/items" ? [item()] : []);
	});
	const { app, w, state, progress, close } = fixture;
	try {
		await app.loadItems();
		await app.openReader(1, "/uploads/fixture.pdf", "Reading fixture", "pdf");
		progress(0.4);
		state.authUi.currentUser = { email: "another@example.com" };
		w.dispatchEvent(new w.Event("reading:account-changed"));
		close();
		await app.loadItems();
		expect(writes).toBe(0);
		expect(
			w.localStorage.getItem("reading-progress:reader@example.com:1"),
		).toContain("0.4");
		expect(
			w.localStorage.getItem("reading-progress:another@example.com:1"),
		).toBeNull();
		expect(w.document.querySelector(".item-progress-label")?.textContent).toBe(
			"0%",
		);
	} finally {
		fixture.browser.window.close();
	}
});
