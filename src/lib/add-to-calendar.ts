import { registerPlugin } from '@capacitor/core';

/**
 * Bridge to the AddToCalendar native plugin.
 *
 *   iOS  → ios/App/App/AddToCalendarPlugin.swift (uses EKEventEditViewController)
 *   Android → android/app/src/main/java/app/wud/app/AddToCalendarPlugin.java
 *           (uses Intent.ACTION_INSERT on CalendarContract.Events)
 *
 * Both routes the user straight into the system calendar's new-event UI
 * with the activity fields prefilled — no share-sheet middle step.
 *
 * Times are passed as epoch milliseconds (matching `Date.now()`).
 */
export interface AddToCalendarPlugin {
  open(opts: {
    title: string;
    description?: string;
    location?: string;
    startsAt: number;
    endsAt: number;
    url?: string;
  }): Promise<{ saved: boolean }>;
}

export const AddToCalendar = registerPlugin<AddToCalendarPlugin>('AddToCalendar');
