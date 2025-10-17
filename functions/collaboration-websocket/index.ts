/// <reference lib="es2020" />
// WebSocket server for real-time collaborative editing using Yjs
// Handles multiple users editing the same draft post simultaneously

import { IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import { verify } from 'jsonwebtoken';
import { encoding } from 'lib0';

// Room management: Map<postId, YjsRoom>
const rooms = new Map<string, YjsRoom>();

interface YjsRoom {
	doc: Y.Doc;
	awareness: awarenessProtocol.Awareness;
	connections: Map<WebSocket, ConnectionInfo>;
	lastActivity: Date;
}

interface ConnectionInfo {
	userId: string;
	userName: string;
	role: string;
}

interface JWTPayload {
	sub: string; // userId
	'https://hasura.io/jwt/claims': {
		'x-hasura-user-id': string;
		'x-hasura-default-role': string;
		'x-hasura-allowed-roles': string[];
	};
}

// Verify Nhost JWT token
function verifyAuth(token: string): { userId: string; role: string } | null {
	try {
		const secret = process.env.HASURA_GRAPHQL_JWT_SECRET;
		if (!secret) {
			console.error('HASURA_GRAPHQL_JWT_SECRET not configured');
			return null;
		}

		const decoded = verify(token, secret) as JWTPayload;
		const userId = decoded['https://hasura.io/jwt/claims']['x-hasura-user-id'];
		const role = decoded['https://hasura.io/jwt/claims']['x-hasura-default-role'];

		return { userId, role };
	} catch (error) {
		console.error('JWT verification failed:', error);
		return null;
	}
}

// Check if user has access to this draft and realtime collaboration feature
async function checkAccess(
	userId: string,
	postId: string,
	role: string
): Promise<{ hasAccess: boolean; userName?: string; realtimeEnabled?: boolean }> {
	try {
		const hasuraEndpoint = `https://${process.env.PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
		const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;

		if (!hasuraEndpoint || !adminSecret) {
			console.error('Hasura configuration missing');
			return { hasAccess: false };
		}

		// Query to check:
		// 1. Post exists and is in draft/pending status
		// 2. User is author OR accepted collaborator
		// 3. User has realtime_collaboration_enabled = true
		const query = `
			query CheckCollaborationAccess($postId: uuid!, $userId: uuid!) {
				post: post_by_pk(id: $postId) {
					id
					status
					author_id
					author: contributor {
						id
						display_name
						realtime_collaboration_enabled
					}
					post_collaborators(where: {
						contributor_id: {_eq: $userId}
						status: {_eq: "accepted"}
					}) {
						contributor {
							id
							display_name
							realtime_collaboration_enabled
						}
					}
				}
			}
		`;

		const response = await fetch(hasuraEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': adminSecret
			},
			body: JSON.stringify({
				query,
				variables: { postId, userId }
			})
		});

		const result = await response.json();

		if (result.errors) {
			console.error('GraphQL errors:', result.errors);
			return { hasAccess: false };
		}

		const post = result.data?.post;

		if (!post) {
			return { hasAccess: false };
		}

		// Check if post is in editable status
		if (post.status !== 'draft' && post.status !== 'pending') {
			return { hasAccess: false };
		}

		// Check if user is author
		if (post.author_id === userId) {
			return {
				hasAccess: true,
				userName: post.author.display_name || 'Anonymous',
				realtimeEnabled: post.author.realtime_collaboration_enabled === true
			};
		}

		// Check if user is accepted collaborator
		const collaborator = post.post_collaborators[0];
		if (collaborator) {
			return {
				hasAccess: true,
				userName: collaborator.contributor.display_name || 'Anonymous',
				realtimeEnabled: collaborator.contributor.realtime_collaboration_enabled === true
			};
		}

		return { hasAccess: false };
	} catch (error) {
		console.error('Access check failed:', error);
		return { hasAccess: false };
	}
}

// Get or create a Yjs room for a post
function getOrCreateRoom(postId: string): YjsRoom {
	let room = rooms.get(postId);

	if (!room) {
		const doc = new Y.Doc();
		const awareness = new awarenessProtocol.Awareness(doc);

		room = {
			doc,
			awareness,
			connections: new Map(),
			lastActivity: new Date()
		};

		rooms.set(postId, room);

		// TODO: Load persisted Yjs state from database if it exists
		// This would restore the collaborative editing state
	}

	room.lastActivity = new Date();
	return room;
}

// Persist Yjs document state to database
async function persistState(postId: string, state: Uint8Array) {
	try {
		const hasuraEndpoint = `https://${process.env.PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
		const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;

		const mutation = `
			mutation UpsertCollaborationSession($postId: uuid!, $state: bytea!) {
				insert_collaboration_session_one(
					object: {
						post_id: $postId
						yjs_state: $state
						last_active_at: "now()"
					}
					on_conflict: {
						constraint: collaboration_session_post_id_key
						update_columns: [yjs_state, last_active_at]
					}
				) {
					id
				}
			}
		`;

		await fetch(hasuraEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-hasura-admin-secret': adminSecret
			},
			body: JSON.stringify({
				query: mutation,
				variables: {
					postId,
					state: Buffer.from(state).toString('base64')
				}
			})
		});
	} catch (error) {
		console.error('Failed to persist state:', error);
	}
}

// Cleanup inactive rooms (called periodically)
function cleanupInactiveRooms() {
	const now = new Date();
	const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

	for (const [postId, room] of rooms.entries()) {
		if (
			room.connections.size === 0 &&
			now.getTime() - room.lastActivity.getTime() > inactiveThreshold
		) {
			// Persist state before cleanup
			const state = Y.encodeStateAsUpdate(room.doc);
			persistState(postId, state);

			// Cleanup
			room.doc.destroy();
			rooms.delete(postId);
			console.log(`Cleaned up inactive room: ${postId}`);
		}
	}
}

// Run cleanup every 2 minutes
setInterval(cleanupInactiveRooms, 2 * 60 * 1000);

// WebSocket message handler
function setupWSConnection(
	conn: WebSocket,
	postId: string,
	userId: string,
	userName: string,
	role: string
) {
	const room = getOrCreateRoom(postId);
	const { doc, awareness } = room;

	// Store connection info
	room.connections.set(conn, { userId, userName, role });

	// Set user awareness state (for collaborative cursors)
	const awarenessState = {
		user: {
			name: userName,
			color: generateUserColor(userId)
		}
	};

	// Send initial sync
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
	syncProtocol.writeSyncStep1(encoder, doc);
	conn.send(encoding.toUint8Array(encoder));

	// Send awareness state
	const awarenessStates = awareness.getStates();
	if (awarenessStates.size > 0) {
		const awarenessEncoder = encoding.createEncoder();
		encoding.writeVarUint(awarenessEncoder, awarenessProtocol.messageAwareness);
		encoding.writeVarUint8Array(
			awarenessEncoder,
			awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
		);
		conn.send(encoding.toUint8Array(awarenessEncoder));
	}

	// Handle incoming messages
	const messageHandler = (message: ArrayBuffer) => {
		const uint8Array = new Uint8Array(message);
		const decoder = encoding.createDecoder(uint8Array);
		const messageType = encoding.readVarUint(decoder);

		switch (messageType) {
			case syncProtocol.messageYjsSyncStep1:
			case syncProtocol.messageYjsSyncStep2:
			case syncProtocol.messageYjsUpdate:
				// Handle sync protocol messages
				const responseEncoder = encoding.createEncoder();
				encoding.writeVarUint(responseEncoder, syncProtocol.messageYjsSyncStep2);
				syncProtocol.readSyncMessage(decoder, responseEncoder, doc, null);

				// Broadcast to all connections in the room
				const response = encoding.toUint8Array(responseEncoder);
				room.connections.forEach((_, otherConn) => {
					if (otherConn !== conn && otherConn.readyState === WebSocket.OPEN) {
						otherConn.send(response);
					}
				});
				break;

			case awarenessProtocol.messageAwareness:
				// Handle awareness protocol messages (collaborative cursors)
				awarenessProtocol.applyAwarenessUpdate(
					awareness,
					encoding.readVarUint8Array(decoder),
					conn
				);
				break;
		}

		room.lastActivity = new Date();
	};

	const closeHandler = () => {
		room.connections.delete(conn);
		awareness.setLocalState(null);

		// Persist state when connection closes
		if (room.connections.size === 0) {
			const state = Y.encodeStateAsUpdate(doc);
			persistState(postId, state);
		}

		console.log(`Connection closed for user ${userId} in room ${postId}`);
	};

	conn.on('message', messageHandler);
	conn.on('close', closeHandler);
	conn.on('error', (error) => {
		console.error('WebSocket error:', error);
		closeHandler();
	});

	console.log(`User ${userId} (${userName}) connected to room ${postId}`);
}

// Generate consistent color for user based on ID
function generateUserColor(userId: string): string {
	const colors = [
		'#FF6B6B',
		'#4ECDC4',
		'#45B7D1',
		'#FFA07A',
		'#98D8C8',
		'#F7DC6F',
		'#BB8FCE',
		'#85C1E2',
		'#F8B739',
		'#52B788'
	];

	// Simple hash function
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = userId.charCodeAt(i) + ((hash << 5) - hash);
	}

	return colors[Math.abs(hash) % colors.length];
}

// Main handler for Nhost Functions
export default async function handler(req: IncomingMessage, res: ServerResponse) {
	// Upgrade HTTP connection to WebSocket
	const wss = new WebSocketServer({ noServer: true });

	wss.handleUpgrade(req, req.socket, Buffer.alloc(0), async (ws) => {
		const url = new URL(req.url || '', `http://${req.headers.host}`);
		const token = url.searchParams.get('token');
		const postId = url.searchParams.get('postId');

		if (!token || !postId) {
			ws.close(1008, 'Missing token or postId');
			return;
		}

		// Verify authentication
		const auth = verifyAuth(token);
		if (!auth) {
			ws.close(1008, 'Invalid token');
			return;
		}

		// Check access permissions and realtime feature enabled
		const access = await checkAccess(auth.userId, postId, auth.role);
		if (!access.hasAccess) {
			ws.close(1008, 'Access denied');
			return;
		}

		if (!access.realtimeEnabled) {
			ws.close(1008, 'Real-time collaboration not enabled for this user');
			return;
		}

		// Setup WebSocket connection for Yjs
		setupWSConnection(ws, postId, auth.userId, access.userName || 'Anonymous', auth.role);

		wss.emit('connection', ws, req);
	});

	// Keep connection alive
	res.writeHead(200);
	res.end();
}
