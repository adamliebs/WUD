import { create } from 'zustand';
import { categoryFor } from './data/categories';
import type { Activity, AppNotification, CategoryKey, Recurrence, Squad, User } from './types';
// FOF_VIA powers the FoF visibility check. The SEED_* sets are ONLY loaded by
// loadDemoData() (the admin/demo login) — a fresh signup starts fully empty.
import {
  FOF_VIA, ME_ID, SEED_ACTIVITIES, SEED_FRIEND_IDS, SEED_NOTIFICATIONS, SEED_SQUADS, SEED_USERS,
} from './data/seed';

const uid = () => Math.random().toString(36).slice(2, 10);

type Tab = 'feed' | 'ping' | 'notifications' | 'profile';
type FeedScope = 'friends' | 'fof';
/** Top-level app screen — splash → welcome → auth → onboarding → main app. */
export type AuthState = 'splash' | 'welcome' | 'auth' | 'onboarding' | 'app';
/** Placeholder ID for "me" — reused so all logged-in users have a stable identity. */
const ME_PLACEHOLDER_ID = 'u_me';

/** A "For you" suggestion card shown above the Feed. Action = filter to apply on tap. */
export type Suggestion =
  | { kind: 'starting_soon'; count: number; emoji: '⏰'; text: string; apply: { timeWindow: 'now' } }
  | { kind: 'category_cluster'; category: CategoryKey; count: number; emoji: string; text: string; apply: { category: CategoryKey; timeWindow: 'today' } }
  | { kind: 'near_me'; count: number; emoji: '📍'; text: string; apply: { nearMe: true } };

/** Discovery filters applied to the Feed (above the existing scope toggle). */
export interface FeedFilters {
  category?: CategoryKey;                        // undefined = all categories
  timeWindow: 'now' | 'today' | 'week' | 'all';  // default 'all'
  nearMe: boolean;                               // distance heuristic
}

/** Notional "you are here" point on the stylized abstract map (0..1). */
export const YOU_MAP_XY: [number, number] = [0.5, 0.5];
/** Anything within this normalized radius of YOU_MAP_XY counts as "near me". */
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
  /** Default reminder lead time (mins). null = off. */
  defaultReminderMins: number | null;
}

interface Toast {
  id: string;
  text: string;
  tone?: 'default' | 'success' | 'warn';
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

  // actions
  // Auth flow (splash → welcome → auth → app)
  authState: AuthState;
  setAuthState: (s: AuthState) => void;
  /** Whether the auth screen should open on the "signup" or "login" tab. */
  authIntent: 'signup' | 'login';
  setAuthIntent: (i: 'signup' | 'login') => void;
  /** Create a brand-new user with the supplied identity + enter the app. */
  signUp: (input: { name: string; handle: string; avatar?: string; color?: string }) => void;
  /** Mockup "log in" — any input works. Spins up a default user if none exists. */
  logIn: () => void;
  /** Admin/demo login — loads the full sample dataset and enters the app. */
  loadDemoData: () => void;
  /** Drop the current user + wipe app data; return to the welcome screen. */
  signOut: () => void;

  setTab: (t: Tab) => void;
  openActivity: (id: string | null) => void;
  setShowPostSheet: (b: boolean) => void;
  setFeedScope: (s: FeedScope) => void;
  feedFilters: FeedFilters;
  setFeedFilter: (patch: Partial<FeedFilters>) => void;
  clearFeedFilters: () => void;
  /** True when at least one discovery filter is active. */
  hasActiveFeedFilters: () => boolean;
  /** Top categories across visible plans over the last week — for the Trending strip. */
  trendingCategories: () => { key: CategoryKey; count: number; emoji: string; label: string }[];
  /** Up to 2 "For you" suggestions surfaced as cards on the Feed. */
  smartSuggestions: () => Suggestion[];
  openOverlay: (o: Overlay) => void;

  addFriend: (userId: string) => void;
  removeFriend: (userId: string) => void;
  updateMe: (patch: Partial<Pick<User, 'name' | 'handle' | 'avatar' | 'color' | 'photoUrl'>>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;

  // Squads (named subsets of friends — used for targeted posts/pings/chat)
  createSquad: (input: { name: string; emoji: string; memberIds: string[] }) => void;
  /** Host only. Update name/emoji. (Membership uses add/remove actions.) */
  updateSquad: (squadId: string, patch: Partial<Pick<Squad, 'name' | 'emoji'>>) => void;
  /** Host only. Removes the whole squad. */
  deleteSquad: (squadId: string) => void;
  /** Host only. Add a friend as a member. */
  addMemberToSquad: (squadId: string, userId: string) => void;
  /** Host only. Remove a member. */
  removeMemberFromSquad: (squadId: string, userId: string) => void;
  /** Member-only. Leave a squad without nuking it. */
  leaveSquad: (squadId: string) => void;
  sendSquadChat: (squadId: string, text: string) => void;
  sendSquadChatPhoto: (squadId: string, photoUrl: string, caption?: string) => void;
  isSquadHost: (squadId: string) => boolean;
  amInSquad: (squadId: string) => boolean;

  // Live status ("Now mode")
  setLiveStatus: (input: {
    emoji: string;
    text: string;
    durationMins: number;
    place?: string;
    openToJoin?: boolean;
  }) => void;
  clearLiveStatus: () => void;
  showGoLiveSheet: boolean;
  setShowGoLiveSheet: (b: boolean) => void;
  /** ID of the live friend whose detail sheet is open (null = closed). */
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
    squadIds?: string[];        // empty / undefined = no squad tags
    isOpenInvite?: boolean;     // defaults to true when no squads, false when squad-only intent
  }) => void;

  joinActivity: (activityId: string) => void;
  leaveActivity: (activityId: string) => void;
  setRsvp: (activityId: string, state: RsvpState) => void;

  sendChat: (activityId: string, text: string) => void;
  sendChatPhoto: (activityId: string, photoUrl: string, caption?: string) => void;
  sendPoll: (activityId: string, question: string, optionTexts: string[]) => void;
  voteInPoll: (activityId: string, messageId: string, optionId: string) => void;
  toggleReaction: (activityId: string, emoji: string) => void;

  /** Activity ID whose poll-composer sheet is open (null = closed). */
  pollComposerActivityId: string | null;
  setPollComposerActivityId: (id: string | null) => void;
  acceptHostOffer: (notificationId: string) => void;
  declineHostOffer: (notificationId: string) => void;

  markAllNotificationsRead: () => void;
  pingFriends: (text: string, recipientIds?: string[], squadId?: string) => void;

  // Reminders
  /**
   * Set the per-plan reminder. Pass `undefined` to clear the override and fall
   * back to settings.defaultReminderMins; pass `null` to explicitly turn off.
   */
  setReminderForActivity: (activityId: string, mins: number | null | undefined) => void;
  fireReminder: (activityId: string) => void;

  pushToast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

export const useApp = create<State>((set, get) => ({
  // Empty session — populated by signUp() / logIn() after the auth flow.
  meId: ME_PLACEHOLDER_ID,
  users: [],
  friendIds: [],
  activities: [],
  notifications: [],
  squads: [],
  authState: 'splash',
  authIntent: 'signup',

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

  // Safe even before signUp/logIn (when users is empty) so the pre-auth screens
  // don't crash if they read me() defensively.
  me: () => get().users.find(u => u.id === get().meId) ?? {
    id: get().meId,
    name: 'You',
    handle: 'you',
    avatar: '✨',
    color: 'from-rose-400 to-orange-500',
  },
  userById: (id) =>
    get().users.find(u => u.id === id) ??
    { id, name: 'Unknown', handle: 'unknown', avatar: '👤', color: 'from-slate-400 to-slate-700' },
  isFriend: (id) => get().friendIds.includes(id) || id === get().meId,
  isFriendOfFriend: (id) => {
    const via = FOF_VIA[id];
    return !!via && get().friendIds.includes(via);
  },
  canSeeActivity: (a) => {
    const s = get();
    if (a.hostId === s.meId) return true;

    // Am I in any of the tagged squads? (host counts as squad-member.)
    const inAnyTaggedSquad = a.squadIds.some(sid => {
      const sq = s.squads.find(x => x.id === sid);
      return !!sq && (sq.hostId === s.meId || sq.memberIds.includes(s.meId));
    });
    if (inAnyTaggedSquad) return true;

    // Open-invite plans flow through the normal friend / FoF rules.
    if (a.isOpenInvite) {
      if (s.isFriend(a.hostId)) return true;
      if (a.isPrivate) return false;                              // friends only
      if (a.joinerIds.some(id => s.isFriend(id))) return true;    // FoF unlock
    }

    return false;
  },
  // Is this activity only visible to me via the friend-of-friend unlock?
  isFoFActivity: (a) => {
    const s = get();
    if (a.hostId === s.meId) return false;
    // Squad membership (in any tagged squad) is a stronger reason than FoF.
    const inAnyTaggedSquad = a.squadIds.some(sid => {
      const sq = s.squads.find(x => x.id === sid);
      return !!sq && (sq.hostId === s.meId || sq.memberIds.includes(s.meId));
    });
    if (inAnyTaggedSquad) return false;
    if (s.isFriend(a.hostId)) return false;
    if (!a.isOpenInvite) return false;     // squad-only events can't reach me via FoF
    if (a.isPrivate) return false;
    return a.joinerIds.some(id => s.isFriend(id));
  },
  visibleActivities: () => {
    const s = get();
    const now = Date.now();
    const f = s.feedFilters;
    const HOUR = 60 * 60 * 1000;
    const DAY  = 24 * HOUR;
    return s.activities
      .filter(a => a.startsAt >= now)                       // past plans live in History
      .filter(a => s.canSeeActivity(a))
      .filter(a => s.feedScope === 'fof' ? true : !s.isFoFActivity(a))
      // Discovery filters (Tier 3)
      .filter(a => !f.category || a.category === f.category)
      .filter(a => {
        const dt = a.startsAt - now;
        if (f.timeWindow === 'now')   return dt <= HOUR;
        if (f.timeWindow === 'today') return dt <= DAY;
        if (f.timeWindow === 'week')  return dt <= 7 * DAY;
        return true;                                        // 'all'
      })
      .filter(a => {
        if (!f.nearMe) return true;
        if (a.mapX === undefined || a.mapY === undefined) return false;
        const dx = a.mapX - YOU_MAP_XY[0];
        const dy = a.mapY - YOU_MAP_XY[1];
        return Math.hypot(dx, dy) <= NEAR_ME_RADIUS;
      })
      .sort((a, b) => a.startsAt - b.startsAt);
  },
  hasFoFAvailable: () => {
    const s = get();
    return s.activities.some(a => s.canSeeActivity(a) && s.isFoFActivity(a));
  },
  unreadCount: () => get().notifications.filter(n => !n.read).length,

  setAuthState: (s) => set({ authState: s }),
  setAuthIntent: (i) => set({ authIntent: i }),

  signUp: ({ name, handle, avatar, color }) => {
    const meId = ME_PLACEHOLDER_ID;
    const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'you';
    const user: User = {
      id: meId,
      name: name.trim() || 'You',
      handle: cleanHandle,
      avatar: avatar || '✨',
      color: color || 'from-rose-400 to-orange-500',
    };
    set({
      meId,
      users: [user],
      friendIds: [],
      activities: [],
      notifications: [],
      squads: [],
      tab: 'feed',
      authState: 'app',
    });
  },

  logIn: () => {
    // Mockup: accept any login. Reuse the existing user if there is one
    // (e.g., after a sign-out → log-in flow); otherwise create a generic one.
    const existing = get().users.find(u => u.id === ME_PLACEHOLDER_ID);
    if (existing) {
      set({ authState: 'app' });
      return;
    }
    get().signUp({ name: 'You', handle: 'you', avatar: '🧑‍💻' });
  },

  loadDemoData: () => {
    // Admin/demo login — populate the whole sample dataset and jump into the app.
    set({
      meId: ME_ID,
      users: SEED_USERS,
      friendIds: SEED_FRIEND_IDS,
      activities: SEED_ACTIVITIES,
      notifications: SEED_NOTIFICATIONS,
      squads: SEED_SQUADS,
      tab: 'feed',
      openActivityId: null,
      openLiveUserId: null,
      showPostSheet: false,
      showGoLiveSheet: false,
      pollComposerActivityId: null,
      overlay: null,
      feedFilters: { timeWindow: 'all', nearMe: false },
      authState: 'app',
    });
    get().pushToast('Loaded demo data 🎬', 'success');
  },

  signOut: () => {
    set({
      users: [],
      friendIds: [],
      activities: [],
      notifications: [],
      squads: [],
      // Reset UI state so opening overlays don't dangle.
      tab: 'feed',
      openActivityId: null,
      openLiveUserId: null,
      showPostSheet: false,
      showGoLiveSheet: false,
      pollComposerActivityId: null,
      overlay: null,
      feedFilters: { timeWindow: 'all', nearMe: false },
      authState: 'welcome',
    });
  },

  setTab: (t) => set({ tab: t }),
  openActivity: (id) => set({ openActivityId: id }),
  setShowPostSheet: (b) => set({ showPostSheet: b }),
  setFeedScope: (s) => set({ feedScope: s }),
  setFeedFilter: (patch) => set(state => ({ feedFilters: { ...state.feedFilters, ...patch } })),
  clearFeedFilters: () => set({ feedFilters: { timeWindow: 'all', nearMe: false } }),
  hasActiveFeedFilters: () => {
    const f = get().feedFilters;
    return !!f.category || f.timeWindow !== 'all' || f.nearMe;
  },

  smartSuggestions: () => {
    const s = get();
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const DAY  = 24 * HOUR;
    const out: Suggestion[] = [];

    const visibleUpcoming = s.activities.filter(a => s.canSeeActivity(a) && a.startsAt >= now);

    // (1) Plans starting in the next hour — most actionable, surface first.
    const soon = visibleUpcoming.filter(a => a.startsAt - now <= HOUR);
    if (soon.length >= 1) {
      out.push({
        kind: 'starting_soon',
        count: soon.length,
        emoji: '⏰',
        text: soon.length === 1
          ? '1 plan starting in the next hour'
          : `${soon.length} plans starting in the next hour`,
        apply: { timeWindow: 'now' },
      });
    }

    // (2) Cluster: a category with 2+ visible plans within the next 24h.
    const today = visibleUpcoming.filter(a => a.startsAt - now <= DAY);
    const tally = new Map<string, number>();
    for (const a of today) tally.set(a.category, (tally.get(a.category) ?? 0) + 1);
    const [topCat, topCount] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (topCat && topCount >= 2) {
      const sample = today.find(a => a.category === topCat)!;
      const c = categoryFor(sample);
      out.push({
        kind: 'category_cluster',
        category: topCat as CategoryKey,
        count: topCount,
        emoji: c.emoji,
        text: `${topCount} ${c.label.toLowerCase()} plan${topCount === 1 ? '' : 's'} today — tap to see them all`,
        apply: { category: topCat as CategoryKey, timeWindow: 'today' },
      });
    }

    // (3) Plans near you within the next 24h — surfaces "Near me" toggle as useful.
    if (s.feedFilters.nearMe === false) {
      const near = today.filter(a => {
        if (a.mapX === undefined || a.mapY === undefined) return false;
        const dx = a.mapX - YOU_MAP_XY[0];
        const dy = a.mapY - YOU_MAP_XY[1];
        return Math.hypot(dx, dy) <= NEAR_ME_RADIUS;
      });
      if (near.length >= 2) {
        out.push({
          kind: 'near_me',
          count: near.length,
          emoji: '📍',
          text: `${near.length} plans near you today`,
          apply: { nearMe: true },
        });
      }
    }

    return out.slice(0, 2);
  },

  trendingCategories: () => {
    const s = get();
    const now = Date.now();
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    // Window: ±1 week around now, only plans I can see.
    const pool = s.activities.filter(a =>
      s.canSeeActivity(a) && Math.abs(a.startsAt - now) <= WEEK
    );
    const tally = new Map<string, number>();
    for (const a of pool) tally.set(a.category, (tally.get(a.category) ?? 0) + 1);
    const items = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, count]) => {
        // categoryFor needs an Activity-like object; build a minimal one for label/emoji.
        const sample = pool.find(a => a.category === k);
        const c = sample ? categoryFor(sample) : { emoji: '✨', label: 'Other' };
        return { key: k as CategoryKey, count, emoji: c.emoji, label: c.label };
      });
    // Only show items with count >= 2 — anything less isn't really "trending".
    return items.filter(i => i.count >= 2);
  },
  openOverlay: (o) => set({ overlay: o }),

  addFriend: (userId) => {
    const s = get();
    if (userId === s.meId) return;
    if (s.friendIds.includes(userId)) return;
    set(state => ({ friendIds: [...state.friendIds, userId] }));
    get().pushToast(`Added ${s.userById(userId).name} as a friend`, 'success');
  },
  removeFriend: (userId) => {
    const s = get();
    if (!s.friendIds.includes(userId)) return;
    set(state => ({ friendIds: state.friendIds.filter(id => id !== userId) }));
    get().pushToast(`Removed ${s.userById(userId).name}`, 'warn');
  },
  updateMe: (patch) => {
    set(state => ({
      users: state.users.map(u => u.id === state.meId ? { ...u, ...patch } : u),
    }));
    get().pushToast('Profile updated', 'success');
  },

  createSquad: ({ name, emoji, memberIds }) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const meId = get().meId;
    const squad: Squad = {
      id: `s_${uid()}`,
      name: trimmed,
      emoji: emoji.trim() || '✨',
      hostId: meId,
      // Drop host out of memberIds if accidentally included, and dedupe.
      memberIds: [...new Set(memberIds.filter(id => id !== meId && get().friendIds.includes(id)))],
      chat: [],
      createdAt: Date.now(),
    };
    set(state => ({ squads: [...state.squads, squad] }));
    get().pushToast(`Created squad ${squad.emoji} ${squad.name}`, 'success');
  },

  updateSquad: (squadId, patch) => {
    const meId = get().meId;
    const target = get().squads.find(s => s.id === squadId);
    if (!target || target.hostId !== meId) return;   // host-only
    set(state => ({
      squads: state.squads.map(s => {
        if (s.id !== squadId) return s;
        return {
          ...s,
          name:  patch.name  !== undefined ? (patch.name.trim()  || s.name)  : s.name,
          emoji: patch.emoji !== undefined ? (patch.emoji.trim() || s.emoji) : s.emoji,
        };
      }),
    }));
  },

  deleteSquad: (squadId) => {
    const meId = get().meId;
    const target = get().squads.find(s => s.id === squadId);
    if (!target || target.hostId !== meId) return;   // host-only
    set(state => ({
      squads: state.squads.filter(s => s.id !== squadId),
      // Untag any activities that were sharing to this squad so visibility doesn't break.
      activities: state.activities.map(a =>
        a.squadIds.includes(squadId)
          ? { ...a, squadIds: a.squadIds.filter(id => id !== squadId) }
          : a,
      ),
    }));
    get().pushToast(`Deleted ${target.name}`, 'warn');
  },

  addMemberToSquad: (squadId, userId) => {
    const meId = get().meId;
    const target = get().squads.find(s => s.id === squadId);
    if (!target || target.hostId !== meId) return;            // host-only
    if (userId === target.hostId) return;                     // host is already in it
    if (!get().friendIds.includes(userId)) return;            // must be your friend
    set(state => ({
      squads: state.squads.map(s =>
        s.id === squadId && !s.memberIds.includes(userId)
          ? { ...s, memberIds: [...s.memberIds, userId] }
          : s,
      ),
    }));
  },

  removeMemberFromSquad: (squadId, userId) => {
    const meId = get().meId;
    const target = get().squads.find(s => s.id === squadId);
    if (!target || target.hostId !== meId) return;            // host-only
    set(state => ({
      squads: state.squads.map(s =>
        s.id === squadId ? { ...s, memberIds: s.memberIds.filter(id => id !== userId) } : s,
      ),
    }));
  },

  leaveSquad: (squadId) => {
    const meId = get().meId;
    const target = get().squads.find(s => s.id === squadId);
    if (!target) return;
    if (target.hostId === meId) {
      // Host can't "leave" — they have to delete the squad (or transfer host, future).
      get().pushToast('You host this squad — delete it instead', 'warn');
      return;
    }
    if (!target.memberIds.includes(meId)) return;
    set(state => ({
      squads: state.squads.map(s =>
        s.id === squadId ? { ...s, memberIds: s.memberIds.filter(id => id !== meId) } : s,
      ),
    }));
    get().pushToast(`Left ${target.emoji} ${target.name}`, 'warn');
  },

  sendSquadChat: (squadId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const meId = get().meId;
    set(state => ({
      squads: state.squads.map(s => {
        if (s.id !== squadId) return s;
        if (s.hostId !== meId && !s.memberIds.includes(meId)) return s;  // not in squad
        return {
          ...s,
          chat: [...s.chat, { id: uid(), authorId: meId, text: trimmed, type: 'text', at: Date.now() }],
        };
      }),
    }));
  },

  sendSquadChatPhoto: (squadId, photoUrl, caption) => {
    if (!photoUrl) return;
    const meId = get().meId;
    set(state => ({
      squads: state.squads.map(s => {
        if (s.id !== squadId) return s;
        if (s.hostId !== meId && !s.memberIds.includes(meId)) return s;
        return {
          ...s,
          chat: [
            ...s.chat,
            { id: uid(), authorId: meId, type: 'photo', photoUrl, text: caption?.trim() || undefined, at: Date.now() },
          ],
        };
      }),
    }));
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
  updateSettings: (patch) => {
    set(state => ({ settings: { ...state.settings, ...patch } }));
  },

  setLiveStatus: ({ emoji, text, durationMins, place, openToJoin }) => {
    const now = Date.now();
    const trimmedPlace = place?.trim();
    const live = {
      emoji: emoji.trim() || '✨',
      text: text.trim() || 'doing a thing',
      startedAt: now,
      expiresAt: now + durationMins * 60 * 1000,
      place: trimmedPlace || undefined,
      openToJoin: !!openToJoin,
    };
    set(state => ({
      users: state.users.map(u => u.id === state.meId ? { ...u, liveStatus: live } : u),
      showGoLiveSheet: false,
    }));
    get().pushToast(`You're live: ${live.emoji} ${live.text}`, 'success');
  },
  clearLiveStatus: () => {
    set(state => ({
      users: state.users.map(u => u.id === state.meId ? { ...u, liveStatus: undefined } : u),
    }));
    get().pushToast('Went offline', 'default');
  },
  setShowGoLiveSheet: (b) => set({ showGoLiveSheet: b }),
  setOpenLiveUserId: (id) => set({ openLiveUserId: id }),

  postActivity: (input) => {
    const isCustom = input.category === 'custom';
    const a: Activity = {
      id: uid(),
      hostId: get().meId,
      category: input.category,
      customEmoji: isCustom ? (input.customEmoji?.trim() || '✨') : undefined,
      customLabel: isCustom ? (input.customLabel?.trim() || 'Custom') : undefined,
      title: input.title.trim() || 'Doing a thing',
      place: input.place.trim(),
      startsAt: input.startsAt,
      description: input.description.trim(),
      joinerIds: [],
      maybeIds: [],
      cantIds: [],
      maxSize: input.maxSize,
      isPrivate: !!input.isPrivate,
      reactions: [],
      bannerUrl: input.bannerUrl?.trim() || undefined,
      recurrence: input.recurrence,
      squadIds: (input.squadIds ?? []).filter(id => get().squads.some(s => s.id === id)),
      // Default: open invite when no squads picked. When the post explicitly says
      // squad-only (isOpenInvite=false) we honor that even with no squads — but
      // such a post would only be visible to the host, so the UI should prevent it.
      isOpenInvite: input.isOpenInvite ?? true,
      createdAt: Date.now(),
      chat: [],
    };
    set(s => ({ activities: [a, ...s.activities], showPostSheet: false }));
    get().pushToast('Posted — your squad can see it', 'success');
  },

  joinActivity: (activityId) => {
    // Joining = setting RSVP to 'going'. Kept as a separate action for ergonomics
    // (the card's primary CTA just calls join()).
    get().setRsvp(activityId, 'going');
  },

  setRsvp: (activityId, state) => {
    const s = get();
    const a = s.activities.find(x => x.id === activityId);
    if (!a) return;
    if (a.startsAt < Date.now()) return;     // can't RSVP to a past event
    if (a.hostId === s.meId) return;          // host has no RSVP — they're hosting

    const meId = s.meId;
    const wasGoing = a.joinerIds.includes(meId);
    const wasMaybe = a.maybeIds.includes(meId);
    const wasCant  = a.cantIds.includes(meId);
    const currentState: RsvpState = wasGoing ? 'going' : wasMaybe ? 'maybe' : wasCant ? 'cant' : 'none';
    if (currentState === state) return;       // no-op

    set(prev => ({
      activities: prev.activities.map(x => {
        if (x.id !== activityId) return x;
        // Strip me from all three lists first.
        const stripped = {
          ...x,
          joinerIds: x.joinerIds.filter(id => id !== meId),
          maybeIds:  x.maybeIds.filter(id => id !== meId),
          cantIds:   x.cantIds.filter(id => id !== meId),
        };
        // Then re-add to the right list (or none).
        if (state === 'going') return { ...stripped, joinerIds: [...stripped.joinerIds, meId] };
        if (state === 'maybe') return { ...stripped, maybeIds:  [...stripped.maybeIds, meId] };
        if (state === 'cant')  return { ...stripped, cantIds:   [...stripped.cantIds, meId] };
        return stripped;
      }),
    }));

    const hostName = s.userById(a.hostId).name;
    const tone =
      state === 'going' ? 'success' :
      state === 'cant'  ? 'warn'    : 'default';
    const text =
      state === 'going' ? `You're going to ${hostName}'s plan`     :
      state === 'maybe' ? `Marked maybe for ${hostName}'s plan`    :
      state === 'cant'  ? `Told ${hostName} you can't make it`     :
                          'Cleared your RSVP';
    get().pushToast(text, tone);
  },

  leaveActivity: (activityId) => {
    const s = get();
    const a = s.activities.find(x => x.id === activityId);
    if (!a) return;
    if (a.startsAt < Date.now()) return;   // event is over — you can't leave history

    if (a.hostId === s.meId) {
      // Host leaving → offer host role to next joiner
      const next = a.joinerIds[0];
      if (!next) {
        // No joiners → activity dissolves
        set(state => ({
          activities: state.activities.filter(x => x.id !== activityId),
          openActivityId: state.openActivityId === activityId ? null : state.openActivityId,
        }));
        get().pushToast('Plan dissolved — no one had joined', 'warn');
        return;
      }
      // Demote host, send host_offer notification to next, and a system chat msg
      set(state => ({
        activities: state.activities.map(x => {
          if (x.id !== activityId) return x;
          return {
            ...x,
            hostId: next,
            joinerIds: x.joinerIds.filter(id => id !== next),
            chat: [
              ...x.chat,
              { id: uid(), authorId: 'system', text: `Host left. ${s.userById(next).name} was offered the host role.`, at: Date.now() },
            ],
          };
        }),
      }));
      // Add a notification from system perspective (so user sees what happened)
      set(state => ({
        notifications: [
          {
            id: uid(),
            type: 'host_taken',
            fromId: next,
            activityId,
            text: `took over as host of "${a.title}"`,
            at: Date.now(),
            read: false,
          },
          ...state.notifications,
        ],
      }));
      get().pushToast(`You left — host offered to ${s.userById(next).name}`, 'warn');
      return;
    }

    // Not host → just clear RSVP (handles whichever list I'm currently in).
    get().setRsvp(activityId, 'none');
  },

  sendChat: (activityId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set(state => ({
      activities: state.activities.map(x =>
        x.id === activityId
          ? { ...x, chat: [...x.chat, { id: uid(), authorId: state.meId, text: trimmed, type: 'text', at: Date.now() }] }
          : x
      ),
    }));
  },

  sendChatPhoto: (activityId, photoUrl, caption) => {
    if (!photoUrl) return;
    set(state => ({
      activities: state.activities.map(x =>
        x.id === activityId
          ? {
              ...x,
              chat: [
                ...x.chat,
                {
                  id: uid(),
                  authorId: state.meId,
                  type: 'photo',
                  photoUrl,
                  text: caption?.trim() || undefined,
                  at: Date.now(),
                },
              ],
            }
          : x
      ),
    }));
  },

  sendPoll: (activityId, question, optionTexts) => {
    const q = question.trim();
    const cleaned = optionTexts.map(t => t.trim()).filter(Boolean);
    if (!q || cleaned.length < 2) return;
    set(state => ({
      activities: state.activities.map(x =>
        x.id === activityId
          ? {
              ...x,
              chat: [
                ...x.chat,
                {
                  id: uid(),
                  authorId: state.meId,
                  type: 'poll',
                  poll: {
                    question: q,
                    options: cleaned.map(text => ({ id: uid(), text, voterIds: [] })),
                  },
                  at: Date.now(),
                },
              ],
            }
          : x
      ),
      pollComposerActivityId: null,
    }));
  },

  voteInPoll: (activityId, messageId, optionId) => {
    const meId = get().meId;
    set(state => ({
      activities: state.activities.map(x => {
        if (x.id !== activityId) return x;
        return {
          ...x,
          chat: x.chat.map(m => {
            if (m.id !== messageId || m.type !== 'poll' || !m.poll) return m;
            // Toggle: if I already voted for this option, remove. Otherwise drop
            // my vote from any other option and add it to this one.
            const alreadyHere = m.poll.options.find(o => o.id === optionId)?.voterIds.includes(meId);
            return {
              ...m,
              poll: {
                ...m.poll,
                options: m.poll.options.map(o => {
                  const withoutMine = o.voterIds.filter(v => v !== meId);
                  if (o.id !== optionId) return { ...o, voterIds: withoutMine };
                  return alreadyHere ? { ...o, voterIds: withoutMine } : { ...o, voterIds: [...withoutMine, meId] };
                }),
              },
            };
          }),
        };
      }),
    }));
  },

  setPollComposerActivityId: (id) => set({ pollComposerActivityId: id }),

  toggleReaction: (activityId, emoji) => {
    const meId = get().meId;
    set(state => ({
      activities: state.activities.map(x => {
        if (x.id !== activityId) return x;
        // If I've already reacted with THIS emoji, remove it. Otherwise drop any
        // previous reaction I had on this activity and add the new one.
        const mineWithThis = x.reactions.find(r => r.userId === meId && r.emoji === emoji);
        if (mineWithThis) {
          return { ...x, reactions: x.reactions.filter(r => r !== mineWithThis) };
        }
        const withoutMine = x.reactions.filter(r => r.userId !== meId);
        return {
          ...x,
          reactions: [...withoutMine, { emoji, userId: meId, at: Date.now() }],
        };
      }),
    }));
  },

  acceptHostOffer: (notificationId) => {
    const s = get();
    const n = s.notifications.find(x => x.id === notificationId);
    if (!n || n.type !== 'host_offer' || !n.activityId) return;
    const target = s.activities.find(x => x.id === n.activityId);
    // Can't pass host on an event that's already over — just mark the offer resolved.
    if (target && target.startsAt < Date.now()) {
      set(state => ({
        notifications: state.notifications.map(x =>
          x.id === notificationId ? { ...x, resolved: true, read: true } : x,
        ),
      }));
      get().pushToast('That plan is already over', 'warn');
      return;
    }
    set(state => ({
      activities: state.activities.map(x =>
        x.id === n.activityId
          ? {
              ...x,
              hostId: state.meId,
              joinerIds: x.joinerIds.filter(id => id !== state.meId),
              chat: [
                ...x.chat,
                { id: uid(), authorId: 'system', text: `${state.users.find(u=>u.id===state.meId)!.name} accepted host.`, at: Date.now() },
              ],
            }
          : x
      ),
      notifications: state.notifications.map(x =>
        x.id === notificationId ? { ...x, resolved: true, read: true } : x
      ),
    }));
    get().pushToast('You\'re the new host 👑', 'success');
  },

  declineHostOffer: (notificationId) => {
    set(state => ({
      notifications: state.notifications.map(x =>
        x.id === notificationId ? { ...x, resolved: true, read: true } : x
      ),
    }));
    get().pushToast('Declined host', 'default');
  },

  markAllNotificationsRead: () =>
    set(state => ({ notifications: state.notifications.map(n => ({ ...n, read: true })) })),

  setReminderForActivity: (activityId, mins) => {
    set(state => ({
      activities: state.activities.map(a =>
        a.id === activityId ? { ...a, reminderMins: mins } : a,
      ),
    }));
  },

  fireReminder: (activityId) => {
    const s = get();
    const a = s.activities.find(x => x.id === activityId);
    if (!a) return;
    const mins = Math.max(1, Math.round((a.startsAt - Date.now()) / 60000));
    const host = s.userById(a.hostId);
    const text = `${a.title} starts in ${mins}m`;
    set(state => ({
      notifications: [
        {
          id: uid(),
          type: 'reminder',
          fromId: a.hostId,
          activityId,
          text,
          at: Date.now(),
          read: false,
        },
        ...state.notifications,
      ],
    }));
    get().pushToast(`⏰ ${text} (${host.name})`, 'success');
  },

  pingFriends: (text, recipientIds, squadId) => {
    const s = get();
    // squadId, when set, takes precedence over recipientIds.
    const squad = squadId ? s.squads.find(x => x.id === squadId) : undefined;
    const baseIds = squad
      ? squad.memberIds
      : recipientIds ?? s.friendIds;
    const validIds = baseIds.filter(id => s.friendIds.includes(id));
    if (validIds.length === 0) {
      s.pushToast('Pick at least one friend to ping', 'warn');
      return;
    }
    const isAll = !squad && validIds.length === s.friendIds.length;
    let who: string;
    if (squad) {
      who = `${squad.emoji} ${squad.name}`;
    } else if (isAll) {
      who = 'your squad';
    } else if (validIds.length === 1) {
      who = s.userById(validIds[0]).name;
    } else if (validIds.length === 2) {
      who = `${s.userById(validIds[0]).name} & ${s.userById(validIds[1]).name}`;
    } else {
      who = `${validIds.length} friends`;
    }
    s.pushToast(`Pinged ${who}: "${text}"`, 'success');
  },

  pushToast: (text, tone = 'default') =>
    set(state => ({
      // Cap at 3 visible toasts — drop the oldest if more arrive in quick succession.
      toasts: [...state.toasts, { id: uid(), text, tone }].slice(-3),
    })),
  dismissToast: (id) =>
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));

/** An activity is "over" once its start time has passed. */
export function isPast(a: { startsAt: number }): boolean {
  return a.startsAt < Date.now();
}

/** A user is "live" when they have an unexpired liveStatus. */
export function isLive(u: { liveStatus?: { expiresAt: number } }): boolean {
  return !!u.liveStatus && u.liveStatus.expiresAt > Date.now();
}

/**
 * Resolve the active reminder lead time (mins) for an activity.
 * Returns null when reminders are off for it.
 */
export function effectiveReminderMins(
  a: { reminderMins?: number | null },
  defaultMins: number | null,
): number | null {
  if (a.reminderMins === undefined) return defaultMins;
  return a.reminderMins;
}

/** Human label for a recurrence lead value (mins | null). */
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

/** Helper: format a relative time like "in 30m" / "5m ago" */
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

/** Format a time like "7:42 PM" */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
