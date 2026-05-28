import { create } from 'zustand';
import { categoryFor } from './data/categories';
import type { Activity, AppNotification, CategoryKey, Recurrence, Squad, User } from './types';
import { ApiError, tokens } from './api/client';
import {
  activityApi, authApi, chatApi, getBootstrap, meApi, miscApi, safetyApi, socialApi, uploadApi,
} from './api/endpoints';
import {
  connectRealtime, disconnectRealtime, type RealtimeEvent,
  subscribeChannel,
} from './api/socket';
import { notify, registerPushAfterAuth } from './native';

const uid = () => Math.random().toString(36).slice(2, 10);

type Tab = 'feed' | 'ping' | 'notifications' | 'profile';
type FeedScope = 'friends' | 'fof';
/** Top-level app screen — splash → welcome → auth → onboarding → main app. */
export type AuthState = 'splash' | 'welcome' | 'auth' | 'onboarding' | 'app';

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
  pingsEnabled: boolean;
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
  notifications: AppNotification[];
  squads: Squad[];

  // UI
  tab: Tab;
  openActivityId: string | null;
  showPostSheet: boolean;
  feedScope: FeedScope;
  overlay: Overlay;
  toasts: Toast[];
  settings: AppSettings;

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
  signUp: (input: { name: string; handle: string; avatar?: string; color?: string; dateOfBirth: number }) => void;
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
  /** Admin/demo login — loads the seeded sample dataset. */
  loadDemoData: () => void;
  signOut: () => void;
  /** Permanently erase the account, then return to the welcome screen. */
  deleteAccount: () => void;

  setTab: (t: Tab) => void;
  openActivity: (id: string | null) => void;
  setShowPostSheet: (b: boolean) => void;
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

  /** Incoming friend requests awaiting my response. */
  friendRequests: { id: string; from: User; at: number }[];
  addFriend: (userId: string) => void;
  removeFriend: (userId: string) => void;
  acceptFriendRequest: (requestId: string) => void;
  declineFriendRequest: (requestId: string) => void;
  updateMe: (patch: Partial<Pick<User, 'name' | 'handle' | 'avatar' | 'color' | 'photoUrl'>>) => void;
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

  setLiveStatus: (input: {
    emoji: string; text: string; durationMins: number; place?: string; openToJoin?: boolean;
  }) => void;
  clearLiveStatus: () => void;
  showGoLiveSheet: boolean;
  setShowGoLiveSheet: (b: boolean) => void;
  openLiveUserId: string | null;
  setOpenLiveUserId: (id: string | null) => void;

  postActivity: (input: {
    category: CategoryKey;
    customEmoji?: string;
    customLabel?: string;
    title: string;
    place: string;
    startsAt: number;
    description: string;
    maxSize?: number;
    isPrivate?: boolean;
    bannerUrl?: string;
    recurrence?: Recurrence;
    squadIds?: string[];
    isOpenInvite?: boolean;
  }) => void;

  joinActivity: (activityId: string) => void;
  leaveActivity: (activityId: string) => void;
  setRsvp: (activityId: string, state: RsvpState) => void;

  sendChat: (activityId: string, text: string) => void;
  sendChatPhoto: (activityId: string, file: File, caption?: string) => void;
  sendPoll: (activityId: string, question: string, optionTexts: string[]) => void;
  voteInPoll: (activityId: string, messageId: string, optionId: string) => void;
  toggleReaction: (activityId: string, emoji: string) => void;

  pollComposerActivityId: string | null;
  setPollComposerActivityId: (id: string | null) => void;
  acceptHostOffer: (notificationId: string) => void;
  declineHostOffer: (notificationId: string) => void;

  markAllNotificationsRead: () => void;
  pingFriends: (text: string, recipientIds?: string[], squadId?: string) => void;

  setReminderForActivity: (activityId: string, mins: number | null | undefined) => void;

  pushToast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
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
      // Replace the upcoming partition; keep past activities (History) intact.
      activities: dedupeById([
        ...activities,
        ...state.activities.filter(a => a.startsAt < Date.now()),
      ]),
    }));
    syncSubscriptions();
  };

  const refreshHistory = async () => {
    const { activities, users } = await activityApi.history();
    mergeUsers(users);
    set(state => ({
      activities: dedupeById([
        ...state.activities.filter(a => a.startsAt >= Date.now()),
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

  const refreshFriends = async () => {
    const { friends } = await socialApi.friends();
    mergeUsers(friends);
    set({ friendIds: friends.map(u => u.id) });
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
      void refreshFriends();      // friends carry current liveStatus
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
      users: dedupeUsers([b.user, ...b.users, ...b.live]),
      friendIds: b.friendIds,
      activities: dedupeById(b.activities),
      squads: b.squads,
      notifications: b.notifications,
      settings: b.settings,
      authState: 'app',
      tab: 'feed',
    });
    connectRealtime(handleRealtime);
    syncSubscriptions();
    void refreshFriendRequests();   // load any pending incoming requests
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
  const completeFirebaseSignin = async (
    token: string,
    provider: 'apple' | 'google' | 'email',
    fallbackErrorMsg: string,
  ): Promise<void> => {
    try {
      const r = await authApi.firebase({ idToken: token });
      tokens.set(r.accessToken, r.refreshToken);
      await doBootstrap();
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
  const firebaseProviderSignin = async (provider: 'apple' | 'google') => {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      if (provider === 'apple') await FirebaseAuthentication.signInWithApple();
      else                       await FirebaseAuthentication.signInWithGoogle();
      const { token } = await FirebaseAuthentication.getIdToken();
      if (!token) throw new Error('No ID token from Firebase');
      await completeFirebaseSignin(token, provider, `Could not sign in with ${provider}`);
    } catch (e) {
      const msg = friendlyFirebaseError(e, `Could not sign in with ${provider}`);
      if (msg) toast(msg, 'warn');
    }
  };

  /**
   * Sign up with email + password through Firebase. Creates the Firebase
   * user, fires a verification email, then routes to onboarding (which
   * completes the WUD account with handle + DOB).
   */
  const firebaseEmailSignup = async (email: string, password: string) => {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.createUserWithEmailAndPassword({ email, password });
      // Fire-and-forget — the verification email is sent in the background.
      // If it fails the user can resend from the in-app banner.
      void FirebaseAuthentication.sendEmailVerification().catch(() => undefined);
      const { token } = await FirebaseAuthentication.getIdToken();
      if (!token) throw new Error('No ID token from Firebase');
      await completeFirebaseSignin(token, 'email', 'Could not create your account');
    } catch (e) {
      const msg = friendlyFirebaseError(e, 'Could not create your account');
      if (msg) toast(msg, 'warn');
    }
  };

  /**
   * Log in with email + password. Tries Firebase first (for accounts created
   * after the auth migration), then falls back to the legacy /v1/auth/email/
   * login endpoint (for users like the demo admin that pre-date Firebase).
   * Either path produces a WUD session.
   */
  const firebaseEmailLogin = async (email: string, password: string) => {
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
  };

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

  /** Wrap an async action: surface ApiErrors as toasts, never throw to the UI. */
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong', 'warn');
    }
  };

  /* ============ initial state + actions ============ */

  return {
    meId: '',
    users: [],
    friendIds: [],
    friendRequests: [],
    blockedIds: [],
    blockedUsers: [],
    reportSheet: null,
    activities: [],
    notifications: [],
    squads: [],
    authState: 'splash',
    authIntent: 'signup',
    pendingSignup: null,

    tab: 'feed',
    openActivityId: null,
    showPostSheet: false,
    showGoLiveSheet: false,
    openLiveUserId: null,
    pollComposerActivityId: null,
    feedScope: 'fof',
    feedFilters: { timeWindow: 'all', sort: 'soonest' },
    overlay: null,
    toasts: [],
    settings: {
      pushEnabled: true,
      pingsEnabled: true,
      defaultReminderMins: 30,
    },

    /* ---- selectors (compute over store state — unchanged behavior) ---- */

    // me()/userById() return a STABLE cached fallback when the user isn't
    // loaded — a fresh object each call would make useApp() see a new snapshot
    // every render → infinite re-render loop (this is what crashed sign-out).
    me: () => get().users.find(u => u.id === get().meId) ?? fallbackUser(get().meId),
    userById: (id) => get().users.find(u => u.id === id) ?? fallbackUser(id),
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
        .filter(a => a.startsAt >= now)
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
      return s.activities.some(a => a.startsAt >= Date.now() && s.isFoFActivity(a));
    },
    unreadCount: () => get().notifications.filter(n => !n.read).length,

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
        .filter(a => a.startsAt >= now)
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
      // Mirror the feed's visibility logic so the digests match what the user
      // can actually scroll to below — including the friends-vs-FoF toggle.
      const upcoming = s.activities
        .filter(a => a.startsAt >= now)
        .filter(a => s.canSeeActivity(a))
        .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a));

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
        out.push({
          kind: 'morning_pulse',
          count: todayPlans.length,
          friendsGoing: friendsToday.size,
          emoji: '🌅',
          text: friendsToday.size > 0
            ? `Good morning — ${todayPlans.length} plans today, ${friendsToday.size} friend${friendsToday.size === 1 ? '' : 's'} out`
            : `Good morning — ${todayPlans.length} plans today`,
          tap: { action: 'filter', apply: { timeWindow: 'today' } },
        });
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
        // tiebreak. Tapping the card opens that single plan instead of
        // dumping the user into a week-wide filter where they have to hunt.
        const primary = [...biggest.activities].sort((a, b) =>
          friendCount(b) - friendCount(a) || a.startsAt - b.startsAt,
        )[0];
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
      const soon = upcoming.filter(a => a.startsAt - now <= HOUR);
      if (soon.length >= 1) {
        out.push({
          kind: 'starting_soon', count: soon.length, emoji: '⏰',
          text: soon.length === 1
            ? '1 plan starting in the next hour'
            : `${soon.length} plans starting in the next hour`,
          tap: soon.length === 1
            ? { action: 'open', activityId: soon[0].id }
            : { action: 'filter', apply: { timeWindow: 'now' } },
        });
      }

      // -- Category cluster — filter is the right action (the card's whole job
      //    is to surface a worth-scanning group of plans).
      const tally = new Map<string, number>();
      for (const a of todayPlans) tally.set(a.category, (tally.get(a.category) ?? 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) {
        const sample = todayPlans.find(a => a.category === top[0])!;
        const c = categoryFor(sample);
        out.push({
          kind: 'category_cluster', category: top[0] as CategoryKey, count: top[1], emoji: c.emoji,
          text: `${top[1]} ${c.label.toLowerCase()} plan${top[1] === 1 ? '' : 's'} today — tap to see them all`,
          tap: { action: 'filter', apply: { category: top[0] as CategoryKey, timeWindow: 'today' } },
        });
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
        .filter(a => a.startsAt >= now)
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
    setTab: (t) => set({ tab: t }),
    setShowPostSheet: (b) => set({ showPostSheet: b }),
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
      return !!f.category || !!f.customLabel || f.timeWindow !== 'all' || f.sort !== 'soonest';
    },
    openOverlay: (o) => {
      set({ overlay: o });
      // Refresh the slice an overlay shows when it opens, so it's never stale.
      if (o === 'history') void refreshHistory();
      else if (o === 'squads') void refreshSquads();
      else if (o === 'friends') { void refreshFriends(); void refreshFriendRequests(); }
    },
    setShowGoLiveSheet: (b) => set({ showGoLiveSheet: b }),
    setOpenLiveUserId: (id) => set({ openLiveUserId: id }),
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

    signUp: ({ name, handle, avatar, color, dateOfBirth }) => {
      void guard(async () => {
        const pending = get().pendingSignup;
        // Firebase path — onboarding completes the signin with an ID token
        // captured when the user tapped Apple / Google on the welcome screen.
        if (pending?.kind === 'firebase') {
          const r = await authApi.firebase({
            idToken: pending.idToken,
            name, handle, avatar, color, dateOfBirth,
          });
          tokens.set(r.accessToken, r.refreshToken);
          set({ pendingSignup: null });
          await doBootstrap();
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
      });
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
        await FirebaseAuthentication.sendEmailVerification();
        toast('Verification email sent — check your inbox.', 'success');
        return true;
      } catch (e) {
        const msg = friendlyFirebaseError(e, 'Could not send verification email');
        if (msg) toast(msg, 'warn');
        return false;
      }
    },

    loadDemoData: () => {
      void guard(async () => {
        try {
          const r = await authApi.login('admin@wud.app', 'admin1234');
          tokens.set(r.accessToken, r.refreshToken);
          await doBootstrap();
          toast('Loaded demo data 🎬', 'success');
        } catch {
          toast('Run the backend seed first: cd server && npm run seed', 'warn');
        }
      });
    },

    signOut: () => {
      const refresh = tokens.refresh;
      if (refresh) void authApi.logout(refresh).catch(() => undefined);
      // Tear down the Firebase session too so a returning user gets the
      // signin sheet next time, not the previous account auto-restored.
      void firebaseSignOutSilent();
      disconnectRealtime();
      tokens.clear();
      set({
        meId: '', users: [], friendIds: [], friendRequests: [], blockedIds: [], blockedUsers: [], activities: [],
        notifications: [], squads: [],
        tab: 'feed', openActivityId: null, openLiveUserId: null, showPostSheet: false,
        showGoLiveSheet: false, pollComposerActivityId: null, overlay: null,
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
          meId: '', users: [], friendIds: [], friendRequests: [], blockedIds: [], blockedUsers: [], activities: [],
          notifications: [], squads: [],
          tab: 'feed', openActivityId: null, openLiveUserId: null, showPostSheet: false,
          showGoLiveSheet: false, pollComposerActivityId: null, overlay: null,
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
        await refreshFriends();
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
      if (!text.trim()) return;
      void guard(async () => {
        await chatApi.squadSend(squadId, text);
        await refreshSquad(squadId);
      });
    },
    sendSquadChatPhoto: (squadId, file, caption) => {
      void guard(async () => {
        const { url } = await uploadApi.photo(file);
        await chatApi.squadSendPhoto(squadId, url, caption);
        await refreshSquad(squadId);
      });
    },

    /* ---- live status ---- */

    setLiveStatus: ({ emoji, text, durationMins, place, openToJoin }) => {
      void guard(async () => {
        const { liveStatus } = await miscApi.setLive({ emoji, text, durationMins, place, openToJoin });
        set(state => ({
          users: state.users.map(u => (u.id === state.meId ? { ...u, liveStatus } : u)),
          showGoLiveSheet: false,
        }));
        toast(`You're live: ${emoji} ${text}`, 'success');
      });
    },
    clearLiveStatus: () => {
      void guard(async () => {
        await miscApi.clearLive();
        set(state => ({
          users: state.users.map(u => (u.id === state.meId ? { ...u, liveStatus: undefined } : u)),
        }));
        toast('Went offline', 'default');
      });
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
      if (!text.trim()) return;
      void guard(async () => {
        await chatApi.send(activityId, text);
        await refreshActivity(activityId);
      });
    },
    sendChatPhoto: (activityId, file, caption) => {
      void guard(async () => {
        const { url } = await uploadApi.photo(file);
        await chatApi.sendPhoto(activityId, url, caption);
        await refreshActivity(activityId);
      });
    },
    sendPoll: (activityId, question, optionTexts) => {
      void guard(async () => {
        await chatApi.sendPoll(activityId, question, optionTexts);
        set({ pollComposerActivityId: null });
        await refreshActivity(activityId);
      });
    },
    voteInPoll: (activityId, messageId, optionId) => {
      void guard(async () => {
        await chatApi.vote(messageId, optionId);
        await refreshActivity(activityId);
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
        toast(`Pinged ${delivered} friend${delivered === 1 ? '' : 's'}: "${text}"`, 'success');
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
    dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
  };
});

/* ============ pure helpers (no store access) ============ */

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

/** An activity is "over" once its start time has passed. */
export function isPast(a: { startsAt: number }): boolean {
  return a.startsAt < Date.now();
}

/** A user is "live" when they have an unexpired liveStatus. */
export function isLive(u: { liveStatus?: { expiresAt: number } }): boolean {
  return !!u.liveStatus && u.liveStatus.expiresAt > Date.now();
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

/** Format a relative time like "in 30m" / "5m ago". */
export function relTime(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  if (m < 1) return diff >= 0 ? 'now' : 'just now';
  if (m < 60) return diff >= 0 ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return diff >= 0 ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return diff >= 0 ? `in ${d}d` : `${d}d ago`;
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
