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
  | 'join' | 'host_offer' | 'host_taken' | 'ping' | 'invite' | 'reminder';

export interface AppNotification {
  id: string;
  type: NotificationType;
  fromId: string;
  activityId?: string;
  text: string;
  at: number;
  read: boolean;
  resolved?: boolean;
}

export interface AppSettings {
  pushEnabled: boolean;
  pingsEnabled: boolean;
  defaultReminderMins: number | null;
}
