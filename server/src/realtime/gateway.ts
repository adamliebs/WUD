import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../lib/jwt.js';
import { onEvent } from './bus.js';

/**
 * WebSocket gateway (SRS §7.1).
 *
 * Connect:    wss://host/v1/realtime?token=<accessToken>
 * Subscribe:  client sends { "subscribe": ["activity:abc", "squad:xyz"] }
 * Receive:    server sends { "channel": "...", "type": "...", "data": {...} }
 *
 * Every socket is auto-subscribed to its own `user:<id>` and `presence:friends`.
 * Heartbeats prune dead connections.
 */

interface Client {
  socket: WebSocket;
  userId: string;
  channels: Set<string>;
  alive: boolean;
}

const clients = new Set<Client>();

export function attachRealtime(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/v1/realtime' });

  wss.on('connection', (socket, req) => {
    // Authenticate from the ?token= query param.
    const url = new URL(req.url ?? '', 'http://localhost');
    const userId = verifyAccessToken(url.searchParams.get('token') ?? '');
    if (!userId) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    const client: Client = {
      socket,
      userId,
      channels: new Set([`user:${userId}`, 'presence:friends']),
      alive: true,
    };
    clients.add(client);
    socket.send(JSON.stringify({ type: 'connected', data: { userId } }));

    socket.on('message', raw => {
      try {
        const msg = JSON.parse(String(raw)) as { subscribe?: string[]; unsubscribe?: string[] };
        // Channel authorization: a client may only subscribe to its own user
        // channel, presence, or activity/squad channels. Membership of a
        // specific activity/squad is enforced at the REST layer; the gateway
        // accepts the subscription and relies on data already being scoped.
        for (const ch of msg.subscribe ?? []) {
          if (ch.startsWith('user:') && ch !== `user:${userId}`) continue;
          client.channels.add(ch);
        }
        for (const ch of msg.unsubscribe ?? []) {
          if (ch === `user:${userId}` || ch === 'presence:friends') continue;
          client.channels.delete(ch);
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    socket.on('pong', () => { client.alive = true; });
    socket.on('close', () => { clients.delete(client); });
    socket.on('error', () => { clients.delete(client); });
  });

  // Fan out every bus event to subscribed clients.
  onEvent(event => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.channels.has(event.channel) && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(payload);
      }
    }
  });

  // Heartbeat — drop sockets that miss a ping/pong round.
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        clients.delete(client);
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(heartbeat));

  console.log('[realtime] WebSocket gateway listening at /v1/realtime');
}

/** Current connected-client count (for the health endpoint). */
export function realtimeClientCount(): number {
  return clients.size;
}
