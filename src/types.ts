export type CategoryKey =
  | 'surf' | 'gym' | 'run' | 'gaming' | 'food' | 'drinks'
  | 'coffee' | 'study' | 'movie' | 'outdoors' | 'party' | 'other'
  | 'custom';  // user-defined; relies on Activity.customEmoji / customLabel

export interface Category {
  key: CategoryKey;
  label: string;
  emoji: string;
  gradient: string; // tailwind class for gradient
}

export interface Squad {
  id: string;
  name: string;
  emoji: string;
  /** Who created/runs the squad. Only the host can edit, add/remove others, or delete. */
  hostId: string;
  /** Squad members — does NOT include the host. */
  memberIds: string[];
  /** Per-squad chat. Reuses ChatMessage so text / photos / polls all work. */
  chat: ChatMessage[];
  createdAt: number;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;     // emoji avatar — used when no photo is set
  color: string;      // tailwind bg gradient — backdrop for emoji avatars
  photoUrl?: string;  // optional uploaded photo — absolute URL served by the API
  /** Firebase Auth has verified the user owns their email. Always true for
   *  OAuth signups; false for new email signups until they click the link. */
  emailVerified?: boolean;
  /** Normalized E.164 phone (e.g. +27821234567). ONLY populated on the
   *  current user (the `me` profile) — the server omits it from every other
   *  user serialization, so this field is reliably blank for friends/
   *  joiners/etc. Used for contact-match opt-in. */
  phone?: string;
}

export type ChatMessageType = 'text' | 'photo' | 'poll';

export interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface ChatMessage {
  id: string;
  authorId: string;     // 'system' for system messages
  at: number;
  type?: ChatMessageType;   // defaults to 'text' if absent (back-compat with system msgs)
  text?: string;            // text body, or photo caption
  photoUrl?: string;        // when type === 'photo'
  poll?: {                  // when type === 'poll'
    question: string;
    options: PollOption[];
    closed?: boolean;
  };
}

export interface Reaction {
  emoji: string;
  userId: string;
  at: number;
}

export type Recurrence =
  | { freq: 'daily' }
  | { freq: 'weekly';   weekday: number }   // 0 = Sun … 6 = Sat
  | { freq: 'biweekly'; weekday: number };

export interface Activity {
  id: string;
  hostId: string;
  recurrence?: Recurrence;
  category: CategoryKey;
  // When category === 'custom', these provide the displayed emoji + label.
  customEmoji?: string;
  customLabel?: string;
  title: string;
  place: string;
  reactions: Reaction[];
  /** Optional event banner — replaces the category gradient in card + detail hero. */
  bannerUrl?: string;
  startsAt: number;     // epoch ms
  /** When the activity ends. Activities are "live" when now ∈ [startsAt, endsAt]. */
  endsAt: number;       // epoch ms
  description: string;
  // RSVPs (none of these include the host). A user appears in at most one list.
  joinerIds: string[];  // "going"
  maybeIds: string[];
  cantIds: string[];
  maxSize?: number;     // undefined = unlimited
  isPrivate: boolean;   // private = only direct friends can see (no FoF unlock)
  /**
   * Squads this plan is tagged with. Each tagged squad shows the plan in its
   * Plans/History tabs. May be empty.
   */
  squadIds: string[];
  /**
   * When true, the plan is visible to all friends (+ FoF unless isPrivate) in
   * addition to any tagged squads. When false, it's squad-only — visible only
   * to host + members of the tagged squad(s).
   */
  isOpenInvite: boolean;
  /**
   * Per-plan reminder lead time in minutes.
   *   undefined = use settings.defaultReminderMins
   *   null      = explicitly off for this plan
   *   number    = override (e.g. 15, 60)
   */
  reminderMins?: number | null;
  createdAt: number;
  chat: ChatMessage[];
}

export type NotificationType =
  | 'join'             // someone joined your activity
  | 'host_offer'       // you've been offered the host role
  | 'host_taken'       // someone else accepted host (informational)
  | 'ping'             // friend pinged the squad
  | 'invite'           // friend-of-friend visibility unlocked
  | 'reminder'         // your joined plan is starting soon
  | 'float_received'   // a friend floated a soft proposal to you
  | 'float_keen'       // someone is keen on your float
  | 'float_locked'     // a float you were keen on became a real plan
  | 'activity_created' // a friend posted a plan (or went live)
  | 'chat_message';    // new chat in an activity you're a participant of

export interface AppNotification {
  id: string;
  type: NotificationType;
  fromId: string;
  activityId?: string;
  /** Set for float_* notifications so the card can deep-link into the float. */
  floatId?: string;
  text: string;
  at: number;
  read: boolean;
  // Action state for host_offer
  resolved?: boolean;
}

/* ---- floats ---- */

export type FloatResponseState = 'keen' | 'maybe' | 'nah';

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
  /** Set once the sender locks the float into a real activity. */
  lockedIntoActivityId?: string;
}
