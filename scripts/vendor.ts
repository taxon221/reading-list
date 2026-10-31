import { copyFile, cp, mkdir } from "node:fs/promises";
const root = "public/static/vendor";
await mkdir(root, { recursive: true });
for (const [source, target] of [
	["pdfjs-dist/build/pdf.min.mjs", "pdf.mjs"],
	["pdfjs-dist/build/pdf.worker.min.mjs", "pdf.worker.mjs"],
	["pdfjs-dist/web/pdf_viewer.css", "pdf_viewer.css"],
	["epubjs/dist/epub.min.js", "epub.min.js"],
	["jszip/dist/jszip.min.js", "jszip.min.js"],
	["@simplewebauthn/browser/dist/bundle/index.umd.min.js", "webauthn.js"],
	["pdfjs-dist/LICENSE", "pdf.LICENSE"],
	["epubjs/license", "epub.LICENSE"],
	["jszip/LICENSE.markdown", "jszip.LICENSE"],
	["@simplewebauthn/browser/LICENSE.md", "webauthn.LICENSE"],
]) {
	// Fail loudly: a silently missing vendor file breaks the PDF/EPUB readers or sign-in.
	await copyFile(`node_modules/${source}`, `${root}/${target}`);
}
for (const dir of ["cmaps", "standard_fonts", "wasm"])
	await cp(`node_modules/pdfjs-dist/${dir}`, `${root}/${dir}`, {
		recursive: true,
	});
