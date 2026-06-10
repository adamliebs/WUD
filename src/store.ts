import { create } from 'zustand';
import { categoryFor } from './data/categories';
import type { Activity, AppNotification, CategoryKey, ChatMessage, Float, FloatResponseState, FloatTiming, Recurrence, Squad, User } from './types';
import { ApiError, tokens } from './api/client';
import {
  activityApi, authApi, chatApi, floatApi, getBootstrap, meApi, miscApi, safetyApi, socialApi, uploadApi,
} from './api/endpoints';
import {
  connectRealtime, disconnectRealtime, type RealtimeEvent,
  subscribeChannel,
} from './api/socket';
import { notify, registerPushAfterAuth } from './native';

const uid = () => Math.random().toString(36).slice(2, 10);

/** localStorage key remembering that the user has already seen the swipe-
 *  through tutorial. Per-device — a fresh install replays it, which we
 *  consider a feature (the device is "new" to that user). Exported so App.tsx
 *  can read it without duplicating the key string. */
export const TUTORIAL_SEEN_KEY = 'wud:has-seen-tutorial';
export function hasSeenTutorial(): boolean {
  try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1'; } catch { return true; }
}

/** Per-tab last-viewed timestamps, persisted to localStorage so the unseen
 *  badges survive an app restart. Updated when the user opens the matching
 *  tab; selectors count items created after this timestamp. */
const TAB_SEEN_PREFIX = 'wud:tab-seen:';
function readTabSeen(tab: 'feed' | 'floats'): number {
  try {
    const raw = localStorage.getItem(TAB_SEEN_PREFIX + tab);
    if (raw) return Number(raw) || 0;
    // First time we look at this device — seed with now so a fresh install
    // doesn't badge every existing plan that lands during the cold-boot
    // bootstrap. The user will see badges for content arriving AFTER this.
    const seed = Date.now();
    localStorage.setItem(TAB_SEEN_PREFIX + tab, String(seed));
    return seed;
  } catch { return Date.now(); }
}
function writeTabSeen(tab: 'feed' | 'floats', ts: number): void {
  try { localStorage.setItem(TAB_SEEN_PREFIX + tab, String(ts)); } catch { /* private mode */ }
}

type Tab = 'feed' | 'floats' | 'notifications' | 'profile';
type FeedScope = 'friends' | 'fof';
/** Top-level app screen — splash → welcome → auth → onboarding → main app. */
export type AuthState = 'splash' | 'welcome' | 'auth' | 'onboarding' | 'verifyEmail' | 'app';

/**
 * What happens when a For You digest is tapped. Filter cards apply a feed
 * filter and scroll the user to the results; "open" cards jump straight into
 * a specific activity — used when the card is really about one concrete plan
 * (or a single primary plan that the digest is built around).
 */
export type SuggestionTap =
  | { action: 'filter'; apply: Partial<FeedFilters> }
  | { action: 'open';   activityId: string };

/**
 * A "For you" digest card shown above the Feed. Kinds are ordered by priority
 * in smartSuggestions() — earlier kinds win when the strip is full.
 */
export type Suggestion =
  | { kind: 'morning_pulse';    count: number; friendsGoing: number; emoji: '🌅'; text: string; tap: SuggestionTap }
  | { kind: 'big_night';        nightLabel: string; friendsGoing: number; emoji: '🔥'; text: string; tap: SuggestionTap }
  | { kind: 'starting_soon';    count: number; emoji: '⏰'; text: string; tap: SuggestionTap }
  | { kind: 'category_cluster'; category: CategoryKey; count: number; emoji: string; text: string; tap: SuggestionTap };

/** Discovery filters applied to the Feed (above the existing scope toggle). */
export interface FeedFilters {
  category?: CategoryKey;
  /**
   * When category is 'custom', optionally narrow further to a specific
   * customLabel — lets the dropdown surface each user-defined category
   * (e.g. "Pickleball") as its own filter, instead of one bucket called
   * "Custom" that matches every user-defined activity.
   */
  customLabel?: string;
  timeWindow: 'now' | 'today' | 'week' | 'all';
  /**
   * Result ordering. 'soonest' is the default chronological list; 'popular'
   * promotes plans with the most people going (host + joiners), tiebreaking
   * back to soonest so two equally-popular plans stay ordered by start time.
   */
  sort: 'soonest' | 'popular';
  /**
   * Include currently-live activities in the main feed list. False by default
   * — they're already in the LiveNowStrip above, so listing them twice is
   * redundant. Toggled on by the "Show live in feed" pill, and also flipped
   * on automatically when a For You filter shortcut fires so a "3 coffee
   * plans today" tap reveals every matching plan, live or not.
   */
  includeLive?: boolean;
}

/** A category entry derived from the visible feed pool — used to populate the
 *  Category dropdown so it only ever offers options that have plans. */
export interface AvailableCategory {
  /** Filter key — 'custom' for user-defined entries, the CategoryKey otherwise. */
  key: CategoryKey;
  /** When key === 'custom', the specific custom label this entry stands for. */
  customLabel?: string;
  emoji: string;
  label: string;
  /** Plan count behind this entry — drives sort order in the dropdown. */
  count: number;
}

type Overlay = 'settings' | 'editProfile' | 'friends' | 'history' | 'squads' | 'search' | null;
/** A user's RSVP for an activity. 'none' = cleared. */
export type RsvpState = 'going' | 'maybe' | 'cant' | 'none';

export interface AppSettings {
  pushEnabled: boolean;
  notifyJoins: boolean;
  notifyChat: boolean;
  notifyFloats: boolean;
  notifyReminders: boolean;
  pingsEnabled: boolean;
  allowFriendRequests: boolean;
  defaultReminderMins: number | null;
}

interface Toast {
  id: string;
  text: string;
  tone?: 'default' | 'success' | 'warn';
}

/**
 * Stashed credentials waiting for onboarding to complete the signup. Either
 * an email/password pair (the user typed them but hasn't picked a handle yet)
 * or a verified Firebase ID token from an OAuth provider that needs DOB +
 * handle before we can create the WUD user.
 */
type PendingSignup =
  | { kind: 'email'; email: string; password: string }
  | { kind: 'firebase'; idToken: string; provider: 'apple' | 'google' | 'email'; suggestedName?: string; email?: string };

interface State {
  // identity / social graph
  meId: string;
  users: User[];
  friendIds: string[];

  // domain
  activities: Activity[];
  floats: Float[];
  notifications: AppNotification[];
  squads: Squad[];

  // UI
  tab: Tab;
  openActivityId: string | null;
  showPostSheet: boolean;
  /** Optional initial audience config consumed by PostSheet on its next
   *  open. Set by `openPostSheetForSquad` (the + button inside a squad's
   *  Plans tab) so the sheet starts in "Squads only" mode with just that
   *  squad selected. PostSheet clears it once read. */
  postSheetInit: { squadIds: string[]; openInvite: boolean } | null;
  feedScope: FeedScope;
  overlay: Overlay;
  /** When the Squads overlay opens, jump straight to this squad's detail
   *  page instead of the squads list. Set by the Feed's squads rail so
   *  tapping a chip lands on that squad, not the index. Cleared by
   *  SquadsScreen once consumed. */
  squadFocusId: string | null;
  /** Optimistic chat placeholders awaiting server confirmation, keyed by
   *  `<kind>:<id>` (e.g. `activity:abc` or `squad:xyz`) — matches the
   *  realtime channel naming so callers can share one slice across
   *  activity and squad chats. Each message carries `pending: true` +
   *  a `localId` so the render layer can dedupe against the real message
   *  once it lands and so the cleanup path can target the exact placeholder. */
  pendingMessages: Record<string, ChatMessage[]>;
  toasts: Toast[];
  settings: AppSettings;
  /** True while an auth or signup flow is in flight (Apple/Google/email
   *  sign-in, signup, or completing onboarding). Drives the global
   *  LoadingOverlay + disables auth buttons so a slow network round-trip
   *  can't be double-tapped into a wedged state. */
  authBusy: boolean;

  // selectors
  me: () => User;
  userById: (id: string) => User;
  isFriend: (id: string) => boolean;
  isFriendOfFriend: (id: string) => boolean;
  canSeeActivity: (a: Activity) => boolean;
  isFoFActivity: (a: Activity) => boolean;
  visibleActivities: () => Activity[];
  hasFoFAvailable: () => boolean;
  unreadCount: () => number;
  /** Number of activities in the visible feed created since the user last
   *  opened the Feed tab. My own posts don't count — I just made them. */
  unseenFeedCount: () => number;
  /** Number of floats received from someone else since the user last
   *  opened the Floats tab. My own outgoing floats don't count. */
  unseenFloatsCount: () => number;
  /** Per-tab last-viewed timestamps, hydrated from localStorage so the
   *  unseen-badge state survives a restart. The store mutates these on
   *  setTab when switching INTO the matching tab. */
  lastSeenFeedAt: number;
  lastSeenFloatsAt: number;

  // auth flow
  authState: AuthState;
  setAuthState: (s: AuthState) => void;
  authIntent: 'signup' | 'login';
  setAuthIntent: (i: 'signup' | 'login') => void;
  pendingSignup: PendingSignup | null;
  /** Called once on app mount — resumes a saved session if a token exists. */
  init: () => void;
  /** Auth-screen → onboarding: stash email/password for signUp(). */
  beginEmailSignup: (email: string, password: string) => void;
  /** Onboarding finish — registers the account and enters the app. */
  signUp: (input: {
    name: string;
    handle: string;
    avatar?: string;
    color?: string;
    dateOfBirth: number;
    /** Optional E.164 phone number — feeds the friend-discovery flow. */
    phone?: string;
    /** Optional profile photo picked during onboarding. Uploaded AFTER
     *  the account is created (the upload endpoint requires auth) and
     *  applied via a follow-up meApi.update — so a failed upload never
     *  blocks signup itself. */
    photoFile?: File;
  }) => void;
  /** Email log in via Firebase, with legacy fallback for pre-migration accounts. */
  logIn: (email: string, password: string) => void;
  /** Email sign up — creates the Firebase user and routes to onboarding. */
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  /** Native sign in with Apple via Firebase Auth (iOS uses the system sheet). */
  signInWithApple: () => Promise<void>;
  /** Native sign in with Google via Firebase Auth. */
  signInWithGoogle: () => Promise<void>;
  /** Send a password reset email — best-effort, never reveals if the address
   *  is registered (anti-enumeration). Returns true on success. */
  sendPasswordReset: (email: string) => Promise<boolean>;
  /** Resend the email-verification link for the currently signed-in user.
   *  Returns true if Firebase accepted the request. */
  resendEmailVerification: () => Promise<boolean>;
  /** Pull a fresh Firebase ID token and re-post to /auth/firebase so the
   *  server picks up the latest email_verified claim. Returns the new
   *  verification status. Used by the verify-email gate while polling. */
  syncFirebaseUser: () => Promise<boolean>;
  signOut: () => void;
  /** Permanently erase the account, then return to the welcome screen. */
  deleteAccount: () => void;

  setTab: (t: Tab) => void;
  openActivity: (id: string | null) => void;
  setShowPostSheet: (b: boolean) => void;
  /** Open the PostSheet pre-configured to post a plan to ONE specific
   *  squad (Squads only, that squad selected, no other friends). The
   *  user can still flip to All friends or add other squads. Triggered
   *  by the + button on a squad's Plans tab. */
  openPostSheetForSquad: (squadId: string) => void;
  /** Consume + clear the postSheetInit target. Called by PostSheet's
   *  open-reset effect so the same init isn't reapplied on a later open. */
  consumePostSheetInit: () => State['postSheetInit'];
  setFeedScope: (s: FeedScope) => void;
  feedFilters: FeedFilters;
  setFeedFilter: (patch: Partial<FeedFilters>) => void;
  clearFeedFilters: () => void;
  hasActiveFeedFilters: () => boolean;
  trendingCategories: () => { key: CategoryKey; count: number; emoji: string; label: string }[];
  /** Categories that currently have at least one visible upcoming plan. */
  availableCategories: () => AvailableCategory[];
  smartSuggestions: () => Suggestion[];
  /** Top 3 events picked for me — friend overlap × time proximity × category affinity. */
  rankedForYouEvents: () => Activity[];
  openOverlay: (o: Overlay) => void;
  /** Whether the swipeable tutorial overlay is showing. Set to `true` the
   *  first time the user reaches authState === 'app' on this device, and
   *  whenever they tap "Replay tutorial" in Settings. */
  showTutorial: boolean;
  setShowTutorial: (v: boolean) => void;
  /** Open the Squads overlay focused on a specific squad's detail page. */
  openSquad: (squadId: string) => void;
  /** Consume + clear the focused-squad target (called by SquadsScreen once
   *  it has navigated to it, so re-opening the overlay later goes to the
   *  list again). */
  consumeSquadFocus: () => string | null;

  /** Incoming friend requests awaiting my response. */
  friendRequests: { id: string; from: User; at: number }[];
  /** Pending friend requests I've sent and am waiting on. Mirrors
   *  `friendRequests` so the Friends overlay can surface both sides. */
  outgoingRequests: { id: string; to: User; at: number }[];
  addFriend: (userId: string) => void;
  removeFriend: (userId: string) => void;
  acceptFriendRequest: (requestId: string) => void;
  declineFriendRequest: (requestId: string) => void;
  /** Cancel a request I previously sent. Server-side this is the same
   *  endpoint as decline; the difference is who's acting on it. */
  cancelFriendRequest: (requestId: string) => void;
  /** Patch the current user's profile. Pass `null` for a nullable field
   *  (`phone`, `photoUrl`) to explicitly clear it; omit the key to leave
   *  it unchanged. */
  updateMe: (patch: {
    name?: string;
    handle?: string;
    avatar?: string;
    color?: string;
    photoUrl?: string | null;
    phone?: string | null;
  }) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;

  /* ---- trust & safety ---- */
  /** User IDs I've blocked. Used for client-side hiding too (defence-in-depth
   *  on top of server filtering). */
  blockedIds: string[];
  /** Hydrated User objects for the Blocked Users settings screen. */
  blockedUsers: User[];
  refreshBlocks: () => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  /** True if either party has blocked the other — use for visibility checks. */
  isBlocked: (userId: string) => boolean;
  /** File an abuse report. Resolves on success; toasts on failure. */
  reportTarget: (input: {
    targetKind: 'user' | 'activity' | 'message';
    targetId: string;
    reason: string;
    note?: string;
  }) => Promise<boolean>;
  /** Open the Report sheet aimed at a specific target. UI state only. */
  reportSheet: { kind: 'user' | 'activity' | 'message'; targetId: string; label?: string } | null;
  openReportSheet: (target: { kind: 'user' | 'activity' | 'message'; targetId: string; label?: string } | null) => void;

  createSquad: (input: { name: string; emoji: string; memberIds: string[] }) => void;
  updateSquad: (squadId: string, patch: Partial<Pick<Squad, 'name' | 'emoji'>>) => void;
  deleteSquad: (squadId: string) => void;
  addMemberToSquad: (squadId: string, userId: string) => void;
  removeMemberFromSquad: (squadId: string, userId: string) => void;
  leaveSquad: (squadId: string) => void;
  sendSquadChat: (squadId: string, text: string) => void;
  sendSquadChatPhoto: (squadId: string, file: File, caption?: string) => void;
  isSquadHost: (squadId: string) => boolean;
  amInSquad: (squadId: string) => boolean;

  showGoLiveSheet: boolean;
  setShowGoLiveSheet: (b: boolean) => void;

  /** Activity currently being edited via the EditActivitySheet (host-only).
   *  Null when the sheet is closed. */
  editActivityId: string | null;
  setEditActivityId: (id: string | null) => void;

  postActivity: (input: {
    category: CategoryKey;
    customEmoji?: string;
    customLabel?: string;
    title: string;
    place: string;
    startsAt: number;
    /** Required. Must be strictly after startsAt. */
    endsAt: number;
    description: string;
    maxSize?: number;
    isPrivate?: boolean;
    bannerUrl?: string;
    recurrence?: Recurrence;
    squadIds?: string[];
    isOpenInvite?: boolean;
  }) => void;

  /** Host-only edit. Server enforces ownership + the live-start lock. */
  updateActivity: (activityId: string, patch: {
    title?: string;
    place?: string;
    description?: string;
    startsAt?: number;
    endsAt?: number;
    maxSize?: number | null;
    bannerUrl?: string | null;
    isPrivate?: boolean;
    isOpenInvite?: boolean;
    squadIds?: string[];
    /** Category swap. customEmoji + customLabel only used when category === 'custom'. */
    category?: CategoryKey;
    customEmoji?: string;
    customLabel?: string;
  }) => Promise<boolean>;

  /* ---- floats — soft proposals before plans ---- */
  /** Float a soft proposal to friends. Returns the created float (or null on failure). */
  postFloat: (input: {
    question: string;
    emoji?: string;
    place?: string;
    timing?: FloatTiming;
    isOpenInvite?: boolean;
    isPrivate?: boolean;
    squadIds?: string[];
    lifetimeMs?: number;
  }) => Promise<Float | null>;
  /** Respond to a float — keen / maybe / nah. Toggle off by passing the same state again. */
  respondToFloat: (floatId: string, state: FloatResponseState) => void;
  /** Sender-only: promote a float to a real activity. Opens the host-side
   *  PostSheet pre-filled with the float's keen crew as joiners. */
  lockFloat: (floatId: string, input: {
    title?: string;
    category?: CategoryKey;
    place?: string;
    description?: string;
    startsAt: number;
    endsAt: number;
    maxSize?: number;
    isPrivate?: boolean;
    isOpenInvite?: boolean;
    squadIds?: string[];
  }) => Promise<string | null>;
  /** Sender-only: discard a float. */
  removeFloat: (floatId: string) => void;
  /** UI: which float (if any) is staged for lock-in via PostSheet. Carries the
   *  prefill payload separately so reset() on close doesn't lose context. */
  lockingFloatId: string | null;
  setLockingFloatId: (id: string | null) => void;

  joinActivity: (activityId: string) => void;
  leaveActivity: (activityId: string) => void;
  setRsvp: (activityId: string, state: RsvpState) => void;
  /** Host nudges specific friends to a plan they're already running. The
   *  server filters out anyone already RSVPed 'going' and non-friends; the
   *  return surfaces both buckets so the caller can give clear feedback. */
  inviteToActivity: (activityId: string, userIds: string[]) =>
    Promise<{ invited: number; alreadyGoing: number; notFriend: number }>;

  sendChat: (activityId: string, text: string) => void;
  sendChatPhoto: (activityId: string, file: File, caption?: string) => void;
  sendPoll: (activityId: string, question: string, optionTexts: string[]) => void;
  voteInPoll: (activityId: string, messageId: string, optionId: string) => void;
  /** Add or remove an emoji reaction on a single chat message. Toggles
   *  the (me, emoji) pair on/off optimistically; server reconciles. */
  toggleMessageReaction: (activityId: string, messageId: string, emoji: string) => void;
  /** Same as toggleMessageReaction but targets a squad chat thread. */
  toggleSquadMessageReaction: (squadId: string, messageId: string, emoji: string) => void;
  toggleReaction: (activityId: string, emoji: string) => void;

  pollComposerActivityId: string | null;
  setPollComposerActivityId: (id: string | null) => void;
  acceptHostOffer: (notificationId: string) => void;
  declineHostOffer: (notificationId: string) => void;

  markAllNotificationsRead: () => void;
  /** Wipe every notification — optimistic locally, server-authoritative. */
  clearAllNotifications: () => void;
  pingFriends: (text: string, recipientIds?: string[], squadId?: string) => void;

  setReminderForActivity: (activityId: string, mins: number | null | undefined) => void;

  pushToast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  /** Re-pull every live slice (feed, floats, notifications, friend list).
   *  Backs the pull-to-refresh gesture on each tab. */
  refreshAll: () => Promise<void>;

}

export const useApp = create<State>((set, get) => {
  /* ============ internal helpers (closures over set/get) ============ */

  const toast = (text: string, tone: Toast['tone'] = 'default') =>
    set(state => ({ toasts: [...state.toasts, { id: uid(), text, tone }].slice(-3) }));

  /** Merge users into the cache, replacing by id (so live-status changes apply). */
  const mergeUsers = (incoming: User[]) => {
    if (incoming.length === 0) return;
    set(state => {
      const map = new Map(state.users.map(u => [u.id, u]));
      for (const u of incoming) map.set(u.id, u);
      return { users: [...map.values()] };
    });
  };

  /** Insert or replace an activity by id. */
  const upsertActivity = (activity: Activity) => {
    set(state => {
      const exists = state.activities.some(a => a.id === activity.id);
      return {
        activities: exists
          ? state.activities.map(a => (a.id === activity.id ? activity : a))
          : [activity, ...state.activities],
      };
    });
  };

  const removeActivity = (id: string) => {
    set(state => ({
      activities: state.activities.filter(a => a.id !== id),
      openActivityId: state.openActivityId === id ? null : state.openActivityId,
    }));
  };

  /** Subscribe the realtime socket to every activity + squad channel we hold. */
  const syncSubscriptions = () => {
    for (const a of get().activities) subscribeChannel(`activity:${a.id}`);
    for (const s of get().squads) subscribeChannel(`squad:${s.id}`);
  };

  /* ---- refresh helpers — refetch a slice from the API ---- */

  const refreshActivity = async (id: string) => {
    try {
      const { activity, users } = await activityApi.get(id);
      mergeUsers(users);
      upsertActivity(activity);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) removeActivity(id);
    }
  };

  const refreshFeed = async () => {
    const { activities, users } = await activityApi.feed();
    mergeUsers(users);
    set(state => ({
      // Replace the upcoming-and-live partition; keep past activities (History) intact.
      // The cutoff is endsAt now, so an activity that's mid-window still counts
      // as current and gets refreshed from the server response, not preserved
      // as a stale "past" record.
      activities: dedupeById([
        ...activities,
        ...state.activities.filter(a => a.endsAt < Date.now()),
      ]),
    }));
    syncSubscriptions();
  };

  const refreshHistory = async () => {
    const { activities, users } = await activityApi.history();
    mergeUsers(users);
    set(state => ({
      activities: dedupeById([
        ...state.activities.filter(a => a.endsAt >= Date.now()),
        ...activities,
      ]),
    }));
  };

  const refreshSquads = async () => {
    const { squads, users } = await socialApi.squads();
    mergeUsers(users);
    set({ squads });
    syncSubscriptions();
  };

  const refreshSquad = async (id: string) => {
    try {
      const { squad, users } = await socialApi.squad(id);
      mergeUsers(users);
      set(state => ({
        squads: state.squads.some(s => s.id === id)
          ? state.squads.map(s => (s.id === id ? squad : s))
          : [...state.squads, squad],
      }));
    } catch {
      // Squad gone (deleted / left) — drop it.
      set(state => ({ squads: state.squads.filter(s => s.id !== id) }));
    }
  };

  const refreshNotifications = async () => {
    const { notifications, users } = await miscApi.notifications();
    mergeUsers(users);
    set({ notifications });
  };

  /* ---- floats: insert/replace, remove, refresh-all ---- */

  const upsertFloat = (f: Float) => {
    set(state => {
      const exists = state.floats.some(x => x.id === f.id);
      return {
        floats: exists
          ? state.floats.map(x => (x.id === f.id ? f : x))
          : [f, ...state.floats],
      };
    });
  };

  const removeFloatLocal = (id: string) => {
    set(state => ({
      floats: state.floats.filter(f => f.id !== id),
      lockingFloatId: state.lockingFloatId === id ? null : state.lockingFloatId,
    }));
  };

  const refreshFloats = async () => {
    try {
      const { floats, users } = await floatApi.list();
      mergeUsers(users);
      set({ floats: dedupeById(floats) });
    } catch (e) {
      // Floats are non-critical — fail silently rather than dumping a toast.
      if (e instanceof ApiError && e.status >= 500) {
        // server hiccup; let the next pull recover
      }
    }
  };

  const refreshFriends = async () => {
    const { friends } = await socialApi.friends();
    mergeUsers(friends);
    set({ friendIds: friends.map(u => u.id) });
  };

  const refreshOutgoingRequests = async () => {
    const { requests } = await socialApi.outgoingRequests();
    mergeUsers(requests.map(r => r.to));
    set({ outgoingRequests: requests });
  };
  const refreshFriendRequests = async () => {
    const { requests } = await socialApi.friendRequests();
    mergeUsers(requests.map(r => r.from));
    set({ friendRequests: requests });
  };

  /* ---- realtime event routing ---- */

  const handleRealtime = (event: RealtimeEvent) => {
    const { channel, type, data } = event;
    if (type === 'notification.created') {
      void refreshNotifications();
      const n = data as { text?: string; type?: string };
      // Friend-request ('invite') alerts get a friendlier, named toast + OS
      // notification from the friend.changed handler below.
      if (n?.text && n.type !== 'invite') {
        toast(n.text, 'success');
        if (get().settings.pushEnabled) notify('WUD', n.text);
      }
      return;
    }
    if (type === 'friend.changed') {
      const d = data as { requestFrom?: string };
      void (async () => {
        await refreshFriends();
        await refreshFriendRequests();
        void refreshFeed();
        if (d?.requestFrom) {
          const req = get().friendRequests.find(r => r.from.id === d.requestFrom);
          const text = req
            ? `${req.from.name} wants to be your friend 👋`
            : 'New friend request 👋';
          toast(text, 'success');
          if (get().settings.pushEnabled) notify('WUD', text);
        }
      })();
      return;
    }
    if (type === 'presence.changed') {
      // Legacy channel still emits when friends transition state; nothing to
      // do now that "live" is a property of activities, not users. The feed
      // refreshes on activity:* events instead.
      return;
    }
    if (type === 'feed.changed') {
      // A friend posted / edited / dissolved a plan I can see. The activity
      // wasn't in my subscription set before this event (I didn't know it
      // existed), so refetch the whole feed slice — cheap and always correct.
      void refreshFeed();
      return;
    }
    if (type === 'float.changed') {
      // A float I can see was created / responded to / locked / removed.
      // Re-pull the list — same cheap-and-correct pattern as feed.changed.
      void refreshFloats();
      return;
    }
    if (type === 'block.changed') {
      // A block went up or came down on either side — the feed view (and the
      // friends list) needs to drop or restore everything tied to that user.
      void get().refreshBlocks();
      void refreshFriends();
      void refreshFeed();
      return;
    }
    if (channel.startsWith('activity:')) {
      void refreshActivity(channel.slice('activity:'.length));
      return;
    }
    if (channel.startsWith('squad:')) {
      void refreshSquad(channel.slice('squad:'.length));
      return;
    }
  };

  /* ---- background refresh: pull-side safety net for the realtime push ----
   *
   * The WebSocket already pushes feed.changed / activity:* events, but mobile
   * sockets drop silently on backgrounding and slow networks. A periodic
   * refresh + a visibilitychange refresh keeps the feed in sync without the
   * user needing to pull-to-refresh. Intentionally lightweight: skips while
   * the tab is hidden, and only touches feed + notifications.
   */
  const BACKGROUND_REFRESH_MS = 30_000;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let visibilityHandler: (() => void) | null = null;

  const backgroundRefresh = () => {
    void refreshFeed();
    void refreshFloats();
    void refreshNotifications();
  };

  const startBackgroundRefresh = () => {
    stopBackgroundRefresh();
    refreshTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      backgroundRefresh();
    }, BACKGROUND_REFRESH_MS);
    if (typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (!document.hidden) backgroundRefresh();
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  };

  const stopBackgroundRefresh = () => {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    visibilityHandler = null;
  };

  /* ---- bootstrap: load the whole world after auth ---- */

  const doBootstrap = async (opts?: { holdSplashMs?: number }) => {
    const startedAt = Date.now();
    const b = await getBootstrap();
    // Cold start: hold the animated splash for a moment so it actually plays,
    // rather than flashing for a fraction of a second behind the native splash.
    const hold = opts?.holdSplashMs ?? 0;
    const elapsed = Date.now() - startedAt;
    if (hold > elapsed) {
      await new Promise(r => setTimeout(r, hold - elapsed));
    }
    set({
      meId: b.user.id,
      // b.user is the privileged /me shape (includes `phone`); b.users is
      // from hydrateUsers and excludes private fields. Put b.user LAST so
      // dedupeUsers' "later wins" rule keeps the version with phone — the
      // earlier order silently dropped phone on every bootstrap.
      users: dedupeUsers([...b.users, b.user]),
      friendIds: b.friendIds,
      activities: dedupeById(b.activities),
      floats: dedupeById(b.floats ?? []),
      squads: b.squads,
      notifications: b.notifications,
      settings: b.settings,
      authState: 'app',
      tab: 'feed',
    });
    connectRealtime(handleRealtime);
    syncSubscriptions();
    startBackgroundRefresh();
    void refreshFriendRequests();   // load any pending incoming requests
    void refreshOutgoingRequests(); // and any pending sent requests
    void get().refreshBlocks();     // load my block list (T&S — Apple 1.2)
    // The user is now authenticated — push the device's FCM token to the
    // backend so we can target them with remote pushes. No-op on web.
    registerPushAfterAuth();
  };

  /**
   * Translates Firebase Auth error codes into user-facing messages. Firebase
   * deliberately collapses several signals into 'auth/invalid-credential' to
   * prevent email enumeration, so most password failures show the same text.
   */
  const friendlyFirebaseError = (e: unknown, fallback: string): string => {
    const code = (e as { code?: string } | undefined)?.code ?? '';
    switch (code) {
      case 'auth/email-already-in-use': return 'An account already exists for that email. Try logging in.';
      case 'auth/invalid-email':         return 'That email address looks wrong.';
      case 'auth/weak-password':         return 'Password is too weak. Use at least 8 characters.';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/user-not-found':        return 'Incorrect email or password.';
      case 'auth/too-many-requests':     return 'Too many attempts — please wait a minute and try again.';
      case 'auth/network-request-failed':return "Can't reach Firebase. Check your connection.";
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case '1001':                        return ''; // user cancelled the native sheet — silent
      default: return fallback;
    }
  };

  /**
   * Shared post-signin flow: Firebase already authenticated the user; we now
   * have a Firebase ID token in `token`. POST it to /v1/auth/firebase and
   * either land in the app (existing user) or stash + route to onboarding
   * (new user — needs DOB + handle).
   */
  /** When an email-provider user logs in (sign-up or login) and the server
   *  reports email_verified=false, gate them on the verify-email screen
   *  instead of dropping into the app. OAuth providers are always verified
   *  so they skip this entirely. */
  const enforceEmailVerificationGate = (provider: 'apple' | 'google' | 'email') => {
    if (provider !== 'email') return;
    const me = get().users.find(u => u.id === get().meId);
    if (me && me.emailVerified === false) {
      set({ authState: 'verifyEmail' });
    }
  };

  const completeFirebaseSignin = async (
    token: string,
    provider: 'apple' | 'google' | 'email',
    fallbackErrorMsg: string,
  ): Promise<void> => {
    try {
      const r = await authApi.firebase({ idToken: token });
      tokens.set(r.accessToken, r.refreshToken);
      await doBootstrap();
      enforceEmailVerificationGate(provider);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        // 422 = first sign-in, need DOB + handle. Stash the token so the
        // onboarding screen can re-call /auth/firebase with the full payload.
        // Pull the user profile from Firebase for the suggested name prefill.
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const current = await FirebaseAuthentication.getCurrentUser();
        set({
          pendingSignup: {
            kind: 'firebase',
            idToken: token,
            provider,
            suggestedName: current.user?.displayName ?? undefined,
            email: current.user?.email ?? undefined,
          },
          authState: 'onboarding',
        });
        return;
      }
      toast(e instanceof ApiError ? e.message : fallbackErrorMsg, 'warn');
    }
  };

  /**
   * Sign in with Apple or Google via the native Firebase sheet. Used by the
   * social buttons on WelcomeScreen.
   *
   * Lazy-imports the Capacitor plugin so the web build (which can't use it
   * natively) doesn't fail at module load time.
   */
  const firebaseProviderSignin = (provider: 'apple' | 'google') =>
    withAuthBusy(async () => {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        if (provider === 'apple') await FirebaseAuthentication.signInWithApple();
        else                       await FirebaseAuthentication.signInWithGoogle();
        const { token } = await FirebaseAuthentication.getIdToken();
        if (!token) throw new Error('No ID token from Firebase');
        await completeFirebaseSignin(token, provider, `Could not sign in with ${provider}`);
      } catch (e) {
        // Same diagnostic console.error trick — exposes the real Firebase code.
        console.error(`[firebaseProviderSignin:${provider}] failed`, e);
        const msg = friendlyFirebaseError(e, `Could not sign in with ${provider}`);
        if (msg) toast(msg, 'warn');
      }
    });

  /**
   * Sign up with email + password through Firebase. Creates the Firebase
   * user, fires a verification email, then routes to onboarding (which
   * completes the WUD account with handle + DOB).
   */
  const firebaseEmailSignup = (email: string, password: string) =>
    withAuthBusy(async () => {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.createUserWithEmailAndPassword({ email, password });
        const { token } = await FirebaseAuthentication.getIdToken();
        if (!token) throw new Error('No ID token from Firebase');
        // Verification email is sent by our server via SendGrid — much better
        // deliverability than Firebase's default firebaseapp.com sender, and
        // we control the template. Fire-and-forget; the user can resend from
        // the verify-email banner if it doesn't arrive.
        void authApi.sendVerification(token).catch(() => undefined);
        await completeFirebaseSignin(token, 'email', 'Could not create your account');
      } catch (e) {
        // Surface the raw Firebase error to the console so the iOS log captures
        // exactly which code/message tripped us — friendlyFirebaseError swallows
        // unfamiliar codes into the fallback string, hiding the real cause.
        console.error('[firebaseEmailSignup] failed', e);
        const msg = friendlyFirebaseError(e, 'Could not create your account');
        if (msg) toast(msg, 'warn');
      }
    });

  /**
   * Log in with email + password. Tries Firebase first (for accounts created
   * after the auth migration), then falls back to the legacy /v1/auth/email/
   * login endpoint (for users like the demo admin that pre-date Firebase).
   * Either path produces a WUD session.
   */
  const firebaseEmailLogin = (email: string, password: string) =>
    withAuthBusy(async () => {
      let firebaseError: unknown;
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signInWithEmailAndPassword({ email, password });
        const { token } = await FirebaseAuthentication.getIdToken();
        if (!token) throw new Error('No ID token from Firebase');
        await completeFirebaseSignin(token, 'email', 'Could not log in');
        return;
      } catch (e) {
        firebaseError = e;
      }
      // Firebase failed — could be wrong password OR a legacy user not in
      // Firebase. Try the legacy path; if THAT also fails, surface the legacy
      // error (it's the more informative one for password-mismatch cases).
      try {
        const r = await authApi.login(email, password);
        tokens.set(r.accessToken, r.refreshToken);
        await doBootstrap();
      } catch (legacyError) {
        const msg = friendlyFirebaseError(firebaseError,
          legacyError instanceof ApiError ? legacyError.message : 'Could not log in');
        if (msg) toast(msg, 'warn');
      }
    });

  /**
   * Best-effort Firebase signout. Used on app signout + delete-account so we
   * don't leave a Firebase session live after the WUD session ends. Lazy
   * import + swallow errors — never block the calling flow.
   */
  const firebaseSignOutSilent = async (): Promise<void> => {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
    } catch { /* swallow — sign-out is best effort */ }
  };

  /**
   * Persist a phone number set during signup. Done as a follow-up call so a
   * server-side rejection (bad format, normalization fails) shows as a toast
   * without rolling back the signup itself — the user can fix it later from
   * Edit Profile. Merges the returned `user` row back in so the store reflects
   * the normalized E.164 form.
   */
  const savePhoneBestEffort = async (phone: string): Promise<void> => {
    try {
      const { user } = await meApi.update({ phone });
      set(s => ({ users: dedupeUsers([...s.users, user]) }));
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'warn');
      else console.error('[savePhone] unexpected error:', e);
    }
  };

  /**
   * Upload a profile photo picked during onboarding and stick it on the
   * fresh account. Runs AFTER signUp completes (the upload endpoint
   * needs auth), so an upload failure leaves the account intact — the
   * user can re-upload from Edit profile later.
   */
  const savePhotoBestEffort = async (file: File): Promise<void> => {
    try {
      const { url } = await uploadApi.photo(file);
      const { user } = await meApi.update({ photoUrl: url });
      set(s => ({ users: dedupeUsers([...s.users, user]) }));
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'warn');
      else console.error('[savePhoto] unexpected error:', e);
    }
  };

  /** Wrap an async auth-flow with a global `authBusy` flag so the UI can
   *  render a loading overlay and disable buttons while it's in flight.
   *  Always clears the flag in finally — a thrown error doesn't strand
   *  the user inside a permanent loading state. */
  const withAuthBusy = async <T>(fn: () => Promise<T>): Promise<T> => {
    set({ authBusy: true });
    try {
      return await fn();
    } finally {
      set({ authBusy: false });
    }
  };

  /** Wrap an async action: surface ApiErrors as toasts, never throw to the UI. */
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        toast(e.message, 'warn');
      } else {
        // Unknown throw — log to console so iOS/desktop devtools shows the real
        // cause instead of just our generic toast.
        console.error('[guard] unhandled error in store action:', e);
        toast('Something went wrong', 'warn');
      }
    }
  };

  /* ---- optimistic chat helpers ----
   *
   * Pending placeholders live in their own `pendingMessages` slice keyed by
   * `<kind>:<id>`. They're rendered alongside the canonical chat list while
   * the API call is in flight, then removed once the server has confirmed
   * (or failed) so the realtime-refreshed chat takes over visually.
   * Render-side dedupe (authorId + content + time window) prevents a
   * visible duplicate during the brief gap between the realtime push and
   * our finally-block removal.
   */
  function addPending(key: string, msg: ChatMessage): void {
    set(s => ({
      pendingMessages: {
        ...s.pendingMessages,
        [key]: [...(s.pendingMessages[key] ?? []), msg],
      },
    }));
  }
  function removePending(key: string, localId: string): void {
    set(s => {
      const list = (s.pendingMessages[key] ?? []).filter(m => m.localId !== localId);
      const next = { ...s.pendingMessages };
      if (list.length === 0) delete next[key];
      else next[key] = list;
      return { pendingMessages: next };
    });
  }
  /** Run a send, surface errors via the same toast-on-ApiError shape as
   *  `guard`, and always clean up the pending placeholder in `finally`.
   *  `onCleanup` is for caller-owned resources like blob URLs that need
   *  to be revoked regardless of success/failure. */
  async function sendWithCleanup(
    key: string,
    localId: string,
    fn: () => Promise<void>,
    onCleanup?: () => void,
  ): Promise<void> {
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, 'warn');
      else { console.error('[send] failed:', e); toast('Message failed to send', 'warn'); }
    } finally {
      onCleanup?.();
      removePending(key, localId);
    }
  }

  /* ============ initial state + actions ============ */

  return {
    meId: '',
    users: [],
    friendIds: [],
    friendRequests: [], outgoingRequests: [],
    blockedIds: [],
    blockedUsers: [],
    reportSheet: null,
    activities: [],
    floats: [],
    notifications: [],
    squads: [],
    authState: 'splash',
    authIntent: 'signup',
    pendingSignup: null,

    tab: 'feed',
    openActivityId: null,
    showPostSheet: false,
    postSheetInit: null,
    showGoLiveSheet: false,
    editActivityId: null,
    lockingFloatId: null,
    pollComposerActivityId: null,
    feedScope: 'fof',
    feedFilters: { timeWindow: 'all', sort: 'soonest' },
    overlay: null,
    squadFocusId: null,
    pendingMessages: {},
    // Tutorial sits off by default; the App-level trigger turns it on the
    // first time the user lands in `authState === 'app'` and the local
    // "wud:has-seen-tutorial" flag is missing.
    showTutorial: false,
    // Hydrate last-seen timestamps from localStorage so the badges survive
    // an app restart. First-ever launch reads 0 → unseen counters return 0
    // (no badges) until the user opens the tab once and we set a baseline.
    lastSeenFeedAt: readTabSeen('feed'),
    lastSeenFloatsAt: readTabSeen('floats'),
    toasts: [],
    authBusy: false,
    settings: {
      pushEnabled: true,
      notifyJoins: true,
      notifyChat: true,
      notifyFloats: true,
      notifyReminders: true,
      pingsEnabled: true,
      allowFriendRequests: true,
      defaultReminderMins: 30,
    },

    /* ---- selectors (compute over store state — unchanged behavior) ---- */

    // me()/userById() return a STABLE cached fallback when the user isn't
    // loaded — a fresh object each call would make useApp() see a new snapshot
    // every render → infinite re-render loop (this is what crashed sign-out).
    //
    // Lookup goes through `userMapFor` below, which keeps a Map keyed by id
    // that's rebuilt only when the underlying `users` array reference
    // changes. Turns ~12.5k array scans per feed render (50 cards × ~5
    // userById calls × 50 friends) into 50 hash lookups + one Map rebuild.
    me: () => userMapFor(get().users).get(get().meId) ?? fallbackUser(get().meId),
    userById: (id) => userMapFor(get().users).get(id) ?? fallbackUser(id),
    isFriend: (id) => get().friendIds.includes(id) || id === get().meId,
    // FoF graph isn't streamed to the client; the "via X" hint is cosmetic only.
    isFriendOfFriend: () => false,
    canSeeActivity: (a) => {
      const s = get();
      if (a.hostId === s.meId) return true;
      const inAnyTaggedSquad = a.squadIds.some(sid => {
        const sq = s.squads.find(x => x.id === sid);
        return !!sq && (sq.hostId === s.meId || sq.memberIds.includes(s.meId));
      });
      if (inAnyTaggedSquad) return true;
      if (a.isOpenInvite) {
        if (s.isFriend(a.hostId)) return true;
        if (a.isPrivate) return false;
        if (a.joinerIds.some(id => s.isFriend(id))) return true;
      }
      return false;
    },
    isFoFActivity: (a) => {
      const s = get();
      if (a.hostId === s.meId) return false;
      const inAnyTaggedSquad = a.squadIds.some(sid => {
        const sq = s.squads.find(x => x.id === sid);
        return !!sq && (sq.hostId === s.meId || sq.memberIds.includes(s.meId));
      });
      if (inAnyTaggedSquad) return false;
      if (s.isFriend(a.hostId)) return false;
      if (!a.isOpenInvite) return false;
      if (a.isPrivate) return false;
      return a.joinerIds.some(id => s.isFriend(id));
    },
    visibleActivities: () => {
      const s = get();
      const now = Date.now();
      const f = s.feedFilters;
      const HOUR = 60 * 60 * 1000;
      const DAY = 24 * HOUR;
      const filtered = s.activities
        .filter(a => a.endsAt >= now)
        .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a))
        .filter(a => !f.category || a.category === f.category)
        // When a specific custom label is selected (e.g. "Pickleball"),
        // narrow further so the filter behaves like its own category.
        .filter(a => !f.customLabel || (a.customLabel?.trim() ?? '') === f.customLabel)
        .filter(a => {
          const dt = a.startsAt - now;
          if (f.timeWindow === 'now') return dt <= HOUR;
          if (f.timeWindow === 'today') return dt <= DAY;
          if (f.timeWindow === 'week') return dt <= 7 * DAY;
          return true;
        });
      // Popular = headcount desc (host always counts), tiebreak by soonest.
      if (f.sort === 'popular') {
        return filtered.sort((a, b) => {
          const ha = 1 + a.joinerIds.length;
          const hb = 1 + b.joinerIds.length;
          return hb - ha || a.startsAt - b.startsAt;
        });
      }
      return filtered.sort((a, b) => a.startsAt - b.startsAt);
    },
    hasFoFAvailable: () => {
      const s = get();
      // Use endsAt — an in-progress (live) FoF activity still counts as
      // an available FoF surface that should reveal the scope toggle.
      return s.activities.some(a => a.endsAt >= Date.now() && s.isFoFActivity(a));
    },
    unreadCount: () => get().notifications.filter(n => !n.read).length,
    unseenFeedCount: () => {
      const s = get();
      const since = s.lastSeenFeedAt;
      if (!since) return 0;
      // visibleActivities() already filters by friend graph + blocks + own
      // visibility, so we only need to compare timestamps and drop my own.
      let n = 0;
      for (const a of s.visibleActivities()) {
        if (a.createdAt > since && a.hostId !== s.meId) n++;
      }
      return n;
    },
    unseenFloatsCount: () => {
      const s = get();
      const since = s.lastSeenFloatsAt;
      if (!since) return 0;
      let n = 0;
      for (const f of s.floats) {
        if (f.createdAt > since && f.senderId !== s.meId) n++;
      }
      return n;
    },

    availableCategories: () => {
      // Powers the Category dropdown — only offer keys that have at least one
      // visible upcoming plan in the current scope, so users can't pick a
      // filter that would always return zero results. Sorted by plan count
      // desc (popular categories surface first) with stable name tiebreak.
      // Custom plans contribute one entry per distinct customLabel so each
      // user-defined category behaves like a first-class option.
      const s = get();
      const now = Date.now();
      const pool = s.activities
        .filter(a => a.endsAt >= now)
        .filter(a => s.canSeeActivity(a))
        .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a));

      const entries = new Map<string, AvailableCategory>();
      for (const a of pool) {
        const cat = categoryFor(a);
        // Custom plans key by label so "Pickleball" and "Pottery" stay
        // distinct in the dropdown. Standard plans key by their stable key.
        const dedupeKey = a.category === 'custom'
          ? `custom:${cat.label.toLowerCase()}`
          : a.category;
        const existing = entries.get(dedupeKey);
        if (existing) {
          existing.count += 1;
        } else {
          entries.set(dedupeKey, {
            key: a.category as CategoryKey,
            customLabel: a.category === 'custom' ? cat.label : undefined,
            emoji: cat.emoji,
            label: cat.label,
            count: 1,
          });
        }
      }
      return [...entries.values()].sort((a, b) =>
        b.count - a.count || a.label.localeCompare(b.label),
      );
    },

    trendingCategories: () => {
      // Trending should reflect the same world the user is currently looking
      // at — counting FoF plans when the scope is "Friends + FoF" inflates
      // the trend in ways that don't match the feed below.
      const s = get();
      const now = Date.now();
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      const pool = s.activities
        .filter(a => Math.abs(a.startsAt - now) <= WEEK)
        .filter(a => s.canSeeActivity(a))
        .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a));
      const tally = new Map<string, number>();
      for (const a of pool) tally.set(a.category, (tally.get(a.category) ?? 0) + 1);
      return [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, count]) => {
          const sample = pool.find(a => a.category === k);
          const c = sample ? categoryFor(sample) : { emoji: '✨', label: 'Other' };
          return { key: k as CategoryKey, count, emoji: c.emoji, label: c.label };
        })
        .filter(i => i.count >= 2);
    },
    smartSuggestions: () => {
      const s = get();
      const now = Date.now();
      const HOUR = 60 * 60 * 1000;
      const DAY = 24 * HOUR;
      const WEEK = 7 * DAY;
      const out: Suggestion[] = [];
      const myId = s.meId;
      // Mirror the feed's visibility logic so the digests match what the user
      // can actually scroll to below — including the friends-vs-FoF toggle.
      // Also drop my own plans: For You is a discovery rail, surfacing things
      // I'm already hosting (and would open up to "your own plan") feels off.
      const upcoming = s.activities
        .filter(a => a.endsAt >= now)
        .filter(a => a.hostId !== myId)
        .filter(a => s.canSeeActivity(a))
        .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a));
      // For "open" action picks, prefer a plan the viewer hasn't already
      // RSVP'd to — surfacing one I'm going to is redundant.
      const notJoined = (a: Activity) => !a.joinerIds.includes(myId);

      // -- Morning pulse — only shown in the morning, only when something
      //    actually looks worth highlighting (2+ plans today). The "today"
      //    cutoff is end-of-local-day so an 11pm plan still counts as today.
      const nowDate = new Date(now);
      const hour = nowDate.getHours();
      const isMorning = hour >= 6 && hour < 12;
      const endOfToday = new Date(nowDate); endOfToday.setHours(23, 59, 59, 999);
      const todayPlans = upcoming.filter(a => a.startsAt <= endOfToday.getTime());
      // Reusable per-activity friend-count — drives "primary plan" picking
      // for big_night and saves recomputing inside loops.
      const friendCount = (a: Activity): number =>
        (s.isFriend(a.hostId) ? 1 : 0) +
        a.joinerIds.filter(id => s.isFriend(id)).length;

      if (isMorning && todayPlans.length >= 2) {
        const friendsToday = new Set<string>();
        for (const a of todayPlans) {
          if (s.isFriend(a.hostId)) friendsToday.add(a.hostId);
          for (const id of a.joinerIds) if (s.isFriend(id)) friendsToday.add(id);
        }
        // Only surface the morning pulse when at least one friend is in the
        // mix — a generic "3 plans today" with nobody I know is noisy.
        if (friendsToday.size > 0) {
          out.push({
            kind: 'morning_pulse',
            count: todayPlans.length,
            friendsGoing: friendsToday.size,
            emoji: '🌅',
            text: `Good morning — ${todayPlans.length} plans today, ${friendsToday.size} friend${friendsToday.size === 1 ? '' : 's'} out`,
            tap: { action: 'filter', apply: { timeWindow: 'today' } },
          });
        }
      }

      // -- Big night — find the evening (5pm–2am window) in the next week with
      //    the most distinct friends going. Bucketed by *evening date* — an
      //    11pm plan and a 1am plan on the next calendar day belong together.
      const nightBuckets = new Map<string, { friends: Set<string>; activities: Activity[]; refMs: number }>();
      for (const a of upcoming.filter(a => a.startsAt - now <= WEEK)) {
        const d = new Date(a.startsAt);
        const h = d.getHours();
        if (h < 17 && h >= 2) continue; // not an evening plan
        // After-midnight plans belong to the previous evening's bucket.
        const eveningDate = new Date(d);
        if (h < 2) eveningDate.setDate(eveningDate.getDate() - 1);
        const key = eveningDate.toISOString().slice(0, 10);
        const bucket = nightBuckets.get(key) ?? { friends: new Set(), activities: [], refMs: a.startsAt };
        bucket.activities.push(a);
        if (s.isFriend(a.hostId)) bucket.friends.add(a.hostId);
        for (const id of a.joinerIds) if (s.isFriend(id)) bucket.friends.add(id);
        bucket.refMs = Math.min(bucket.refMs, a.startsAt);
        nightBuckets.set(key, bucket);
      }
      const biggest = [...nightBuckets.values()].sort((a, b) => b.friends.size - a.friends.size)[0];
      if (biggest && biggest.friends.size >= 3) {
        const label = relDayLabel(biggest.refMs);
        // Primary plan of that night = most friends going, soonest first as
        // tiebreak. Prefer un-joined plans so the tap surfaces something new
        // instead of one I'm already going to.
        const ranked = [...biggest.activities].sort((a, b) =>
          friendCount(b) - friendCount(a) || a.startsAt - b.startsAt,
        );
        const primary = ranked.find(notJoined) ?? ranked[0];
        out.push({
          kind: 'big_night',
          nightLabel: label,
          friendsGoing: biggest.friends.size,
          emoji: '🔥',
          text: `Big night ${label.toLowerCase()} — ${biggest.friends.size} friends are out`,
          tap: { action: 'open', activityId: primary.id },
        });
      }

      // -- Starting soon. With one plan we open it directly — no point making
      //    the user filter to a list of one. With more, fall back to a filter.
      //    Prefer un-joined when picking the single-plan target.
      const soon = upcoming.filter(a => a.startsAt - now <= HOUR);
      if (soon.length >= 1) {
        const soonPrimary = soon.find(notJoined) ?? soon[0];
        out.push({
          kind: 'starting_soon', count: soon.length, emoji: '⏰',
          text: soon.length === 1
            ? '1 plan starting in the next hour'
            : `${soon.length} plans starting in the next hour`,
          tap: soon.length === 1
            ? { action: 'open', activityId: soonPrimary.id }
            : { action: 'filter', apply: { timeWindow: 'now' } },
        });
      }

      // -- Category cluster — only surface when the category is relevant: I've
      //    either joined plans in this category before (affinity) or a friend
      //    is involved. A "3 surf plans today" pile when I don't surf and
      //    nobody I know is going is just noise.
      const myCategoryAffinity = new Map<string, number>();
      for (const a of s.activities) {
        if (a.hostId === myId || a.joinerIds.includes(myId)) {
          myCategoryAffinity.set(a.category, (myCategoryAffinity.get(a.category) ?? 0) + 1);
        }
      }
      const tally = new Map<string, number>();
      for (const a of todayPlans) tally.set(a.category, (tally.get(a.category) ?? 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) {
        const samples = todayPlans.filter(a => a.category === top[0]);
        const hasFriendInvolvement = samples.some(a => friendCount(a) > 0);
        const hasAffinity = (myCategoryAffinity.get(top[0]) ?? 0) > 0;
        if (hasFriendInvolvement || hasAffinity) {
          const c = categoryFor(samples[0]);
          out.push({
            kind: 'category_cluster', category: top[0] as CategoryKey, count: top[1], emoji: c.emoji,
            text: `${top[1]} ${c.label.toLowerCase()} plan${top[1] === 1 ? '' : 's'} today — tap to see them all`,
            tap: { action: 'filter', apply: { category: top[0] as CategoryKey, timeWindow: 'today' } },
          });
        }
      }

      // Hard cap so the For You strip never grows beyond a glanceable size.
      return out.slice(0, 3);
    },

    rankedForYouEvents: () => {
      // Top 3 events ranked for me. Scoring stays intentionally simple so it
      // stays explainable: friends going > time proximity > category affinity.
      const s = get();
      const now = Date.now();
      const myId = s.meId;
      const HOUR = 60 * 60 * 1000;

      // Affinity = how many past plans I joined in this category. Cheap proxy
      // for "what I'm into," capped so a single power-category can't dominate.
      const myCategoryAffinity = new Map<string, number>();
      for (const a of s.activities) {
        if (a.hostId === myId || a.joinerIds.includes(myId)) {
          myCategoryAffinity.set(a.category, (myCategoryAffinity.get(a.category) ?? 0) + 1);
        }
      }

      const scored = s.activities
        .filter(a => a.endsAt >= now)
        .filter(a => a.hostId !== myId)
        .filter(a => !a.joinerIds.includes(myId))
        .filter(a => s.canSeeActivity(a))
        // Match the current feed scope so Suggestions don't surface FoF picks
        // the user has chosen to hide from their feed.
        .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a))
        .map(a => {
          const friendsGoing =
            (s.isFriend(a.hostId) ? 1 : 0) +
            a.joinerIds.filter(id => s.isFriend(id)).length;
          const affinity = Math.min(myCategoryAffinity.get(a.category) ?? 0, 3);
          const hoursAway = Math.max(1, (a.startsAt - now) / HOUR);
          // Recency bonus: 1.0 within an hour, decaying linearly to 0 at 7d.
          const recency = Math.max(0, 1 - hoursAway / (7 * 24));
          const score = friendsGoing * 4 + affinity * 2 + recency * 3;
          return { a, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || a.a.startsAt - b.a.startsAt)
        .slice(0, 3);
      return scored.map(x => x.a);
    },

    isSquadHost: (squadId) => {
      const sq = get().squads.find(s => s.id === squadId);
      return !!sq && sq.hostId === get().meId;
    },
    amInSquad: (squadId) => {
      const sq = get().squads.find(s => s.id === squadId);
      if (!sq) return false;
      const meId = get().meId;
      return sq.hostId === meId || sq.memberIds.includes(meId);
    },

    /* ---- pure UI state ---- */

    setAuthState: (s) => set({ authState: s }),
    setAuthIntent: (i) => set({ authIntent: i }),
    setTab: (t) => {
      // Mark the tab as "seen" right when the user lands on it. Other tabs
      // continue to badge based on their last-seen timestamp until the
      // user opens THEM.
      if (t === 'feed') {
        const ts = Date.now();
        writeTabSeen('feed', ts);
        set({ tab: t, lastSeenFeedAt: ts });
        return;
      }
      if (t === 'floats') {
        const ts = Date.now();
        writeTabSeen('floats', ts);
        set({ tab: t, lastSeenFloatsAt: ts });
        return;
      }
      set({ tab: t });
    },
    setShowPostSheet: (b) => set(b
      ? { showPostSheet: true }
      // Clear the init on close so a plain "+" tap on the next open
      // doesn't accidentally inherit a stale squad-scoped config.
      : { showPostSheet: false, postSheetInit: null }),
    openPostSheetForSquad: (squadId) => set({
      postSheetInit: { squadIds: [squadId], openInvite: false },
      showPostSheet: true,
    }),
    consumePostSheetInit: () => {
      const init = get().postSheetInit;
      if (init) set({ postSheetInit: null });
      return init;
    },
    setFeedScope: (s) => set({ feedScope: s }),
    setFeedFilter: (patch) => set(state => {
      const next = { ...state.feedFilters, ...patch };
      // A customLabel only makes sense alongside category='custom'. Drop it
      // if the user picks a non-custom category in the same patch so stale
      // narrowing doesn't silently apply.
      if ('category' in patch && patch.category !== 'custom') next.customLabel = undefined;
      return { feedFilters: next };
    }),
    clearFeedFilters: () => set({ feedFilters: { timeWindow: 'all', sort: 'soonest' } }),
    hasActiveFeedFilters: () => {
      const f = get().feedFilters;
      return !!f.category || !!f.customLabel || f.timeWindow !== 'all' || f.sort !== 'soonest' || !!f.includeLive;
    },
    openOverlay: (o) => {
      // Closing the squads overlay also drops any pending focus target so
      // a stale id can't hijack the next open.
      const patch: Partial<State> = { overlay: o };
      if (o !== 'squads') patch.squadFocusId = null;
      set(patch);
      // Refresh the slice an overlay shows when it opens, so it's never stale.
      if (o === 'history') void refreshHistory();
      else if (o === 'squads') void refreshSquads();
      else if (o === 'friends') { void refreshFriends(); void refreshFriendRequests(); void refreshOutgoingRequests(); }
    },
    setShowTutorial: (v) => {
      // Hiding the tutorial is what marks it "seen" — that way both Skip
      // and Get Started funnel through the same write, and a "Replay
      // tutorial" tap from Settings clears the flag automatically by
      // re-opening (then re-closing when the user finishes the replay).
      if (!v) {
        try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); } catch { /* private mode */ }
      }
      set({ showTutorial: v });
    },
    openSquad: (squadId) => {
      // Set the focus *before* mounting the overlay so SquadsScreen sees
      // it in its initial render and skips the list view entirely.
      set({ squadFocusId: squadId, overlay: 'squads' });
      void refreshSquads();
    },
    consumeSquadFocus: () => {
      const id = get().squadFocusId;
      if (id) set({ squadFocusId: null });
      return id;
    },
    setShowGoLiveSheet: (b) => set({ showGoLiveSheet: b }),
    setEditActivityId: (id) => set({ editActivityId: id }),
    setPollComposerActivityId: (id) => set({ pollComposerActivityId: id }),

    /** Opening an activity refetches it (fresh chat/RSVPs) + subscribes for realtime. */
    openActivity: (id) => {
      set({ openActivityId: id });
      if (id) {
        subscribeChannel(`activity:${id}`);
        void refreshActivity(id);
      }
    },

    /* ---- auth ---- */

    init: () => {
      if (!tokens.hasSession) return;   // no session → splash advances to welcome
      void doBootstrap({ holdSplashMs: 1800 }).catch(() => {
        tokens.clear();
        set({ authState: 'welcome' });
      });
    },

    beginEmailSignup: (email, password) => {
      set({ pendingSignup: { kind: 'email', email, password }, authState: 'onboarding' });
    },

    signUp: ({ name, handle, avatar, color, dateOfBirth, phone, photoFile }) => {
      void guard(() => withAuthBusy(async () => {
        const pending = get().pendingSignup;
        // Firebase path — onboarding completes the signin with an ID token
        // captured when the user tapped Apple / Google on the welcome screen.
        if (pending?.kind === 'firebase') {
          const r = await authApi.firebase({
            idToken: pending.idToken,
            name, handle, avatar, color, dateOfBirth,
          });
          tokens.set(r.accessToken, r.refreshToken);
          const provider = pending.provider;
          set({ pendingSignup: null });
          await doBootstrap();
          // Phone + photo are optional. Done as follow-up PATCHes so the
          // auth endpoints don't need to thread these fields through
          // (and a network blip on either step doesn't strand the user
          // without an account).
          if (phone && phone.trim()) await savePhoneBestEffort(phone);
          if (photoFile) await savePhotoBestEffort(photoFile);
          // Apple/Google users are pre-verified; only email-provider signups
          // see the verify-email gate.
          enforceEmailVerificationGate(provider);
          return;
        }
        // Legacy email/password path — direct register. No pending = brand new
        // account with placeholder credentials (the demo entry uses this).
        const email = pending?.kind === 'email' ? pending.email : `${handle}-${uid()}@wud.app`;
        const password = pending?.kind === 'email' ? pending.password : 'demo-password';
        const r = await authApi.register({
          email, password, name, handle, avatar, color, dateOfBirth,
        });
        tokens.set(r.accessToken, r.refreshToken);
        set({ pendingSignup: null });
        await doBootstrap();
        if (phone && phone.trim()) await savePhoneBestEffort(phone);
        if (photoFile) await savePhotoBestEffort(photoFile);
        // Legacy email register has no Firebase user, so email is unverified
        // by definition. Same gate so the user lands on verify-email.
        if (pending?.kind === 'email') enforceEmailVerificationGate('email');
      }));
    },

    logIn: (email, password) => {
      void firebaseEmailLogin(email.trim().toLowerCase(), password);
    },

    signUpWithEmail: (email, password) =>
      firebaseEmailSignup(email.trim().toLowerCase(), password),

    signInWithApple: () => firebaseProviderSignin('apple'),
    signInWithGoogle: () => firebaseProviderSignin('google'),

    sendPasswordReset: async (email) => {
      try {
        await authApi.requestPasswordReset(email.trim().toLowerCase());
        toast('If that email is registered, a reset link is on its way.', 'success');
        return true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not send reset email', 'warn');
        return false;
      }
    },

    resendEmailVerification: async () => {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        // We need a fresh Firebase ID token so the server can prove who's
        // asking AND read their email out of the verified token's claims.
        const { token } = await FirebaseAuthentication.getIdToken();
        if (!token) throw new Error('No Firebase session');
        const res = await authApi.sendVerification(token);
        if (res.alreadyVerified) {
          toast("You're already verified — refreshing.", 'default');
          // Best-effort: pull the fresh emailVerified claim into our session
          // so the verify-email screen stops showing on the next render.
          void get().syncFirebaseUser();
        } else {
          toast('Verification email sent — check your inbox.', 'success');
        }
        return true;
      } catch (e) {
        const msg = e instanceof ApiError
          ? e.message
          : friendlyFirebaseError(e, 'Could not send verification email');
        if (msg) toast(msg, 'warn');
        return false;
      }
    },

    syncFirebaseUser: async () => {
      // Pull the latest from Firebase (the email_verified claim updates only
      // when the cached user is refreshed), then post a fresh idToken to
      // /auth/firebase so the server's local emailVerified flag catches up.
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.reload();
        const result = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
        if (!result.token) return false;
        const r = await authApi.firebase({ idToken: result.token });
        if (r.accessToken) tokens.set(r.accessToken, r.refreshToken);
        // Re-fetch just the user (cheap) rather than re-bootstrapping.
        const { user } = await meApi.get();
        mergeUsers([user]);
        return user.emailVerified === true;
      } catch {
        return false;
      }
    },

    signOut: () => {
      const refresh = tokens.refresh;
      if (refresh) void authApi.logout(refresh).catch(() => undefined);
      // Tear down the Firebase session too so a returning user gets the
      // signin sheet next time, not the previous account auto-restored.
      void firebaseSignOutSilent();
      disconnectRealtime();
      stopBackgroundRefresh();
      tokens.clear();
      set({
        meId: '', users: [], friendIds: [], friendRequests: [], outgoingRequests: [], blockedIds: [], blockedUsers: [], activities: [], floats: [],
        notifications: [], squads: [],
        tab: 'feed', openActivityId: null, showPostSheet: false,
        showGoLiveSheet: false, editActivityId: null, pollComposerActivityId: null, overlay: null, squadFocusId: null, pendingMessages: {},
        feedFilters: { timeWindow: 'all', sort: 'soonest' },
        pendingSignup: null, authState: 'welcome',
      });
    },

    deleteAccount: () => {
      void guard(async () => {
        await meApi.deleteAccount();
        void firebaseSignOutSilent();
        disconnectRealtime();
        tokens.clear();
        set({
          meId: '', users: [], friendIds: [], friendRequests: [], outgoingRequests: [], blockedIds: [], blockedUsers: [], activities: [], floats: [],
          notifications: [], squads: [],
          tab: 'feed', openActivityId: null, showPostSheet: false,
          showGoLiveSheet: false, editActivityId: null, pollComposerActivityId: null, overlay: null, squadFocusId: null, pendingMessages: {},
          feedFilters: { timeWindow: 'all', sort: 'soonest' },
          pendingSignup: null, authState: 'welcome',
        });
        toast('Your account has been deleted', 'default');
      });
    },

    /* ---- friends ---- */

    addFriend: (userId) => {
      void guard(async () => {
        await socialApi.addFriend(userId);
        // Refresh both — addFriend can either send a fresh request OR
        // accept a pending incoming request from the same user (server's
        // "duplicate handshake" auto-merge). Refresh outgoing too so the
        // sent-requests list updates in the Friends overlay without a
        // round-trip back to the user.
        await Promise.all([
          refreshFriends(),
          refreshFriendRequests(),
          refreshOutgoingRequests(),
        ]);
        toast(`Friend request sent to ${get().userById(userId).name}`, 'success');
      });
    },
    removeFriend: (userId) => {
      const name = get().userById(userId).name;
      void guard(async () => {
        await socialApi.removeFriend(userId);
        await refreshFriends();
        toast(`Removed ${name}`, 'warn');
      });
    },

    /* ---- trust & safety ---- */

    refreshBlocks: async () => {
      const { blocked } = await meApi.listBlocks();
      mergeUsers(blocked);
      set({ blockedIds: blocked.map(u => u.id), blockedUsers: blocked });
    },
    blockUser: async (userId) => {
      const name = get().userById(userId).name;
      try {
        await meApi.block(userId);
        // Server also removes the friendship; mirror locally so UI updates
        // immediately without waiting for a bootstrap refresh.
        set(state => ({
          blockedIds: state.blockedIds.includes(userId)
            ? state.blockedIds
            : [...state.blockedIds, userId],
          friendIds: state.friendIds.filter(id => id !== userId),
        }));
        await get().refreshBlocks();
        toast(`Blocked ${name}`, 'warn');
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not block user', 'warn');
      }
    },
    unblockUser: async (userId) => {
      const name = get().userById(userId).name;
      try {
        await meApi.unblock(userId);
        set(state => ({
          blockedIds: state.blockedIds.filter(id => id !== userId),
          blockedUsers: state.blockedUsers.filter(u => u.id !== userId),
        }));
        toast(`Unblocked ${name}`, 'success');
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not unblock user', 'warn');
      }
    },
    isBlocked: (userId) => get().blockedIds.includes(userId),
    openReportSheet: (target) => set({ reportSheet: target }),
    reportTarget: async (input) => {
      try {
        await safetyApi.report(input);
        toast('Report sent — thanks for letting us know', 'success');
        return true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not send report', 'warn');
        return false;
      }
    },
    acceptFriendRequest: (requestId) => {
      const req = get().friendRequests.find(r => r.id === requestId);
      void guard(async () => {
        await socialApi.acceptRequest(requestId);
        await refreshFriendRequests();
        await refreshFriends();
        await refreshNotifications();   // the 'invite' alert is now resolved
        if (req) toast(`You're now friends with ${req.from.name}`, 'success');
      });
    },
    declineFriendRequest: (requestId) => {
      void guard(async () => {
        await socialApi.declineRequest(requestId);
        await refreshFriendRequests();
        await refreshNotifications();   // the 'invite' alert is now resolved
      });
    },
    cancelFriendRequest: (requestId) => {
      // Optimistically drop the row so the Sent list updates instantly —
      // the server call is idempotent (no-op if the row already moved out
      // of 'pending'), so a race with another tab is harmless.
      const target = get().outgoingRequests.find(r => r.id === requestId);
      set(s => ({ outgoingRequests: s.outgoingRequests.filter(r => r.id !== requestId) }));
      void guard(async () => {
        await socialApi.cancelRequest(requestId);
        await refreshOutgoingRequests();
        if (target) toast(`Cancelled request to ${target.to.name}`, 'warn');
      });
    },

    /* ---- profile / settings ---- */

    updateMe: (patch) => {
      void guard(async () => {
        const { user } = await meApi.update(patch);
        mergeUsers([user]);
        toast('Profile updated', 'success');
      });
    },
    updateSettings: (patch) => {
      // Optimistic — settings toggles should feel instant.
      set(state => ({ settings: { ...state.settings, ...patch } }));
      void guard(async () => {
        const { settings } = await meApi.updateSettings(patch);
        set({ settings });
      });
    },

    /* ---- squads ---- */

    createSquad: ({ name, emoji, memberIds }) => {
      void guard(async () => {
        await socialApi.createSquad({ name, emoji, memberIds });
        await refreshSquads();
        toast(`Created squad ${emoji || '✨'} ${name}`, 'success');
      });
    },
    updateSquad: (squadId, patch) => {
      void guard(async () => {
        await socialApi.updateSquad(squadId, patch);
        await refreshSquads();
      });
    },
    deleteSquad: (squadId) => {
      const name = get().squads.find(s => s.id === squadId)?.name ?? 'squad';
      void guard(async () => {
        await socialApi.deleteSquad(squadId);
        await refreshSquads();
        await refreshFeed();   // squad-tagged plans may change visibility
        toast(`Deleted ${name}`, 'warn');
      });
    },
    addMemberToSquad: (squadId, userId) => {
      void guard(async () => {
        await socialApi.addSquadMember(squadId, userId);
        await refreshSquad(squadId);
      });
    },
    removeMemberFromSquad: (squadId, userId) => {
      void guard(async () => {
        await socialApi.removeSquadMember(squadId, userId);
        await refreshSquad(squadId);
      });
    },
    leaveSquad: (squadId) => {
      const sq = get().squads.find(s => s.id === squadId);
      void guard(async () => {
        await socialApi.leaveSquad(squadId);
        await refreshSquads();
        if (sq) toast(`Left ${sq.emoji} ${sq.name}`, 'warn');
      });
    },
    sendSquadChat: (squadId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const localId = uid();
      addPending(`squad:${squadId}`, {
        id: `pending-${localId}`,
        authorId: get().meId,
        at: Date.now(),
        type: 'text',
        text: trimmed,
        pending: true,
        localId,
      });
      void sendWithCleanup(`squad:${squadId}`, localId, async () => {
        await chatApi.squadSend(squadId, trimmed);
        await refreshSquad(squadId);
      });
    },
    sendSquadChatPhoto: (squadId, file, caption) => {
      const localId = uid();
      // Generate a store-owned blob URL for the optimistic photo bubble.
      // Revoked alongside the placeholder when the server confirms (or fails).
      const previewUrl = URL.createObjectURL(file);
      addPending(`squad:${squadId}`, {
        id: `pending-${localId}`,
        authorId: get().meId,
        at: Date.now(),
        type: 'photo',
        photoUrl: previewUrl,
        text: caption,
        pending: true,
        localId,
      });
      void sendWithCleanup(
        `squad:${squadId}`,
        localId,
        async () => {
          const { url } = await uploadApi.photo(file);
          await chatApi.squadSendPhoto(squadId, url, caption);
          await refreshSquad(squadId);
        },
        () => URL.revokeObjectURL(previewUrl),
      );
    },

    /* ---- activities ---- */

    postActivity: (input) => {
      void guard(async () => {
        const { activity, users } = await activityApi.create({
          category: input.category,
          customEmoji: input.customEmoji,
          customLabel: input.customLabel,
          title: input.title,
          place: input.place,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          maxSize: input.maxSize,
          isPrivate: input.isPrivate,
          isOpenInvite: input.isOpenInvite,
          bannerUrl: input.bannerUrl,
          recurrence: input.recurrence,
          squadIds: input.squadIds,
        });
        mergeUsers(users);
        upsertActivity(activity);
        subscribeChannel(`activity:${activity.id}`);
        set({ showPostSheet: false });
        toast('Posted — your squad can see it', 'success');
      });
    },

    updateActivity: async (activityId, patch) => {
      try {
        const { activity, users } = await activityApi.update(activityId, patch);
        mergeUsers(users);
        upsertActivity(activity);
        toast('Plan updated', 'success');
        return true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not save changes', 'warn');
        return false;
      }
    },

    /* ---- floats ---- */

    postFloat: async (input) => {
      try {
        const { float, users } = await floatApi.create(input);
        mergeUsers(users);
        upsertFloat(float);
        toast('Floated 🎈', 'success');
        return float;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not float that', 'warn');
        return null;
      }
    },

    respondToFloat: (floatId, state) => {
      // Optimistic: stamp the response locally before the round-trip lands so
      // the tally bar feels instant. The server result rehydrates on success;
      // on failure we revert and toast.
      const myId = get().meId;
      const before = get().floats.find(f => f.id === floatId);
      if (!before) return;
      const existing = before.responses.find(r => r.userId === myId);
      const wasSame = existing?.state === state;
      const optimisticResponses = wasSame
        ? before.responses.filter(r => r.userId !== myId)  // toggle off
        : [
            ...before.responses.filter(r => r.userId !== myId),
            { userId: myId, state, at: Date.now() },
          ];
      upsertFloat({ ...before, responses: optimisticResponses });

      void (async () => {
        try {
          // If we already had this state, the server's PUT just re-asserts it;
          // we'd want a DELETE-like toggle for "tap again to clear" but the
          // server treats responses as last-writer-wins. Re-asserting is fine
          // and keeps the client/server in sync.
          const { float, users } = await floatApi.respond(floatId, state);
          mergeUsers(users);
          upsertFloat(float);
        } catch (e) {
          upsertFloat(before);  // revert
          toast(e instanceof ApiError ? e.message : 'Could not respond', 'warn');
        }
      })();
    },

    lockFloat: async (floatId, input) => {
      try {
        const { float, activityId } = await floatApi.lock(floatId, {
          category: input.category ?? 'custom',
          customEmoji: '🎈',
          customLabel: 'Float',
          title: input.title,
          place: input.place,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          maxSize: input.maxSize,
          isPrivate: input.isPrivate,
          isOpenInvite: input.isOpenInvite,
          squadIds: input.squadIds,
        });
        upsertFloat(float);
        // Pull the newly-created activity into the local cache so the user
        // can jump straight into it from the float card.
        try {
          const { activity, users } = await activityApi.get(activityId);
          mergeUsers(users);
          upsertActivity(activity);
          subscribeChannel(`activity:${activityId}`);
        } catch { /* non-fatal */ }
        toast('Locked in 🎉', 'success');
        set({ lockingFloatId: null });
        return activityId;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not lock it in', 'warn');
        return null;
      }
    },

    removeFloat: (floatId) => {
      removeFloatLocal(floatId);
      void (async () => {
        try { await floatApi.remove(floatId); }
        catch (e) {
          // Restore from server if the local removal was premature.
          void refreshFloats();
          toast(e instanceof ApiError ? e.message : 'Could not delete float', 'warn');
        }
      })();
    },

    setLockingFloatId: (id) => set({ lockingFloatId: id }),

    joinActivity: (activityId) => get().setRsvp(activityId, 'going'),

    setRsvp: (activityId, state) => {
      void guard(async () => {
        const { activity, users } = await activityApi.rsvp(activityId, state);
        mergeUsers(users);
        upsertActivity(activity);
        const hostName = get().userById(activity.hostId).name;
        const msg =
          state === 'going' ? `You're going to ${hostName}'s plan` :
          state === 'maybe' ? `Marked maybe for ${hostName}'s plan` :
          state === 'cant' ? `Told ${hostName} you can't make it` :
          'Cleared your RSVP';
        toast(msg, state === 'cant' ? 'warn' : state === 'going' ? 'success' : 'default');
      });
    },

    inviteToActivity: async (activityId, userIds) => {
      try {
        const res = await activityApi.invite(activityId, userIds);
        if (res.invited > 0) {
          toast(`Invited ${res.invited} ${res.invited === 1 ? 'friend' : 'friends'}`, 'success');
        } else if (res.alreadyGoing > 0 && res.notFriend === 0) {
          toast('Everyone you picked is already going', 'default');
        } else if (res.notFriend > 0 && res.alreadyGoing === 0) {
          toast('You can only invite your friends', 'warn');
        } else {
          toast('Nothing to send', 'default');
        }
        return res;
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? 'Could not send invites';
        toast(msg, 'warn');
        return { invited: 0, alreadyGoing: 0, notFriend: userIds.length };
      }
    },

    leaveActivity: (activityId) => {
      void guard(async () => {
        const { dissolved, activity, users } = await activityApi.leave(activityId);
        mergeUsers(users);
        if (dissolved || !activity) {
          removeActivity(activityId);
          toast('Plan dissolved — no one had joined', 'warn');
        } else {
          upsertActivity(activity);
          toast('You left the plan', 'default');
        }
      });
    },

    toggleReaction: (activityId, emoji) => {
      void guard(async () => {
        const { activity, users } = await activityApi.react(activityId, emoji);
        mergeUsers(users);
        upsertActivity(activity);
      });
    },

    /* ---- chat ---- */

    sendChat: (activityId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const localId = uid();
      addPending(`activity:${activityId}`, {
        id: `pending-${localId}`,
        authorId: get().meId,
        at: Date.now(),
        type: 'text',
        text: trimmed,
        pending: true,
        localId,
      });
      void sendWithCleanup(`activity:${activityId}`, localId, async () => {
        await chatApi.send(activityId, trimmed);
        await refreshActivity(activityId);
      });
    },
    sendChatPhoto: (activityId, file, caption) => {
      const localId = uid();
      const previewUrl = URL.createObjectURL(file);
      addPending(`activity:${activityId}`, {
        id: `pending-${localId}`,
        authorId: get().meId,
        at: Date.now(),
        type: 'photo',
        photoUrl: previewUrl,
        text: caption,
        pending: true,
        localId,
      });
      void sendWithCleanup(
        `activity:${activityId}`,
        localId,
        async () => {
          const { url } = await uploadApi.photo(file);
          await chatApi.sendPhoto(activityId, url, caption);
          await refreshActivity(activityId);
        },
        () => URL.revokeObjectURL(previewUrl),
      );
    },
    sendPoll: (activityId, question, optionTexts) => {
      const localId = uid();
      // Close the composer right away so the optimistic poll bubble is
      // visible in the chat instead of competing with the open sheet.
      set({ pollComposerActivityId: null });
      addPending(`activity:${activityId}`, {
        id: `pending-${localId}`,
        authorId: get().meId,
        at: Date.now(),
        type: 'poll',
        // Fake option ids — they're only used until the server-issued poll
        // arrives. The render layer treats pending polls as read-only.
        poll: {
          question,
          options: optionTexts.map((text, i) => ({
            id: `pending-opt-${i}`,
            text,
            voterIds: [],
          })),
        },
        pending: true,
        localId,
      });
      void sendWithCleanup(`activity:${activityId}`, localId, async () => {
        await chatApi.sendPoll(activityId, question, optionTexts);
        await refreshActivity(activityId);
      });
    },
    voteInPoll: (activityId, messageId, optionId) => {
      void guard(async () => {
        await chatApi.vote(messageId, optionId);
        await refreshActivity(activityId);
      });
    },
    toggleMessageReaction: (activityId, messageId, emoji) => {
      // Optimistic flip — search the existing reactions for my own entry on
      // this emoji; insert if missing, remove if present. The server's
      // realtime broadcast will reconcile any race the moment it lands.
      const meId = get().meId;
      const flip = (existing: { emoji: string; userId: string; at: number }[] | undefined) => {
        const arr = existing ?? [];
        const mine = arr.find(r => r.userId === meId && r.emoji === emoji);
        const next = mine
          ? arr.filter(r => !(r.userId === meId && r.emoji === emoji))
          : [...arr, { emoji, userId: meId, at: Date.now() }];
        return next.length ? next : undefined;
      };
      set(s => ({
        activities: s.activities.map(a => a.id !== activityId ? a : {
          ...a,
          chat: a.chat.map(m => m.id !== messageId ? m : { ...m, reactions: flip(m.reactions) }),
        }),
      }));
      void guard(async () => {
        await chatApi.reactToMessage(messageId, emoji);
        await refreshActivity(activityId);
      });
    },
    toggleSquadMessageReaction: (squadId, messageId, emoji) => {
      const meId = get().meId;
      const flip = (existing: { emoji: string; userId: string; at: number }[] | undefined) => {
        const arr = existing ?? [];
        const mine = arr.find(r => r.userId === meId && r.emoji === emoji);
        const next = mine
          ? arr.filter(r => !(r.userId === meId && r.emoji === emoji))
          : [...arr, { emoji, userId: meId, at: Date.now() }];
        return next.length ? next : undefined;
      };
      set(s => ({
        squads: s.squads.map(sq => sq.id !== squadId ? sq : {
          ...sq,
          chat: sq.chat.map(m => m.id !== messageId ? m : { ...m, reactions: flip(m.reactions) }),
        }),
      }));
      void guard(async () => {
        await chatApi.reactToMessage(messageId, emoji);
        await refreshSquad(squadId);
      });
    },

    /* ---- host transfer ---- */

    acceptHostOffer: (notificationId) => {
      const n = get().notifications.find(x => x.id === notificationId);
      if (!n?.activityId) return;
      void guard(async () => {
        const { activity, users } = await activityApi.hostAccept(n.activityId!);
        mergeUsers(users);
        upsertActivity(activity);
        await refreshNotifications();
        toast("You're the new host 👑", 'success');
      });
    },
    declineHostOffer: (notificationId) => {
      const n = get().notifications.find(x => x.id === notificationId);
      if (!n?.activityId) return;
      void guard(async () => {
        const { dissolved, activity, users } = await activityApi.hostDecline(n.activityId!);
        mergeUsers(users);
        if (dissolved || !activity) removeActivity(n.activityId!);
        else upsertActivity(activity);
        await refreshNotifications();
        toast('Passed on hosting', 'default');
      });
    },

    /* ---- notifications + ping ---- */

    markAllNotificationsRead: () => {
      set(state => ({ notifications: state.notifications.map(x => ({ ...x, read: true })) }));
      void miscApi.markRead().catch(() => undefined);
    },

    clearAllNotifications: () => {
      // Optimistic — empty the inbox immediately. If the round-trip fails we
      // re-pull, so a stale-cache reappearance is the worst-case outcome.
      const before = get().notifications;
      set({ notifications: [] });
      void (async () => {
        try {
          await miscApi.clearAll();
          toast('Inbox cleared', 'success');
        } catch {
          set({ notifications: before });
          toast('Could not clear notifications', 'warn');
        }
      })();
    },

    pingFriends: (text, recipientIds, squadId) => {
      void guard(async () => {
        const s = get();
        let recipients: string[];
        if (squadId) {
          const sq = s.squads.find(x => x.id === squadId);
          recipients = sq ? sq.memberIds.filter(id => s.friendIds.includes(id)) : [];
        } else {
          recipients = (recipientIds ?? s.friendIds).filter(id => s.friendIds.includes(id));
        }
        if (recipients.length === 0) {
          toast('Pick at least one friend to ping', 'warn');
          return;
        }
        const { delivered } = await miscApi.ping(text, recipients);
        // Name-aware confirmation. Resolves recipient names from the user
        // cache so the toast reads "You pinged Sarah" instead of the old
        // anonymous "Pinged 1 friend". Falls back to a count phrase once
        // we get past a handful of recipients so the toast doesn't grow
        // unbounded ("You pinged Sarah, Mike + 4 more").
        const after = get();
        const names = recipients.map(id => after.userById(id).name);
        const namePhrase =
          names.length === 1 ? names[0]
          : names.length === 2 ? `${names[0]} and ${names[1]}`
          : names.length <= 4 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
          : `${names[0]}, ${names[1]} + ${names.length - 2} more`;
        toast(`You pinged ${namePhrase} 👋`, 'success');
        // delivered may differ from recipients.length when some recipients
        // have pings disabled — surface that quietly so the sender knows
        // a few of them won't actually see the ping.
        if (delivered < recipients.length) {
          const skipped = recipients.length - delivered;
          toast(`${skipped} ${skipped === 1 ? 'friend has' : 'friends have'} pings off`, 'default');
        }
      });
    },

    /* ---- reminders ---- */

    setReminderForActivity: (activityId, mins) => {
      // Wire encoding: undefined → 'default', null → 'off', number → number.
      const wire = mins === undefined ? 'default' : mins === null ? 'off' : mins;
      void guard(async () => {
        const { activity, users } = await activityApi.patch(activityId, { reminderMins: wire });
        mergeUsers(users);
        upsertActivity(activity);
      });
    },

    /* ---- toasts ---- */

    pushToast: (text, tone = 'default') => toast(text, tone),

    refreshAll: async () => {
      // Re-pull everything that's served by the long-lived realtime + 30-s
      // background tick. Each is independent so we fire them in parallel.
      await Promise.allSettled([
        refreshFeed(),
        refreshFloats(),
        refreshNotifications(),
        refreshFriends(),
      ]);
    },

    dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
  };
});

/* ============ pure helpers (no store access) ============ */

/**
 * O(1) user-by-id lookup, keyed off the current `users` array reference.
 * The Map is rebuilt the first time we see a new `users` reference and
 * cached for every subsequent call until the array changes again — so a
 * single feed render that calls userById() dozens of times pays the
 * rebuild cost once and gets hash lookups for the rest.
 *
 * Identity (===) comparison on the array reference is enough because the
 * store always replaces the whole array on update (immutable update
 * pattern). We never mutate `users` in place.
 */
let userMapCacheUsers: User[] | null = null;
let userMapCache: Map<string, User> = new Map();
function userMapFor(users: User[]): Map<string, User> {
  if (users !== userMapCacheUsers) {
    userMapCache = new Map();
    for (const u of users) userMapCache.set(u.id, u);
    userMapCacheUsers = users;
  }
  return userMapCache;
}

/**
 * Stable fallback User for an id we don't have loaded. Cached per-id so the
 * SAME object reference is returned every call — required so selectors that
 * call userById()/me() don't churn React with a new snapshot each render.
 */
const fallbackUserCache = new Map<string, User>();
function fallbackUser(id: string): User {
  let u = fallbackUserCache.get(id);
  if (!u) {
    u = {
      id,
      name: id ? 'Unknown' : 'You',
      handle: id ? 'unknown' : 'you',
      avatar: id ? '👤' : '✨',
      color: id ? 'from-slate-400 to-slate-700' : 'from-rose-400 to-orange-500',
    };
    fallbackUserCache.set(id, u);
  }
  return u;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) if (!map.has(it.id)) map.set(it.id, it);
  return [...map.values()];
}

function dedupeUsers(users: User[]): User[] {
  const map = new Map<string, User>();
  for (const u of users) map.set(u.id, u);   // later wins (live status etc.)
  return [...map.values()];
}

/** An activity is "over" once its end time has passed. */
export function isPast(a: { endsAt: number }): boolean {
  return a.endsAt < Date.now();
}

/** True if the activity's [startsAt, endsAt] window covers `now`. */
export function isLiveActivity(a: { startsAt: number; endsAt: number }): boolean {
  const ts = Date.now();
  return a.startsAt <= ts && ts <= a.endsAt;
}

/** Resolve the active reminder lead time (mins) for an activity; null = off. */
export function effectiveReminderMins(
  a: { reminderMins?: number | null },
  defaultMins: number | null,
): number | null {
  if (a.reminderMins === undefined) return defaultMins;
  return a.reminderMins;
}

/** Human label for a reminder lead value (mins | null). */
export function reminderLabel(mins: number | null): string {
  if (mins === null) return 'Off';
  if (mins < 60) return `${mins} min before`;
  return `${mins / 60}h before`;
}

/** Human label for a recurrence rule. Returns null when there is none. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function recurrenceLabel(r?: {
  freq: 'daily' | 'weekly' | 'biweekly';
  weekday?: number;
}): string | null {
  if (!r) return null;
  if (r.freq === 'daily') return 'Daily';
  if (r.freq === 'weekly') return `Every ${WEEKDAY_NAMES[r.weekday ?? 0]}`;
  if (r.freq === 'biweekly') return `Every other ${WEEKDAY_NAMES[r.weekday ?? 0]}`;
  return null;
}

/** Format a relative time like "in 30m" / "5m ago". For >=1 day, appends the
 *  weekday + short date so plans more than a day out have a concrete anchor
 *  ("in 4d · Sat Jun 14") rather than just a vague "in Nd". */
export function relTime(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  if (m < 1) return diff >= 0 ? 'now' : 'just now';
  if (m < 60) return diff >= 0 ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return diff >= 0 ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  const date = new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return diff >= 0 ? `in ${d}d · ${date}` : `${d}d ago · ${date}`;
}

/** Format a time like "7:42 PM". */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Friendly day label for a future timestamp — "Tonight" / "Tomorrow" /
 * weekday name within a week / fallback short date.
 *
 *   Today's evening   → "Tonight"
 *   Tomorrow          → "Tomorrow"
 *   Within 7 days     → "Friday"
 *   Further out       → "Mar 12"
 */
export function relDayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (dayDiff === 0) return 'Tonight';
  if (dayDiff === 1) return 'Tomorrow';
  if (dayDiff > 1 && dayDiff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
