import Capacitor
import EventKit
import EventKitUI
import UIKit

/**
 * Direct "open my calendar app with a prefilled event" plugin. Bypasses
 * the system share sheet (which surfaces "Add to Calendar" as one row
 * among dozens, costing taps and reading as unprofessional).
 *
 * Flow:
 *   1. Request write-only Calendars access (iOS 17+ exposes a narrower
 *      permission than the legacy full-access `.event` scope; we use it
 *      where available so reviewers see the right prompt copy).
 *   2. Build an EKEvent with the activity's title / time / place / notes.
 *   3. Present EKEventEditViewController — the native Apple Calendar UI
 *      the user already knows, with Save / Cancel buttons. Save commits
 *      to the user's default calendar; Cancel drops the event.
 *
 * Info.plist requires NSCalendarsWriteOnlyAccessUsageDescription (iOS 17+)
 * and NSCalendarsUsageDescription (iOS 16-) — both added when this plugin
 * was wired up.
 */
@objc(AddToCalendarPlugin)
public class AddToCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "AddToCalendarPlugin"
    public let jsName = "AddToCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    ]

    // EKEventEditViewController completes asynchronously via the delegate
    // callback; we have to hold the in-flight JS call here so we can
    // resolve/reject it once the user taps Save or Cancel.
    private var pendingCall: CAPPluginCall?

    @objc func open(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Plan"
        let description = call.getString("description")
        let location = call.getString("location")
        let urlString = call.getString("url")
        // Times are passed from JS as epoch milliseconds (Date.now() compatible).
        let startsAt = call.getDouble("startsAt") ?? 0
        let endsAt = call.getDouble("endsAt") ?? startsAt

        let store = EKEventStore()
        requestWriteAccess(store: store) { [weak self] granted in
            guard let self = self else { return }
            if !granted {
                call.reject("Calendar permission denied", "PERMISSION_DENIED")
                return
            }
            DispatchQueue.main.async {
                self.presentEditor(
                    store: store,
                    call: call,
                    title: title,
                    description: description,
                    location: location,
                    urlString: urlString,
                    startsAt: startsAt,
                    endsAt: endsAt
                )
            }
        }
    }

    /// Request write-only on iOS 17+ (narrower; matches what we actually do),
    /// fall back to the legacy full-access request on older versions. Both
    /// route through the OS permission prompt that reads from Info.plist.
    private func requestWriteAccess(store: EKEventStore, done: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            store.requestWriteOnlyAccessToEvents { granted, _ in
                done(granted)
            }
        } else {
            store.requestAccess(to: .event) { granted, _ in
                done(granted)
            }
        }
    }

    private func presentEditor(
        store: EKEventStore,
        call: CAPPluginCall,
        title: String,
        description: String?,
        location: String?,
        urlString: String?,
        startsAt: Double,
        endsAt: Double
    ) {
        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = Date(timeIntervalSince1970: startsAt / 1000.0)
        event.endDate = Date(timeIntervalSince1970: endsAt / 1000.0)
        if let location = location, !location.isEmpty {
            event.location = location
        }
        // Notes get the description AND the deep link (if any) so a user
        // tapping the event in Calendar can jump back into the app.
        let notes: String
        switch (description, urlString) {
        case let (d?, u?) where !d.isEmpty && !u.isEmpty: notes = "\(d)\n\n\(u)"
        case let (d?, _)  where !d.isEmpty:               notes = d
        case let (_, u?)  where !u.isEmpty:               notes = u
        default:                                          notes = ""
        }
        if !notes.isEmpty { event.notes = notes }
        if let u = urlString, !u.isEmpty, let parsed = URL(string: u) {
            event.url = parsed
        }

        let editor = EKEventEditViewController()
        editor.event = event
        editor.eventStore = store
        editor.editViewDelegate = self
        // Use the form-sheet style on iPad so the editor doesn't fill the
        // screen edge to edge; iPhone always full-screen.
        editor.modalPresentationStyle = .formSheet
        pendingCall = call

        guard let presenter = bridge?.viewController else {
            call.reject("No view controller to present from")
            pendingCall = nil
            return
        }
        presenter.present(editor, animated: true)
    }

    public func eventEditViewController(
        _ controller: EKEventEditViewController,
        didCompleteWith action: EKEventEditViewAction
    ) {
        let call = pendingCall
        pendingCall = nil
        controller.dismiss(animated: true) {
            // `.saved` → user tapped Add. `.canceled`/`.deleted` → bailed.
            // We resolve with a small flag so JS can show different toasts
            // for "added" vs "skipped" without needing a second call.
            switch action {
            case .saved:
                call?.resolve(["saved": true])
            case .canceled, .deleted:
                call?.resolve(["saved": false])
            @unknown default:
                call?.resolve(["saved": false])
            }
        }
    }
}
