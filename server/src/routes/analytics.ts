import { Router } from 'express';
import { q } from '../db/index.js';
import { newId, now } from '../lib/ids.js';
import { handler } from '../lib/http.js';
import { verifyAccessToken } from '../lib/jwt.js';

export const analyticsRouter = Router();

/**
 * POST /v1/events — record one product-analytics event.
 *
 * Deliberately PUBLIC (mounted before requireAuth) so the signup funnel can be
 * measured before a session exists (app_open, signup_started, …). When a valid
 * access token is present we attach the user id; otherwise it's anonymous.
 *
 * Fire-and-forget on the client; this endpoint always 204s (even on bad input)
 * so analytics never surfaces an error to the user. Inputs are tightly capped
 * so the table can't be used as arbitrary storage.
 */
const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);

analyticsRouter.post('/events', handler((req, res) => {
  const body = (req.body ?? {}) as { event?: unknown; props?: unknown; platform?: unknown };
  const event = typeof body.event === 'string' ? body.event.slice(0, 64).trim() : '';
  if (event) {
    // Optional auth — attach the user id when a valid token rides along.
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const userId = token ? verifyAccessToken(token) : null;

    const platform = typeof body.platform === 'string' && VALID_PLATFORMS.has(body.platform)
      ? body.platform : null;
    // Stringify props defensively + cap length so a bad client can't bloat rows.
    let props: string | null = null;
    if (body.props && typeof body.props === 'object') {
      try { props = JSON.stringify(body.props).slice(0, 1000); } catch { props = null; }
    }
    try {
      q.run(
        `INSERT INTO analytics_events (id, user_id, event, props, platform, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        newId(), userId, event, props, platform, now(),
      );
    } catch { /* analytics must never break the caller */ }
  }
  res.status(204).end();
}));
