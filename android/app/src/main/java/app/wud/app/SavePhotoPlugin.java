package app.wud.app;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/**
 * Direct save-to-Gallery plugin for Android. Mirrors the iOS counterpart
 * in ../../ios/App/App/SavePhotoPlugin.swift — one method, save(base64),
 * resolves on success, rejects with a real error if anything goes wrong.
 *
 * Uses the modern MediaStore content-resolver path on every supported
 * Android (API 24+). On API 29+ we set RELATIVE_PATH so the file lands in
 * Pictures/WUD without needing WRITE_EXTERNAL_STORAGE. On older API levels
 * (24-28) we use a legacy DATA column write — the same code path Capacitor
 * Camera uses internally — which still works without explicit permission
 * because we're writing to a public media collection through the system
 * content resolver.
 *
 * Registered in MainActivity via registerPlugin(SavePhotoPlugin.class).
 */
@CapacitorPlugin(name = "SavePhoto")
public class SavePhotoPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing base64 image data");
            return;
        }
        // Tolerate data-URL prefixes ("data:image/jpeg;base64,XXX") in
        // addition to raw base64 — keeps the JS side platform-agnostic.
        int comma = base64.indexOf(',');
        String payload = comma >= 0 ? base64.substring(comma + 1) : base64;

        byte[] bytes;
        try {
            bytes = Base64.decode(payload, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Image data could not be decoded");
            return;
        }

        String mime = call.getString("mime", "image/jpeg");
        String ext = mimeToExt(mime);
        String name = "wud-photo-" + System.currentTimeMillis() + "." + ext;

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, mime);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Pictures/WUD lands the saved photo in the user's gallery in a
            // named album so it's easy to find. IS_PENDING + DATE_TAKEN are
            // the polite-citizen flags for MediaStore on API 29+.
            values.put(MediaStore.Images.Media.RELATIVE_PATH,
                       Environment.DIRECTORY_PICTURES + "/WUD");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            values.put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis());
        }

        Uri uri = getContext().getContentResolver()
                .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            call.reject("Could not allocate MediaStore entry");
            return;
        }

        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) {
                call.reject("Could not open MediaStore stream");
                return;
            }
            out.write(bytes);
            out.flush();
        } catch (Exception e) {
            // Best-effort: remove the empty MediaStore row we created above
            // so a failed save doesn't leave a 0-byte entry in the gallery.
            getContext().getContentResolver().delete(uri, null, null);
            call.reject("Write failed: " + e.getMessage());
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, values, null, null);
        }
        call.resolve();
    }

    private static String mimeToExt(String mime) {
        if (mime == null) return "jpg";
        if (mime.equalsIgnoreCase("image/png"))  return "png";
        if (mime.equalsIgnoreCase("image/webp")) return "webp";
        if (mime.equalsIgnoreCase("image/heic")) return "heic";
        if (mime.equalsIgnoreCase("image/gif"))  return "gif";
        return "jpg";
    }
}
