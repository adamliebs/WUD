/**
 * WebSocket client for the realtime gateway.
 *
 * Connects with the access token, auto-reconnects with backoff, and lets the
 * store (re)subscribe to activity/squad channels as sheets open and close.
 * Incoming events are handed to a single listener which triggers targeted
 * refetches in the store — simple and always-consistent.
 */
import { apiBaseUrl, tokens } from './client';

export interface RealtimeEvent {
  channel: string;
  type: string;
  data: unknown;
}

type Listener = (event: RealtimeEvent) => void;

let socket: WebSocket | null = null;
let listener: Listener | null = null;
let reconnectDelay = 1000;
let intentionallyClosed = false;
/** Channels to (re)subscribe to on every (re)connection. */
const channels = new Set<string>();

function wsUrl(): string {
  const base = apiBaseUrl.replace(/^http/, 'ws');
  return `${base}/v1/realtime?token=${encodeURIComponent(tokens.access ?? '')}`;
}

function flushSubscriptions() {
  if (socket?.readyState === WebSocket.OPEN && channels.size > 0) {
    socket.send(JSON.stringify({ subscribe: [...channels] }));
  }
}

/** Open the realtime connection. Safe to call repeatedly. */
export function connectRealtime(onEvent: Listener): void {
  listener = onEvent;
  intentionallyClosed = false;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  open();
}

function open() {
  if (!tokens.access) return;
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    reconnectDelay = 1000;
    flushSubscriptions();
  };
  socket.onmessage = ev => {
    try {
      const msg = JSON.parse(String(ev.data)) as RealtimeEvent;
      if (msg.channel && msg.type) listener?.(msg);
    } catch {
      /* ignore malformed frames */
    }
  };
  socket.onclose = () => {
    socket = null;
    if (!intentionallyClosed) scheduleReconnect();
  };
  socket.onerror = () => { socket?.close(); };
}

function scheduleReconnect() {
  if (intentionallyClosed) return;
  setTimeout(open, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 15_000); // exponential backoff, capped
}

/** Subscribe to a channel (e.g. `activity:abc`); re-applied across reconnects. */
export function subscribeChannel(channel: string): void {
  channels.add(channel);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ subscribe: [channel] }));
  }
}

/** Stop receiving events for a channel. */
export function unsubscribeChannel(channel: string): void {
  channels.delete(channel);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ unsubscribe: [channel] }));
  }
}

/** Close the connection and forget all subscriptions (on sign-out). */
export function disconnectRealtime(): void {
  intentionallyClosed = true;
  channels.clear();
  listener = null;
  socket?.close();
  socket = null;
}
