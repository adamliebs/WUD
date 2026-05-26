/**
 * Abuse-report endpoints (App Store Guideline 1.2 — UGC). Open to any
 * authenticated user; the moderation review happens offline against the
 * `reports` table.
 */
import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { handler, optionalString, requireString } from '../lib/http.js';
import { createReport, type ReportKind } from '../services/safety.js';

export const safetyRouter = Router();

safetyRouter.post('/reports', handler((req, res) => {
  const id = createReport({
    reporterId: uid(req),
    targetKind: requireString(req.body, 'targetKind') as ReportKind,
    targetId: requireString(req.body, 'targetId'),
    reason: requireString(req.body, 'reason'),
    note: optionalString(req.body, 'note'),
  });
  res.status(201).json({ reportId: id });
}));
