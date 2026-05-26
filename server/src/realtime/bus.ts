import { EventEmitter } from 'node:events';

/**
 * In-process event bus. Domain services publish realtime events here; the
 * WebSocket gateway subscribes and fans them out to connected clients.
 *
 * In production this would be Redis pub/sub so multiple gateway instances can
 * each receive every event (SRS FR-RT-06). The publish/subscribe surface here
 * is intentionally identical so that swap is mechanical.
 */

export type RealtimeEvent =
  | { channel: `user:${string}`;     type: 'notification.created'; data: unknown }
  | { channel: `user:${string}`;     type: 'friend.changed';       data: unknown }
  | { channel: `user:${string}`;     type: 'block.changed';        data: unknown }
  | { channel: `activity:${string}`; type: 'message.created';      data: unknown }
  | { channel: `activity:${string}`; type: 'poll.updated';         data: unknown }
  | { channel: `activity:${string}`; type: 'rsvp.changed';         data: unknown }
  | { channel: `activity:${string}`; type: 'reaction.changed';     data: unknown }
  | { channel: `activity:${string}`; type: 'activity.updated';     data: unknown }
  | { channel: `activity:${string}`; type: 'host.transferred';     data: unknown }
  | { channel: `squad:${string}`;    type: 'message.created';      data: unknown }
  | { channel: `presence:friends`;   type: 'presence.changed';     data: unknown };

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // gateway attaches one listener; clients are tracked internally

/** Publish a realtime event to a channel. */
export function publish(event: RealtimeEvent): void {
  emitter.emit('event', event);
}

/** Subscribe to every realtime event (the gateway filters by channel). */
export function onEvent(listener: (event: RealtimeEvent) => void): () => void {
  emitter.on('event', listener);
  return () => emitter.off('event', listener);
}
