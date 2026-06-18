import { Capacitor } from '@capacitor/core';
import { apiBaseUrl, tokens } from '../api/client';

/**
 * Lightweight product analytics — fire-and-forget funnel events.
 *
 * `track()` POSTs to the public /v1/events sink. It never throws, never blocks
 * the UI, and silently drops on any failure (offline, server down) — analytics
 * must be invisible to the user. When the user is signed in their access token
 * rides along so the server can attribute the event; pre-signup events
 * (app_open, signup_started) are anonymous.
 *
 * `props` is small, non-identifying context only (quest name, a 'via' tag) —
 * never PII.
 */
const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

export function track(event: string, props?: Record<string, unknown>): void {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = tokens.access;
    if (token) headers.authorization = `Bearer ${token}`;
    void fetch(`${apiBaseUrl}/v1/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, props, platform }),
      // Let the request survive a navigation / the app being backgrounded.
      keepalive: true,
    }).catch(() => {});
  } catch { /* never let analytics throw into the caller */ }
}
