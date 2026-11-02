// Retirement worker for browsers that installed the former offline-reading
// feature: their update check fetches this script, which clears the old caches
// and unregisters itself. Safe to delete once no such browser remains.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names
					.filter((name) => name.startsWith("reading-offline-"))
					.map((name) => caches.delete(name)),
			);
			await self.registration.unregister();
		})(),
	);
});
