import { useEffect, useRef } from 'react';
import { effectiveReminderMins, useApp } from '../store';

/**
 * Polls every 30s. For each upcoming plan the user is going to (or hosting),
 * if it's currently within its reminder window AND we haven't notified yet,
 * fire the reminder (notification + toast). Tracks fired IDs in a ref so each
 * plan only reminds once per page session.
 */
export function ReminderEngine() {
  // Read these as actions only — no subscription churn from selectors.
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      const s = useApp.getState();
      // Respect the master push toggle.
      if (!s.settings.pushEnabled) return;

      const now = Date.now();
      const defLead = s.settings.defaultReminderMins;
      for (const a of s.activities) {
        if (firedRef.current.has(a.id)) continue;
        if (a.startsAt <= now) continue;                          // already started
        const involved = a.hostId === s.meId || a.joinerIds.includes(s.meId);
        if (!involved) continue;
        const lead = effectiveReminderMins(a, defLead);
        if (lead === null) continue;                              // reminders off
        const window = a.startsAt - lead * 60 * 1000;
        if (now < window) continue;                               // too early
        // We're inside the reminder window.
        firedRef.current.add(a.id);
        s.fireReminder(a.id);
      }
    };

    // Check once on mount, then every 30s.
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
