package app.wud.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Open the user's calendar app at the "new event" screen with the activity
 * already filled in. Bypasses Capacitor Share's generic .ics handoff
 * (which surfaces "Add to Calendar" as one row among many, costing taps).
 *
 * Implementation:
 *   • Fire ACTION_INSERT against CalendarContract.Events. Every Android
 *     calendar app (Google Calendar, Samsung Calendar, AOSP Calendar)
 *     registers an IntentFilter for this and presents the new-event UI
 *     prefilled from the extras we pass.
 *   • No runtime permission needed — we're handing the request to the
 *     calendar app's own UI, which manages its own permissions.
 *
 * Mirrors the iOS counterpart at ../../ios/App/App/AddToCalendarPlugin.swift.
 */
@CapacitorPlugin(name = "AddToCalendar")
public class AddToCalendarPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String title    = call.getString("title", "Plan");
        String desc     = call.getString("description");
        String location = call.getString("location");
        String url      = call.getString("url");
        // Times come from JS as epoch milliseconds, matching the Date.now()
        // shape used elsewhere in the app.
        Long startsAt = call.getLong("startsAt", 0L);
        Long endsAt   = call.getLong("endsAt",   startsAt);

        Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startsAt)
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endsAt);

        // Bundle description + deep link into the notes field so a user
        // tapping the event in their calendar can jump back into the app.
        StringBuilder notes = new StringBuilder();
        if (desc != null && !desc.isEmpty()) notes.append(desc);
        if (url != null && !url.isEmpty()) {
            if (notes.length() > 0) notes.append("\n\n");
            notes.append(url);
        }
        if (notes.length() > 0) {
            intent.putExtra(CalendarContract.Events.DESCRIPTION, notes.toString());
        }
        if (location != null && !location.isEmpty()) {
            intent.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
        }

        try {
            // Capacitor plugins inherit the host Activity context; starting
            // the intent from there means no FLAG_ACTIVITY_NEW_TASK is
            // required and the calendar app stacks naturally on top of WUD.
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            // Android's ACTION_INSERT doesn't tell us whether the user saved
            // or cancelled (no callback), so resolve optimistically. The JS
            // side treats this as "the editor was opened" rather than
            // "the event was saved" — matches user expectation.
            result.put("saved", true);
            call.resolve(result);
        } catch (ActivityNotFoundException e) {
            call.reject("No calendar app available", "NO_CALENDAR_APP");
        }
    }
}
