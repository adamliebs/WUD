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
  }) => api.post<AuthResult>('/auth/email/register', b, true),

  login: (email: string, password: string) =>
    api.post<AuthResult>('/auth/email/login', { email, password }, true),

  /** Mockup OAuth — `subject` stands in for the verified provider id. */
  oauth: (provider: 'google' | 'apple' | 'facebook', b: {
    subject: string; email?: string; name?: string; handle?: string;
  }) => api.post<AuthResult>(`/auth/oauth/${provider}`, b, true),

  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }, true),

  /** Live handle-availability check (handles are unique; names are not). */
  handleAvailable: (handle: string) =>
    api.get<{ handle: string; available: boolean }>(
      `/auth/handle-available?handle=${encodeURIComponent(handle)}`,
    ),
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
    squadIds?: string[]; mapX?: number; mapY?: number;
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
