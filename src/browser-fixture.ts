import { JSDOM, VirtualConsole } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { renderIndexPage } from "./ui/index-page";

export async function buildBrowserCode(entry = "./public/static/app.js") {
	const bundle = await Bun.build({
		entrypoints: [entry],
		target: "browser",
		format: "iife",
	});
	if (!bundle.success)
		throw new AggregateError(bundle.logs, "Browser build failed");
	return bundle.outputs[0].text();
}

export const appCode = buildBrowserCode();

export function createBrowser({
	url = "http://localhost",
	indexedDB = new IDBFactory(),
} = {}) {
	const errors: unknown[] = [];
	const virtualConsole = new VirtualConsole();
	virtualConsole.on("jsdomError", (error) => errors.push(error));
	const browser = new JSDOM(renderIndexPage(), {
		url,
		runScripts: "outside-only",
		pretendToBeVisual: true,
		virtualConsole,
	});
	const w = browser.window;
	Object.assign(w, { indexedDB, scrollTo() {} });
	w.matchMedia = () =>
		({
			matches: false,
			addEventListener() {},
			removeEventListener() {},
		}) as unknown as MediaQueryList;
	const el = <T extends HTMLElement = HTMLElement>(id: string) =>
		w.document.getElementById(id) as T;
	const click = (id: string) => el(id).click();
	const submit = (id: string) =>
		el(id).dispatchEvent(
			new w.Event("submit", { bubbles: true, cancelable: true }),
		);
	const input = (id: string, value: string) => {
		el<HTMLInputElement>(id).value = value;
		el(id).dispatchEvent(new w.Event("input", { bubbles: true }));
	};
	return { browser, w, errors, el, click, submit, input };
}

export async function until(predicate: () => boolean) {
	for (let attempt = 0; attempt < 150; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("Browser UI did not settle");
}
