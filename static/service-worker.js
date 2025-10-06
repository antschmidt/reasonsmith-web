// ReasonSmith Service Worker
const CACHE_VERSION = 'v1';
const CACHE_NAME = `reasonsmith-${CACHE_VERSION}`;

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
	'/',
	'/login',
	'/discussions',
	'/offline',
	'/favicon.png',
	'/logo-only.png'
];

// Install event - pre-cache critical assets
self.addEventListener('install', (event) => {
	console.log('[Service Worker] Installing...');
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('[Service Worker] Pre-caching assets');
			return cache.addAll(PRECACHE_ASSETS).catch((err) => {
				console.warn('[Service Worker] Pre-cache failed for some assets:', err);
			});
		})
	);
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('[Service Worker] Activating...');
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((cacheName) => {
					if (cacheName !== CACHE_NAME) {
						console.log('[Service Worker] Deleting old cache:', cacheName);
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
	self.clients.claim();
});

// Fetch event - network-first strategy with offline fallback
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Skip cross-origin requests
	if (url.origin !== location.origin) {
		return;
	}

	// Network-first strategy for API calls and pages
	event.respondWith(
		fetch(request)
			.then((response) => {
				// Clone the response before caching
				const responseToCache = response.clone();

				// Only cache successful GET responses (Cache API doesn't support POST/PUT/DELETE)
				if (response.status === 200 && request.method === 'GET') {
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});
				}

				return response;
			})
			.catch(() => {
				// Network failed, try cache
				return caches.match(request).then((cachedResponse) => {
					if (cachedResponse) {
						return cachedResponse;
					}

					// If it's a navigation request and not in cache, show offline page
					if (request.mode === 'navigate') {
						return caches.match('/offline');
					}

					// Return a basic error response for other requests
					return new Response('Offline', {
						status: 503,
						statusText: 'Service Unavailable'
					});
				});
			})
	);
});

// Background sync for drafts (when available)
self.addEventListener('sync', (event) => {
	console.log('[Service Worker] Background sync:', event.tag);
	if (event.tag === 'sync-drafts') {
		event.waitUntil(syncDrafts());
	}
});

async function syncDrafts() {
	// Placeholder for syncing drafts when back online
	console.log('[Service Worker] Syncing drafts...');
	// This would interact with IndexedDB to sync saved drafts
}

// Push notification handling (foundation for future)
self.addEventListener('push', (event) => {
	console.log('[Service Worker] Push received');
	const data = event.data ? event.data.json() : {};
	const title = data.title || 'ReasonSmith';
	const options = {
		body: data.body || 'You have a new notification',
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		data: data.url || '/'
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(clients.openWindow(event.notification.data || '/'));
});
