import { create } from 'zustand';
import { categoryFor } from './data/categories';
import type { Activity, AppNotification, CategoryKey, Recurrence, Squad, User } from './types';
import { ApiError, tokens } from './api/client';
import {
  activityApi, authApi, chatApi, getBootstrap, meApi, miscApi, socialApi,
} from './api/endpoints';
import {
  connectRealtime, disconnectRealtime, type RealtimeEvent,
  subscribeChannel,
} from './api/socket';

const uid = () => Math.random().toString(36).slice(2, 10);

type Tab = 'feed' | 'ping' | 'notifications' | 'profile';
type FeedScope = 'friends' | 'fof';
/** Top-level app screen — splash → welcome → auth → onboarding → main app. */
export type AuthState = 'splash' | 'welcome' | 'auth' | 'onboarding' | 'app';

/** A "For you" suggestion card shown above the Feed. Action = filter to apply on tap. */
export type Suggestion =
  | { kind: 'starting_soon'; count: number; emoji: '⏰'; text: string; apply: { timeWindow: 'now' } }
  | { kind: 'category_cluster'; category: CategoryKey; count: number; emoji: string; text: string; apply: { category: CategoryKey; timeWindow: 'today' } }
  | { kind: 'near_me'; count: number; emoji: '📍'; text: string; apply: { nearMe: true } };

/** Discovery filters applied to the Feed (above the existing scope toggle). */
export interface FeedFilters {
  category?: CategoryKey;
  timeWindow: 'now' | 'today' | 'week' | 'all';
  nearMe: boolean;
}

/** Notional "you are here" point on the stylized abstract map (0..1). */
export const YOU_MAP_XY: [number, number] = [0.5, 0.5];
export const NEAR_ME_RADIUS = 0.3;
type Overlay = 'settings' | 'editProfile' | 'friends' | 'history' | 'squads' | 'search' | null;
/** A user's RSVP for an activity. 'none' = cleared. */
export type RsvpState = 'going' | 'maybe' | 'cant' | 'none';

export interface AppSettings {
  pushEnabled: boolean;
  pingsEnabled: boolean;
  hostTransferEnabled: boolean;
  showMeToFoF: boolean;
  defaultPrivate: boolean;
  appearance: 'system' | 'dark' | 'light';
  defaultReminderMins: number | null;
}

interface Toast {
  id: string;
  text: string;
  tone?: 'default' | 'success' | 'warn';
}

/** Auth credentials captured on the auth screen, consumed by completeSignup(). */
interface PendingSignup {
  method: 'email' | 'google' | 'apple' | 'facebook';
  email: string;
  password: string;
}

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
  /** Auth-screen → onboarding: stash email/password for completeSignup(). */
  beginEmailSignup: (email: string, password: string) => void;
  /** Auth-screen → onboarding: mark a social signup. */
  beginSocialSignup: (method: 'google' | 'apple' | 'facebook') => void;
  /** Onboarding finish — registers the account (email or social) and enters the app. */
  signUp: (input: { name: string; handle: string; avatar?: string; color?: string }) => void;
  /** Email log in. */
  logIn: (email: string, password: string) => void;
  /** Social log in (mockup — creates a fresh account). */
  logInSocial: (method: 'google' | 'apple' | 'facebook') => void;
  /** Admin/demo login — loads the seeded sample dataset. */
  loadDemoData: () => void;
  signOut: () => void;

  setTab: (t: Tab) => void;
  openActivity: (id: string | null) => void;
  setShowPostSheet: (b: boolean) => void;
  setFeedScope: (s: FeedScope) => void;
  feedFilters: FeedFilters;
  setFeedFilter: (patch: Partial<FeedFilters>) => void;
  clearFeedFilters: () => void;
  hasActiveFeedFilters: () => boolean;
  trendingCategories: () => { key: CategoryKey; count: number; emoji: string; label: string }[];
  smartSuggestions: () => Suggestion[];
  openOverlay: (o: Overlay) => void;

  /** Incoming friend requests awaiting my response. */
  friendRequests: { id: string; from: User; at: number }[];
  addFriend: (userId: string) => void;
  removeFriend: (userId: string) => void;
  acceptFriendRequest: (requestId: string) => void;
  declineFriendRequest: (requestId: string) => void;
  updateMe: (patch: Partial<Pick<User, 'name' | 'handle' | 'avatar' | 'color' | 'photoUrl'>>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;

  createSquad: (input: { name: string; emoji: string; memberIds: string[] }) => void;
  updateSquad: (squadId: string, patch: Partial<Pick<Squad, 'name' | 'emoji'>>) => void;
  deleteSquad: (squadId: string) => void;
  addMemberToSquad: (squadId: string, userId: string) => void;
  removeMemberFromSquad: (squadId: string, userId: string) => void;
  leaveSquad: (squadId: string) => void;
  sendSquadChat: (squadId: string, text: string) => void;
  sendSquadChatPhoto: (squadId: string, photoUrl: string, caption?: string) => void;
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
  sendChatPhoto: (activityId: string, photoUrl: string, caption?: string) => void;
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
      // Friend-request ('invite') alerts get a friendlier, named toast from the
      // friend.changed handler below — don't double-toast them here.
      if (n?.text && n.type !== 'invite') toast(n.text, 'success');
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
          toast(
            req ? `${req.from.name} wants to be your friend 👋` : 'New friend request 👋',
            'success',
          );
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

  const doBootstrap = async () => {
    const b = await getBootstrap();
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
    feedFilters: { timeWindow: 'all', nearMe: false },
    overlay: null,
    toasts: [],
    settings: {
      pushEnabled: true,
      pingsEnabled: true,
      hostTransferEnabled: true,
      showMeToFoF: true,
      defaultPrivate: false,
      appearance: 'dark',
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
      return s.activities
        .filter(a => a.startsAt >= now)
        .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a))
        .filter(a => !f.category || a.category === f.category)
        .filter(a => {
          const dt = a.startsAt - now;
          if (f.timeWindow === 'now') return dt <= HOUR;
          if (f.timeWindow === 'today') return dt <= DAY;
          if (f.timeWindow === 'week') return dt <= 7 * DAY;
          return true;
        })
        .filter(a => {
          if (!f.nearMe) return true;
          if (a.mapX === undefined || a.mapY === undefined) return false;
          return Math.hypot(a.mapX - YOU_MAP_XY[0], a.mapY - YOU_MAP_XY[1]) <= NEAR_ME_RADIUS;
        })
        .sort((a, b) => a.startsAt - b.startsAt);
    },
    hasFoFAvailable: () => {
      const s = get();
      return s.activities.some(a => a.startsAt >= Date.now() && s.isFoFActivity(a));
    },
    unreadCount: () => get().notifications.filter(n => !n.read).length,

    trendingCategories: () => {
      const s = get();
      const now = Date.now();
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      const pool = s.activities.filter(a => Math.abs(a.startsAt - now) <= WEEK);
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
      const out: Suggestion[] = [];
      const upcoming = s.activities.filter(a => a.startsAt >= now);

      const soon = upcoming.filter(a => a.startsAt - now <= HOUR);
      if (soon.length >= 1) {
        out.push({
          kind: 'starting_soon', count: soon.length, emoji: '⏰',
          text: soon.length === 1
            ? '1 plan starting in the next hour'
            : `${soon.length} plans starting in the next hour`,
          apply: { timeWindow: 'now' },
        });
      }
      const today = upcoming.filter(a => a.startsAt - now <= DAY);
      const tally = new Map<string, number>();
      for (const a of today) tally.set(a.category, (tally.get(a.category) ?? 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) {
        const sample = today.find(a => a.category === top[0])!;
        const c = categoryFor(sample);
        out.push({
          kind: 'category_cluster', category: top[0] as CategoryKey, count: top[1], emoji: c.emoji,
          text: `${top[1]} ${c.label.toLowerCase()} plan${top[1] === 1 ? '' : 's'} today — tap to see them all`,
          apply: { category: top[0] as CategoryKey, timeWindow: 'today' },
        });
      }
      if (!s.feedFilters.nearMe) {
        const near = today.filter(a => {
          if (a.mapX === undefined || a.mapY === undefined) return false;
          return Math.hypot(a.mapX - YOU_MAP_XY[0], a.mapY - YOU_MAP_XY[1]) <= NEAR_ME_RADIUS;
        });
        if (near.length >= 2) {
          out.push({
            kind: 'near_me', count: near.length, emoji: '📍',
            text: `${near.length} plans near you today`, apply: { nearMe: true },
          });
        }
      }
      return out.slice(0, 2);
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
    setFeedFilter: (patch) => set(state => ({ feedFilters: { ...state.feedFilters, ...patch } })),
    clearFeedFilters: () => set({ feedFilters: { timeWindow: 'all', nearMe: false } }),
    hasActiveFeedFilters: () => {
      const f = get().feedFilters;
      return !!f.category || f.timeWindow !== 'all' || f.nearMe;
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
      void doBootstrap().catch(() => {
        tokens.clear();
        set({ authState: 'welcome' });
      });
    },

    beginEmailSignup: (email, password) => {
      set({ pendingSignup: { method: 'email', email, password }, authState: 'onboarding' });
    },
    beginSocialSignup: (method) => {
      set({ pendingSignup: { method, email: '', password: '' }, authState: 'onboarding' });
    },

    signUp: ({ name, handle, avatar, color }) => {
      void guard(async () => {
        const pending = get().pendingSignup ?? { method: 'email', email: '', password: '' };
        if (pending.method === 'email') {
          const r = await authApi.register({
            email: pending.email || `${handle}-${uid()}@wud.app`,
            password: pending.password || 'demo-password',
            name, handle, avatar, color,
          });
          tokens.set(r.accessToken, r.refreshToken);
        } else {
          // Social signup — mockup OAuth with a generated subject.
          const r = await authApi.oauth(pending.method, {
            subject: `${pending.method}-${uid()}-${Date.now()}`,
            name, handle,
          });
          tokens.set(r.accessToken, r.refreshToken);
          // Apply the chosen avatar/color the onboarding screen collected.
          await meApi.update({ name, handle, avatar, color });
        }
        set({ pendingSignup: null });
        await doBootstrap();
      });
    },

    logIn: (email, password) => {
      void guard(async () => {
        const r = await authApi.login(email, password);
        tokens.set(r.accessToken, r.refreshToken);
        await doBootstrap();
      });
    },

    logInSocial: (method) => {
      void guard(async () => {
        const r = await authApi.oauth(method, {
          subject: `${method}-${uid()}-${Date.now()}`,
        });
        tokens.set(r.accessToken, r.refreshToken);
        await doBootstrap();
      });
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
      disconnectRealtime();
      tokens.clear();
      set({
        meId: '', users: [], friendIds: [], friendRequests: [], activities: [],
        notifications: [], squads: [],
        tab: 'feed', openActivityId: null, openLiveUserId: null, showPostSheet: false,
        showGoLiveSheet: false, pollComposerActivityId: null, overlay: null,
        feedFilters: { timeWindow: 'all', nearMe: false },
        pendingSignup: null, authState: 'welcome',
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
    sendSquadChatPhoto: (squadId, photoUrl, caption) => {
      if (!photoUrl) return;
      void guard(async () => {
        await chatApi.squadSendPhoto(squadId, photoUrl, caption);
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
    sendChatPhoto: (activityId, photoUrl, caption) => {
      if (!photoUrl) return;
      void guard(async () => {
        await chatApi.sendPhoto(activityId, photoUrl, caption);
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
