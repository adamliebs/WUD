import { q, tx } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { newId, now } from '../lib/ids.js';
import { publish } from '../realtime/bus.js';
import type { ChatMessage, PollOption } from '../types.js';
import { createNotification } from './notifications.js';
import { getUserRow } from './users.js';

/** A chat thread parent — exactly one of these is set. */
export type ThreadParent = { activityId: string } | { squadId: string };

interface MessageRow {
  id: string;
  activity_id: string | null;
  squad_id: string | null;
  author_id: string | null;
  type: 'text' | 'photo' | 'poll' | 'system';
  body: string | null;
  photo_url: string | null;
  created_at: number;
}

/* --- serialization -------------------------------------------------------- */

function pollFor(messageId: string): ChatMessage['poll'] {
  const poll = q.get<{ question: string; closed: number }>(
    'SELECT question, closed FROM polls WHERE message_id = ?', messageId,
  );
  if (!poll) return undefined;
  const optionRows = q.all<{ id: string; label: string }>(
    'SELECT id, label FROM poll_options WHERE poll_message_id = ? ORDER BY order_index', messageId,
  );
  const options: PollOption[] = optionRows.map(o => ({
    id: o.id,
    text: o.label,
    voterIds: q.all<{ user_id: string }>(
      'SELECT user_id FROM poll_votes WHERE option_id = ?', o.id,
    ).map(v => v.user_id),
  }));
  return { question: poll.question, options, closed: !!poll.closed };
}

function toMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    authorId: r.author_id ?? 'system',
    at: r.created_at,
    type: r.type === 'system' ? 'text' : r.type,
    text: r.body ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    poll: r.type === 'poll' ? pollFor(r.id) : undefined,
  };
}

/** All messages for an activity thread, oldest first. */
export function messagesForActivity(activityId: string): ChatMessage[] {
  return q.all<MessageRow>(
    'SELECT * FROM messages WHERE activity_id = ? ORDER BY created_at, id', activityId,
  ).map(toMessage);
}

/** All messages for a squad thread, oldest first. */
export function messagesForSquad(squadId: string): ChatMessage[] {
  return q.all<MessageRow>(
    'SELECT * FROM messages WHERE squad_id = ? ORDER BY created_at, id', squadId,
  ).map(toMessage);
}

/* --- write paths ---------------------------------------------------------- */

function parentCols(parent: ThreadParent): { activityId: string | null; squadId: string | null; channel: `activity:${string}` | `squad:${string}` } {
  if ('activityId' in parent) {
    return { activityId: parent.activityId, squadId: null, channel: `activity:${parent.activityId}` };
  }
  return { activityId: null, squadId: parent.squadId, channel: `squad:${parent.squadId}` };
}

function insertMessage(
  parent: ThreadParent,
  authorId: string | null,
  type: MessageRow['type'],
  fields: { body?: string | null; photoUrl?: string | null },
): string {
  const { activityId, squadId } = parentCols(parent);
  const id = newId();
  q.run(
    `INSERT INTO messages (id, activity_id, squad_id, author_id, type, body, photo_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, activityId, squadId, authorId, type, fields.body ?? null, fields.photoUrl ?? null, now(),
  );
  return id;
}

function emitMessage(parent: ThreadParent, messageId: string): ChatMessage {
  const { channel } = parentCols(parent);
  const row = q.get<MessageRow>('SELECT * FROM messages WHERE id = ?', messageId)!;
  const message = toMessage(row);
  publish({ channel, type: 'message.created', data: message } as never);
  return message;
}

export function sendText(parent: ThreadParent, authorId: string, text: string): ChatMessage {
  const trimmed = text.trim();
  if (!trimmed) throw badRequest('EMPTY_MESSAGE', 'Message cannot be empty', 'text');
  const message = emitMessage(parent, insertMessage(parent, authorId, 'text', { body: trimmed }));
  notifyActivityChat(parent, authorId, previewLine(trimmed));
  return message;
}

export function sendPhoto(
  parent: ThreadParent, authorId: string, photoUrl: string, caption?: string,
): ChatMessage {
  if (!photoUrl) throw badRequest('MISSING_PHOTO', 'photoUrl is required', 'photoUrl');
  const message = emitMessage(parent, insertMessage(parent, authorId, 'photo', {
    photoUrl, body: caption?.trim() || null,
  }));
  notifyActivityChat(parent, authorId, caption?.trim() ? `📷 ${previewLine(caption)}` : '📷 Photo');
  return message;
}

/** Truncate a chat preview for notification bodies — long messages are noisy
 *  on lockscreens. */
function previewLine(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
}

/** Fan a `chat_message` notification to every activity participant except the
 *  sender. Skips squad chats (they'd be too noisy in MVP). The body is the
 *  sender's name + the message preview so the lockscreen tells you who said
 *  what without opening the app.
 *
 *  Wrapped in try/catch via the underlying createNotification — a failed
 *  notification never aborts the send. */
function notifyActivityChat(parent: ThreadParent, authorId: string, preview: string): void {
  if (!('activityId' in parent)) return;
  const { activityId } = parent;

  const activity = q.get<{ host_id: string; title: string }>(
    'SELECT host_id, title FROM activities WHERE id = ?', activityId,
  );
  if (!activity) return;

  // Recipients = host + every `going` RSVP, minus the sender.
  const recipientIds = new Set<string>();
  if (activity.host_id !== authorId) recipientIds.add(activity.host_id);
  const goers = q.all<{ user_id: string }>(
    "SELECT user_id FROM rsvps WHERE activity_id = ? AND state = 'going'",
    activityId,
  );
  for (const g of goers) {
    if (g.user_id !== authorId) recipientIds.add(g.user_id);
  }
  if (recipientIds.size === 0) return;

  const author = getUserRow(authorId);
  const authorName = author?.name ?? 'Someone';
  const body = `${authorName} in "${activity.title}": ${preview}`;

  for (const userId of recipientIds) {
    createNotification({
      userId,
      type: 'chat_message',
      fromId: authorId,
      activityId,
      body,
    });
  }
}

/** System message — no author; used for host-transfer notices etc. */
export function sendSystem(parent: ThreadParent, text: string): ChatMessage {
  return emitMessage(parent, insertMessage(parent, null, 'system', { body: text }));
}

export function sendPoll(
  parent: ThreadParent, authorId: string, question: string, optionTexts: string[],
): ChatMessage {
  const qn = question.trim();
  const opts = optionTexts.map(t => t.trim()).filter(Boolean);
  if (!qn) throw badRequest('EMPTY_POLL', 'Poll needs a question', 'question');
  if (opts.length < 2) throw badRequest('POLL_TOO_FEW', 'Poll needs at least 2 options', 'options');
  if (opts.length > 6) throw badRequest('POLL_TOO_MANY', 'Poll allows at most 6 options', 'options');

  const messageId = tx(() => {
    const id = insertMessage(parent, authorId, 'poll', {});
    q.run('INSERT INTO polls (message_id, question, closed) VALUES (?, ?, 0)', id, qn);
    opts.forEach((label, i) => {
      q.run(
        'INSERT INTO poll_options (id, poll_message_id, label, order_index) VALUES (?, ?, ?, ?)',
        newId(), id, label, i,
      );
    });
    return id;
  });
  return emitMessage(parent, messageId);
}

/** Toggle a user's vote. One vote per poll: re-voting the same option clears it. */
export function voteInPoll(messageId: string, userId: string, optionId: string): ChatMessage {
  const poll = q.get<{ closed: number; activity_id: string | null; squad_id: string | null }>(
    `SELECT p.closed, m.activity_id, m.squad_id
       FROM polls p JOIN messages m ON m.id = p.message_id
      WHERE p.message_id = ?`, messageId,
  );
  if (!poll) throw notFound('POLL_NOT_FOUND', 'Poll not found');
  if (poll.closed) throw forbidden('This poll is closed');

  const option = q.get<{ id: string }>(
    'SELECT id FROM poll_options WHERE id = ? AND poll_message_id = ?', optionId, messageId,
  );
  if (!option) throw badRequest('BAD_OPTION', 'Option does not belong to this poll', 'optionId');

  tx(() => {
    const current = q.get<{ option_id: string }>(
      'SELECT option_id FROM poll_votes WHERE poll_message_id = ? AND user_id = ?', messageId, userId,
    );
    q.run('DELETE FROM poll_votes WHERE poll_message_id = ? AND user_id = ?', messageId, userId);
    if (!current || current.option_id !== optionId) {
      q.run(
        'INSERT INTO poll_votes (poll_message_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        messageId, optionId, userId, now(),
      );
    }
  });

  const parent: ThreadParent = poll.activity_id
    ? { activityId: poll.activity_id }
    : { squadId: poll.squad_id! };
  const { channel } = parentCols(parent);
  const row = q.get<MessageRow>('SELECT * FROM messages WHERE id = ?', messageId)!;
  const message = toMessage(row);
  publish({ channel, type: 'poll.updated', data: message } as never);
  return message;
}
