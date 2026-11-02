// Access returns a useful 401 for AJAX requests rather than an HTML login redirect.
export function initNetwork() {
	const original = window.fetch.bind(window);
	window.fetch = (input, init = {}) => {
		const url = new URL(
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url,
			location.origin,
		);
		if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
			return original(input, init);
		const headers = new Headers(
			init.headers || (typeof input !== "string" ? input.headers : undefined),
		);
		headers.set("X-Requested-With", "XMLHttpRequest");
		return original(input, {
			...init,
			headers,
			credentials: init.credentials || "same-origin",
		});
	};
}
