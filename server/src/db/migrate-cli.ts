/**
 * Standalone migration runner — `npm run migrate`.
 *
 * The app also migrates on boot, but running this as a discrete step lets a
 * deploy pipeline apply schema changes before swapping in the new app version.
 */
import { closeDb, migrate } from './index.js';

migrate();
closeDb();
