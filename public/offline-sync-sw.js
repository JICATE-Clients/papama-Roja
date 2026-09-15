/*
 * pApAmA offline capture relay (E-4 / B-30).
 *
 * Deliberately caches NOTHING and intercepts no fetches: a stale cached till
 * screen during an emergency would be worse than none. Its one job is to turn a
 * Background Sync event into a message, so an open scan screen uploads its
 * queue — the queue itself lives in IndexedDB, owned by the page.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("sync", (event) => {
    if (event.tag !== "papama-offline-sync") return;
    event.waitUntil(
        self.clients.matchAll({ type: "window" }).then((clients) => {
            for (const client of clients) client.postMessage({ type: "papama-offline-sync" });
        })
    );
});
