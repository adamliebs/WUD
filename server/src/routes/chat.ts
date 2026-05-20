import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { db } from '../db/index.js';
import { forbidden, notFound } from '../lib/errors.js';
import { handler, optionalString, requireString } from '../lib/http.js';
import {
  messagesForActivity, messagesForSquad, sendPhoto, sendPoll, sendText, voteInPoll,
} from '../services/chat.js';
import { canSeeActivity, getActivityRow, isParticipant } from '../services/activities.js';
import { isInSquad } from '../services/social.js';

export const chatRouter = Router();

/* ---- activity chat ---- */

function assertCanReadActivity(userId: string, activityId: string) {
  const row = getActivityRow(activityId);
  if (!row) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');
  if (!canSeeActivity(userId, row)) throw forbidden('You cannot view this plan');
}
function assertCanPostActivity(userId: string, activityId: string) {
  if (!getActivityRow(activityId)) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');
  if (!isParticipant(userId, activityId)) throw forbidden('Join the plan to chat');
}

chatRouter.get('/activities/:id/messages', handler((req, res) => {
  assertCanReadActivity(uid(req), req.params.id);
  res.json({ messages: messagesForActivity(req.params.id) });
}));

chatRouter.post('/activities/:id/messages', handler((req, res) => {
  assertCanPostActivity(uid(req), req.params.id);
  const photoUrl = optionalString(req.body, 'photoUrl');
  const message = photoUrl
    ? sendPhoto({ activityId: req.params.id }, uid(req), photoUrl, optionalString(req.body, 'text'))
    : sendText({ activityId: req.params.id }, uid(req), requireString(req.body, 'text'));
  res.status(201).json({ message });
}));

chatRouter.post('/activities/:id/polls', handler((req, res) => {
  assertCanPostActivity(uid(req), req.params.id);
  const options = Array.isArray(req.body?.options) ? req.body.options.map(String) : [];
  const message = sendPoll(
    { activityId: req.params.id }, uid(req), requireString(req.body, 'question'), options,
  );
  res.status(201).json({ message });
}));

/* ---- squad chat ---- */

function assertSquadMember(userId: string, squadId: string) {
  if (!db.prepare('SELECT 1 FROM squads WHERE id = ?').get(squadId)) {
    throw notFound('SQUAD_NOT_FOUND', 'Squad not found');
  }
  if (!isInSquad(squadId, userId)) throw forbidden('You are not in this squad');
}

chatRouter.get('/squads/:id/messages', handler((req, res) => {
  assertSquadMember(uid(req), req.params.id);
  res.json({ messages: messagesForSquad(req.params.id) });
}));

chatRouter.post('/squads/:id/messages', handler((req, res) => {
  assertSquadMember(uid(req), req.params.id);
  const photoUrl = optionalString(req.body, 'photoUrl');
  const message = photoUrl
    ? sendPhoto({ squadId: req.params.id }, uid(req), photoUrl, optionalString(req.body, 'text'))
    : sendText({ squadId: req.params.id }, uid(req), requireString(req.body, 'text'));
  res.status(201).json({ message });
}));

/* ---- poll voting ---- */

chatRouter.put('/polls/:messageId/vote', handler((req, res) => {
  // Authorization: the voter must be a participant of the poll's parent thread.
  const parent = db.prepare(
    'SELECT activity_id, squad_id FROM messages WHERE id = ?',
  ).get(req.params.messageId) as { activity_id: string | null; squad_id: string | null } | undefined;
  if (!parent) throw notFound('POLL_NOT_FOUND', 'Poll not found');

  const userId = uid(req);
  if (parent.activity_id) assertCanPostActivity(userId, parent.activity_id);
  else if (parent.squad_id) assertSquadMember(userId, parent.squad_id);

  const message = voteInPoll(req.params.messageId, userId, requireString(req.body, 'optionId'));
  res.json({ message });
}));
