import { registerPlugin } from '@capacitor/core';

/**
 * Bridge to the SavePhoto Capacitor plugin (Swift on iOS,
 * Java on Android — see ios/App/App/SavePhotoPlugin.swift and
 * android/app/src/main/java/app/wud/app/SavePhotoPlugin.java).
 *
 * One method: hand it base64 image bytes and it writes them to the user's
 * Photos library (iOS) / Gallery (Android). Resolves on success, rejects
 * with a real error message if the platform refuses.
 */
export interface SavePhotoPlugin {
  save(opts: { base64: string; mime?: string }): Promise<void>;
}

export const SavePhoto = registerPlugin<SavePhotoPlugin>('SavePhoto');
