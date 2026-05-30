/**
 * API-facing domain types. These mirror the client's `src/types.ts` so the
 * server can serialize directly to shapes the React app already understands.
 */

export type CategoryKey =
  | 'surf' | 'gym' | 'run' | 'gaming' | 'food' | 'drinks'
  | 'coffee' | 'study' | 'movie' | 'outdoors' | 'party' | 'other' | 'custom';

export type RsvpState = 'going' | 'maybe' | 'cant';

export interface PublicUser {
  id: string;
  name: string;
  handle: string;
  avatar: string;          // emoji avatar
  color: string;
  photoUrl?: string;
  /** True once Firebase Auth has confirmed the user owns their email. Always
   *  true for OAuth (Apple/Google) signups; false for new email signups until
   *  they click the verification link. */
  emailVerified?: boolean;
  /** E.164 phone number (e.g. +27821234567). ONLY populated when the row is
   *  the requester's own profile (the /me endpoint). The public-facing
   *  serializer (toPublicUser) deliberately omits it so phone numbers never
   *  leak through user lookups, friend lists, or activity payloads. */
  phone?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
  at: number;
}

export interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface ChatMessage {
  id: string;
  authorId: string;        // 'system' for system messages
  at: number;
  type?: 'text' | 'photo' | 'poll';
  text?: string;
  photoUrl?: string;
  poll?: { question: string; options: PollOption[]; closed?: boolean };
}

export type Recurrence =
  | { freq: 'daily' }
  | { freq: 'weekly'; weekday: number }
  | { freq: 'biweekly'; weekday: number };

export interface Activity {
  id: string;
  hostId: string;
  category: CategoryKey;
  customEmoji?: string;
  customLabel?: string;
  title: string;
  place: string;
  description: string;
  startsAt: number;
  /**
   * When the activity ends. Anything live now satisfies
   * `startsAt <= now <= endsAt`. Set on every new activity (chips for
   * "Happening now" mode, picker for scheduled mode).
   */
  endsAt: number;
  joinerIds: string[];
  maybeIds: string[];
  cantIds: string[];
  maxSize?: number;
  isPrivate: boolean;
  squadIds: string[];
  isOpenInvite: boolean;
  reminderMins?: number | null;
  reactions: Reaction[];
  bannerUrl?: string;
  recurrence?: Recurrence;
  createdAt: number;
  chat: ChatMessage[];
}

export interface Squad {
  id: string;
  name: string;
  emoji: string;
  hostId: string;
  memberIds: string[];
  chat: ChatMessage[];
  createdAt: number;
}

export type NotificationType =
  | 'join' | 'host_offer' | 'host_taken' | 'ping' | 'invite' | 'reminder'
  | 'float_received' | 'float_keen' | 'float_locked'
  // Friend posted a new plan you can see. Includes the "going live" case
  // (activity created with starts_at ≈ now); the body line differentiates.
  | 'activity_created'
  // New chat message in an activity or squad you're a participant of.
  // Fans to the other participants only — sender is muted on their own send.
  | 'chat_message'
  // The person you sent a friend request to has accepted it.
  | 'friend_accepted'
  // The host edited a plan you're going to (start time, end time, or place).
  | 'activity_updated'
  // A plan you were part of was cancelled — host left without a successor.
  | 'activity_cancelled';

export interface AppNotification {
  id: string;
  type: NotificationType;
  fromId: string;
  activityId?: string;
  floatId?: string;
  text: string;
  at: number;
  read: boolean;
  resolved?: boolean;
}

export interface AppSettings {
  /** Master push switch — when false, dispatchPush is a no-op for every type. */
  pushEnabled: boolean;
  /** Per-category push toggles (only consulted when pushEnabled is true).
   *  In-app notifications in the Alerts tab are always created; these flags
   *  only gate the lock-screen push delivery, so the user can still see the
   *  event history without being interrupted. */
  notifyJoins: boolean;
  notifyChat: boolean;
  notifyFloats: boolean;
  notifyReminders: boolean;
  /** Whether friends can ping you with a "WUD?" prompt. */
  pingsEnabled: boolean;
  /** Whether anyone can send you a friend request. When false, /v1/friends/request
   *  responds 403 with a generic message and creates no record. */
  allowFriendRequests: boolean;
  defaultReminderMins: number | null;
}

/* ---- floats (soft proposals before plans) ---- */

export type FloatResponseState = 'keen' | 'maybe' | 'nah';

/** Rough timing bucket — narrows the lock-in default but isn't binding. */
export type FloatTiming = 'today' | 'tomorrow' | 'weekend' | 'whenever';

export interface FloatResponse {
  userId: string;
  state: FloatResponseState;
  at: number;
}

export interface Float {
  id: string;
  senderId: string;
  question: string;
  emoji?: string;
  place?: string;
  timing?: FloatTiming;
  isOpenInvite: boolean;
  isPrivate: boolean;
  squadIds: string[];
  responses: FloatResponse[];
  createdAt: number;
  expiresAt: number;
  /** When the sender locked this float into a real activity, the activity's id. */
  lockedIntoActivityId?: string;
}
