import Capacitor
import UIKit

/**
 * Direct save-to-Photos plugin. Uses Apple's oldest, simplest, most
 * forgiving photo-save API: `UIImageWriteToSavedPhotosAlbum`.
 *
 * Why this over `PHPhotoLibrary.shared().performChanges`:
 *   • Handles the system permission prompt automatically (we still need
 *     `NSPhotoLibraryAddUsageDescription` in Info.plist, but no explicit
 *     `requestAuthorization` call).
 *   • Single selector callback for completion. PHPhotoLibrary dispatches
 *     on an arbitrary queue and has a longer failure surface.
 *   • Works identically on every iOS version we support.
 *
 * Registration: `@objc(SavePhotoPlugin)` + `CAPBridgedPlugin` declarations
 * are picked up by Capacitor's bridge BOTH via the synced
 * `packageClassList` (see scripts/register-local-plugins.mjs) AND by the
 * explicit `bridge.registerPluginInstance` call in MainViewController.
 * Either path on its own is sufficient.
 */
@objc(SavePhotoPlugin)
public class SavePhotoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SavePhotoPlugin"
    public let jsName = "SavePhoto"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
    ]

    // UIImageWriteToSavedPhotosAlbum delivers its result through a selector
    // callback on an unrelated runloop. Stash the in-flight Capacitor call
    // so the callback can resolve / reject the right JS promise.
    private var pendingCall: CAPPluginCall?

    override public func load() {
        // Visible in Xcode console as soon as the bridge instantiates the
        // plugin. If you don't see this line at app launch, plugin
        // registration didn't happen and nothing else will work.
        print("[SavePhotoPlugin] load — plugin registered, jsName=\(jsName)")
    }

    @objc func save(_ call: CAPPluginCall) {
        print("[SavePhotoPlugin] save called")
        guard let base64 = call.getString("base64") else {
            print("[SavePhotoPlugin] reject: missing base64")
            call.reject("Missing base64 image data")
            return
        }
        // Tolerate a `data:image/jpeg;base64,XXX` prefix so the JS side can
        // pass either raw base64 or a full data URL without branching.
        let payload: String
        if let commaIdx = base64.firstIndex(of: ",") {
            payload = String(base64[base64.index(after: commaIdx)...])
        } else {
            payload = base64
        }
        guard let data = Data(base64Encoded: payload) else {
            print("[SavePhotoPlugin] reject: base64 decode failed")
            call.reject("Base64 could not be decoded")
            return
        }
        guard let image = UIImage(data: data) else {
            print("[SavePhotoPlugin] reject: UIImage(data:) returned nil (size=\(data.count))")
            call.reject("Image data could not be decoded into a UIImage")
            return
        }
        print("[SavePhotoPlugin] decoded image \(Int(image.size.width))x\(Int(image.size.height)), data \(data.count) bytes")

        pendingCall = call
        DispatchQueue.main.async {
            // UIImageWriteToSavedPhotosAlbum requires NSPhotoLibraryAddUsage
            // Description in Info.plist. iOS shows the permission prompt
            // automatically on the first call; subsequent calls are silent.
            UIImageWriteToSavedPhotosAlbum(
                image,
                self,
                #selector(SavePhotoPlugin.handleSaveResult(_:didFinishSavingWithError:contextInfo:)),
                nil
            )
        }
    }

    @objc func handleSaveResult(
        _ image: UIImage,
        didFinishSavingWithError error: NSError?,
        contextInfo: UnsafeRawPointer
    ) {
        let call = pendingCall
        pendingCall = nil
        if let error = error {
            print("[SavePhotoPlugin] save failed: \(error.localizedDescription) (code=\(error.code))")
            call?.reject(error.localizedDescription, String(error.code))
        } else {
            print("[SavePhotoPlugin] saved successfully")
            call?.resolve()
        }
    }
}
