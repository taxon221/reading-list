import { renderIndexHead } from "./index-head";
import { renderIndexMain } from "./index-main";
import { renderIndexOverlays } from "./index-overlays";

export function renderIndexPage() {
	return `<!doctype html>
<html lang="en">
${renderIndexHead()}
  <body>
${renderIndexMain()}
${renderIndexOverlays()}
  </body>
</html>`;
}
