import { motion } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../store';

interface Props {
  /** Absolute URL of the image to display. `null` keeps the viewer closed. */
  src: string | null;
  onClose: () => void;
}

/**
 * Full-screen image viewer with a save action. Renders nothing when `src`
 * is null, so callers can wire it as a sibling and just flip a state value.
 *
 * Saving:
 *   • Native iOS / Capacitor: uses `navigator.share({ files })`. The system
 *     share sheet includes "Save Image" — same UX the user sees on Photos /
 *     Messages.
 *   • Web (Safari / Chrome that don't support file share): falls back to
 *     opening the image in a new tab so the user can long-press → save.
 *   • Worst case: a toast tells them to long-press.
 *
 * Dismissal: tap the backdrop, tap the X, or press Escape.
 */
export function ImageViewer({ src, onClose }: Props) {
  const pushToast = useApp(s => s.pushToast);
  const [saving, setSaving] = useState(false);

  // Esc closes.
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;

  const save = async () => {
    setSaving(true);
    try {
      const { Capacitor } = await import('@capacitor/core');

      if (Capacitor.isNativePlatform()) {
        // Three Capacitor primitives chained — all existing plugins:
        //   1. downloadFile  → fetch bytes natively (URLSession on iOS,
        //                       OkHttp on Android). Bypasses the WebView
        //                       CORS check that was rejecting fetch().
        //   2. readFile      → read those bytes back as base64.
        //   3. SavePhoto.save → our native plugin calls
        //                       PHPhotoLibrary.shared().performChanges with
        //                       PHAssetChangeRequest.creationRequestForAsset(from:),
        //                       which is the canonical Apple pattern.
        const fileName = `wud-photo-${Date.now()}.jpg`;
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.downloadFile({
          url: src,
          path: fileName,
          directory: Directory.Cache,
        });
        // Pass the same `path` + `directory` pair both writes and reads
        // accept. The earlier attempt threaded downloadFile's returned full
        // URI back through with `directory: Cache`, so readFile tried to
        // resolve it under Cache/Cache/... and missed.
        const { data } = await Filesystem.readFile({
          path: fileName,
          directory: Directory.Cache,
        });
        const base64 = typeof data === 'string'
          ? data
          // readFile may return a Blob on web; convert it the standard
          // FileReader way. On native this branch never runs.
          : await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onerror = () => reject(r.error);
              r.onload = () => {
                const s = String(r.result);
                const i = s.indexOf(',');
                resolve(i >= 0 ? s.slice(i + 1) : s);
              };
              r.readAsDataURL(data);
            });
        const { SavePhoto } = await import('../lib/save-photo');
        await SavePhoto.save({ base64, mime: 'image/jpeg' });
        pushToast('Saved to your photos', 'success');
        return;
      }

      // Web fallback — try the Web Share API for desktop browsers that
      // support file share, otherwise open in a new tab so the user can
      // long-press / right-click → Save.
      const canShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function';
      if (canShareFiles) {
        const res = await fetch(src);
        const blob = await res.blob();
        const ext = blob.type.split('/')[1] ?? 'jpg';
        const file = new File([blob], `wud-photo.${ext}`, { type: blob.type });
        if (navigator.canShare!({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      }
      window.open(src, '_blank', 'noopener,noreferrer');
      pushToast('Long-press the image to save it', 'default');
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      const msg = (e as { message?: string } | null)?.message ?? '';
      // Share-sheet cancel isn't a real error — the user just dismissed.
      if (name === 'AbortError' || /cancel/i.test(msg)) return;
      console.error('[ImageViewer] save failed:', e);
      pushToast(msg ? `Save failed: ${msg.slice(0, 60)}` : 'Could not save image', 'warn');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] bg-black/95 grid place-items-center"
      onClick={onClose}
    >
      {/* Stop bubbling so taps on the image / chrome don't close the viewer. */}
      <motion.img
        src={src}
        alt=""
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] object-contain rounded-2xl select-none"
        draggable={false}
      />

      {/* Close — top right, large tap target. */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-status right-4 h-10 w-10 rounded-full grid place-items-center
                   bg-white/10 backdrop-blur text-white hover:bg-white/20 transition"
      >
        <X size={20} />
      </button>

      {/* Save — bottom right, gradient pill. */}
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={e => { e.stopPropagation(); void save(); }}
        disabled={saving}
        className="absolute bottom-8 right-4 inline-flex items-center gap-2
                   px-4 py-2.5 rounded-full text-sm font-bold text-white
                   bg-gradient-to-br from-rose-500 to-orange-500
                   shadow-[0_18px_40px_-14px_rgba(244,63,94,0.6)]
                   disabled:opacity-60"
      >
        <Download size={14} />
        {saving ? 'Saving…' : 'Save'}
      </motion.button>
    </motion.div>
  );
}
