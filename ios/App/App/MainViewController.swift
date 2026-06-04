import Capacitor

/**
 * App-local Capacitor view controller. Subclassing `CAPBridgeViewController`
 * is the only way to register a plugin that lives in the App target instead
 * of an SPM-installed npm package.
 *
 * Why this is needed: Capacitor's iOS bridge only auto-registers plugins
 * whose class names appear in `packageClassList` in the synced
 * `capacitor.config.json`. That list is computed by `cap sync` from the
 * installed `node_modules`, so a local class — even one decorated with
 * `@objc(Foo)` and conforming to `CAPBridgedPlugin` — is invisible to the
 * bridge unless we hand-register it. Without this, `registerPlugin<...>`
 * on the JS side resolves to a proxy that reports "implementation not
 * available" the moment you call any method.
 *
 * The storyboard's root scene is bound to this class via Main.storyboard's
 * customClass / customModule attributes.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // `bridge` is guaranteed non-nil inside capacitorDidLoad. We
        // explicitly register every local plugin instance here as a
        // belt-and-braces alongside the packageClassList injection in
        // scripts/register-local-plugins.mjs; either path on its own is
        // sufficient, having both means a hand-clean of capacitor.config.json
        // doesn't accidentally disable our plugins.
        bridge?.registerPluginInstance(SavePhotoPlugin())
        bridge?.registerPluginInstance(AddToCalendarPlugin())
    }
}
