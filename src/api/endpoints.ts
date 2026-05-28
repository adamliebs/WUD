/**
 * Typed wrappers around every backend endpoint the app uses.
 * Response shapes mirror the server routes (see server/src/routes/*).
 */
import type {
  Activity, AppNotification, CategoryKey, ChatMessage, Recurrence, Squad, User,
} from '../types';
import type { AppSettings, RsvpState } from '../store';
import { api } from './client';

/* ---- auth ---- */

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  register: (b: {
    email: string; password: string; name: string; handle: string;
    avatar?: string; color?: string;
    /** Epoch ms — required by the server (Apple Guideline 1.3 / COPPA, ≥13). */
    dateOfBirth: number;
  }) => api.post<AuthResult>('/auth/email/register', b, true),

  login: (email: string, password: string) =>
    api.post<AuthResult>('/auth/email/login', { email, password }, true),

  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }, true),

  /** Live handle-availability check (handles are unique; names are not). */
  handleAvailable: (handle: string) =>
    api.get<{ handle: string; available: boolean }>(
      `/auth/handle-available?handle=${encodeURIComponent(handle)}`,
    ),

  /**
   * Sign in with a Firebase ID token (Apple / Google / Email-via-Firebase).
   *
   * Returns:
   *   • AuthResult — existing user, session minted
   *   • { needsOnboarding: true, ... } — first signin; client must collect
   *     DOB + handle and call again with the same idToken + payload
   *
   * The endpoint replies 200 for the session case, 422 for needsOnboarding;
   * api.post throws on 422 so we catch it specifically in the store.
   */
  firebase: (b: {
    idToken: string;
    dateOfBirth?: number;
    handle?: string;
    name?: string;
    avatar?: string;
    color?: string;
  }) => api.post<AuthResult>('/auth/firebase', b, true),

  /** Request a Firebase-driven password reset email. Always resolves 200 — the
   *  server hides whether the email is actually registered (anti-enumeration). */
  requestPasswordReset: (email: string) =>
    api.post<{ ok: true }>('/auth/email/reset', { email }, true),
};

/* ---- bootstrap ---- */

export interface Bootstrap {
  user: User;
  settings: AppSettings;
  friendIds: string[];
  squads: Squad[];
  activities: Activity[];
  notifications: AppNotification[];
  unread: number;
  live: User[];
  hasFoF: boolean;
  users: User[];
}

export const getBootstrap = () => api.get<Bootstrap>('/bootstrap');

/* ---- me / settings ---- */

export const meApi = {
  get: () => api.get<{ user: User; settings: AppSettings }>('/me'),
  update: (patch: Partial<Pick<User, 'name' | 'handle' | 'avatar' | 'color' | 'photoUrl'>>) =>
    api.patch<{ user: User }>('/me', patch),
  updateSettings: (patch: Partial<AppSettings>) =>
    api.patch<{ settings: AppSettings }>('/me/settings', patch),
  /** Permanently erase the account and all owned data. */
  deleteAccount: () => api.del('/account'),
  /** Register an FCM push token for the current user's device. */
  registerDevice: (platform: 'ios' | 'android' | 'web', pushToken: string) =>
    api.post<{ deviceId: string }>('/me/devices', { platform, pushToken }),
  /** Users I've blocked. */
  listBlocks: () => api.get<{ blocked: User[] }>('/me/blocks'),
  /** Block someone — removes friendship + hides both ways. */
  block: (userId: string) => api.post<{ ok: true }>('/me/blocks', { userId }),
  /** Unblock — does NOT restore the prior friendship. */
  unblock: (userId: string) => api.del(`/me/blocks/${userId}`),
};

/* ---- safety / abuse reports ---- */

export const safetyApi = {
  /** File an abuse report. `targetKind` ∈ 'user' | 'activity' | 'message'. */
  report: (b: { targetKind: 'user' | 'activity' | 'message'; targetId: string; reason: string; note?: string }) =>
    api.post<{ reportId: string }>('/reports', b),
};

/* ---- feed / activities ---- */

export interface ActivityResp { activity: Activity; users: User[] }
export interface LeaveResp { dissolved: boolean; activity?: Activity; users: User[] }

export const activityApi = {
  feed: () => api.get<{ activities: Activity[]; hasFoF: boolean; users: User[] }>('/feed'),
  history: () => api.get<{ activities: Activity[]; users: User[] }>('/history'),
  get: (id: string) => api.get<ActivityResp>(`/activities/${id}`),

  create: (b: {
    category: CategoryKey; customEmoji?: string; customLabel?: string;
    title: string; place?: string; description?: string; startsAt: number;
    maxSize?: number; isPrivate?: boolean; isOpenInvite?: boolean;
    bannerUrl?: string; recurrence?: Recurrence; reminderMins?: number | null;
    squadIds?: string[];
  }) => api.post<ActivityResp>('/activities', b),

  patch: (id: string, b: Record<string, unknown>) =>
    api.patch<ActivityResp>(`/activities/${id}`, b),

  rsvp: (id: string, state: RsvpState | 'none') =>
    api.put<ActivityResp>(`/activities/${id}/rsvp`, { state }),

  leave: (id: string) => api.post<LeaveResp>(`/activities/${id}/leave`),

  hostAccept: (id: string) => api.post<ActivityResp>(`/activities/${id}/host/accept`),
  hostDecline: (id: string) => api.post<LeaveResp>(`/activities/${id}/host/decline`),

  react: (id: string, emoji: string) =>
    api.put<ActivityResp>(`/activities/${id}/reaction`, { emoji }),
};

/* ---- chat ---- */

export const chatApi = {
  send: (activityId: string, text: string) =>
    api.post<{ message: ChatMessage }>(`/activities/${activityId}/messages`, { text }),
  sendPhoto: (activityId: string, photoUrl: string, text?: string) =>
    api.post<{ message: ChatMessage }>(`/activities/${activityId}/messages`, { photoUrl, text }),
  sendPoll: (activityId: string, question: string, options: string[]) =>
    api.post<{ message: ChatMessage }>(`/activities/${activityId}/polls`, { question, options }),
  vote: (messageId: string, optionId: string) =>
    api.put<{ message: ChatMessage }>(`/polls/${messageId}/vote`, { optionId }),

  squadSend: (squadId: string, text: string) =>
    api.post<{ message: ChatMessage }>(`/squads/${squadId}/messages`, { text }),
  squadSendPhoto: (squadId: string, photoUrl: string, text?: string) =>
    api.post<{ message: ChatMessage }>(`/squads/${squadId}/messages`, { photoUrl, text }),
};

/* ---- social ---- */

export interface IncomingRequest { id: string; from: User; at: number }

export const socialApi = {
  friends: () => api.get<{ friends: User[] }>('/friends'),
  discover: (q: string) => api.get<{ users: User[] }>(`/friends/discover?q=${encodeURIComponent(q)}`),
  addFriend: (recipientId: string) =>
    api.post<{ requestId: string }>('/friend-requests', { recipientId }),
  removeFriend: (userId: string) => api.del(`/friends/${userId}`),
  friendRequests: () => api.get<{ requests: IncomingRequest[] }>('/friend-requests'),
  acceptRequest: (id: string) => api.post(`/friend-requests/${id}/accept`),
  declineRequest: (id: string) => api.post(`/friend-requests/${id}/decline`),

  squads: () => api.get<{ squads: Squad[]; users: User[] }>('/squads'),
  squad: (id: string) => api.get<{ squad: Squad; users: User[] }>(`/squads/${id}`),
  createSquad: (b: { name: string; emoji?: string; memberIds?: string[] }) =>
    api.post<{ squad: Squad }>('/squads', b),
  updateSquad: (id: string, b: { name?: string; emoji?: string }) =>
    api.patch<{ squad: Squad }>(`/squads/${id}`, b),
  deleteSquad: (id: string) => api.del(`/squads/${id}`),
  addSquadMember: (id: string, userId: string) =>
    api.post<{ squad: Squad }>(`/squads/${id}/members`, { userId }),
  removeSquadMember: (id: string, userId: string) =>
    api.del<{ squad: Squad }>(`/squads/${id}/members/${userId}`),
  leaveSquad: (id: string) => api.post(`/squads/${id}/leave`),
};

/* ---- uploads ---- */

export const uploadApi = {
  /** Upload a photo file to the server; resolves to its absolute URL. */
  photo: (file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return api.upload<{ url: string }>('/uploads', form);
  },
};

/* ---- notifications / presence / discovery ---- */

export const miscApi = {
  notifications: () =>
    api.get<{ notifications: AppNotification[]; unread: number; users: User[] }>('/notifications'),
  markRead: () => api.post('/notifications/read'),

  live: () => api.get<{ live: User[] }>('/live'),
  setLive: (b: { emoji: string; text: string; place?: string; openToJoin?: boolean; durationMins: number }) =>
    api.put<{ liveStatus: User['liveStatus'] }>('/me/live-status', b),
  clearLive: () => api.del('/me/live-status'),

  ping: (text: string, recipientIds: string[]) =>
    api.post<{ delivered: number }>('/pings', { text, recipientIds }),

  search: (q: string) => api.get<{
    plans: Activity[];
    people: User[];
    categories: { key: CategoryKey; label: string; emoji: string }[];
    users: User[];
  }>(`/search?q=${encodeURIComponent(q)}`),
};
