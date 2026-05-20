import type { Activity, AppNotification, Squad, User } from '../types';

export const ME_ID = 'u_me';

// A small helper for seeding live-status timestamps relative to "now".
const seedNow = Date.now();
const seedMin = (n: number) => n * 60 * 1000;

export const SEED_USERS: User[] = [
  { id: ME_ID, name: 'You',      handle: 'you',      avatar: '🧑‍💻', color: 'from-rose-400 to-orange-500' },
  { id: 'u_mike',  name: 'Mike',     handle: 'mike',     avatar: '🧔',  color: 'from-sky-400 to-indigo-600',
    liveStatus: {
      emoji: '🏋️', text: 'at the gym',
      place: 'Equinox SoHo',
      openToJoin: true,
      startedAt: seedNow - seedMin(15), expiresAt: seedNow + seedMin(45),
    } },
  { id: 'u_sam',   name: 'Samantha', handle: 'sammy',    avatar: '👩‍🦰', color: 'from-pink-400 to-rose-600',
    liveStatus: {
      emoji: '🏃', text: 'on a run, hbu?',
      place: 'West Side Greenway',
      openToJoin: true,
      startedAt: seedNow - seedMin(8),  expiresAt: seedNow + seedMin(40),
    } },
  { id: 'u_josh',  name: 'Josh',     handle: 'jshredd',  avatar: '🧑',  color: 'from-violet-500 to-fuchsia-600' },
  { id: 'u_maya',  name: 'Maya',     handle: 'mayaa',    avatar: '👩',  color: 'from-emerald-400 to-teal-600',
    liveStatus: {
      emoji: '☕', text: 'cafe-hopping',
      place: 'Devoción Williamsburg',
      openToJoin: false,
      startedAt: seedNow - seedMin(30), expiresAt: seedNow + seedMin(90),
    } },
  { id: 'u_ravi',  name: 'Ravi',     handle: 'rav',      avatar: '🧑‍🎤', color: 'from-amber-400 to-orange-600' },
  { id: 'u_priya', name: 'Priya',    handle: 'pri',      avatar: '👩‍🎨', color: 'from-fuchsia-400 to-purple-700' },
  // friends-of-friends (not direct friends — unlocked when a friend joins)
  { id: 'u_alex',  name: 'Alex',     handle: 'alexx',    avatar: '🧑‍🚀', color: 'from-cyan-400 to-blue-700' },
  { id: 'u_kai',   name: 'Kai',      handle: 'kaisurf',  avatar: '🏄',  color: 'from-teal-400 to-cyan-700' },
  // Discoverable (not friends, not FoF) — people you can search & add
  { id: 'u_noah',   name: 'Noah',    handle: 'noahh',    avatar: '🧑‍🍳', color: 'from-orange-400 to-red-600' },
  { id: 'u_zoe',    name: 'Zoe',     handle: 'zoezoe',   avatar: '👩‍🦱', color: 'from-pink-300 to-rose-500' },
  { id: 'u_liam',   name: 'Liam',    handle: 'liamz',    avatar: '🧑‍🎓', color: 'from-blue-400 to-sky-700' },
  { id: 'u_olivia', name: 'Olivia',  handle: 'oliv',     avatar: '👱‍♀️', color: 'from-lime-400 to-green-700' },
  { id: 'u_aria',   name: 'Aria',    handle: 'ariaa',    avatar: '🧝‍♀️', color: 'from-purple-400 to-indigo-700' },
];

// "You" is friends with these:
export const SEED_FRIEND_IDS = ['u_mike', 'u_sam', 'u_josh', 'u_maya', 'u_ravi', 'u_priya'];

// Squads — named subsets of friends. Used for targeted posts & pings.
// hostId is who owns the squad; memberIds excludes the host.
// You host "BFFs"; you're a member of "Work crew" (Maya hosts) and "Sweat squad" (Mike hosts).
export const SEED_SQUADS: Squad[] = [
  {
    id: 's_bff',   name: 'BFFs',        emoji: '💖',
    hostId: ME_ID,
    memberIds: ['u_mike', 'u_sam', 'u_maya'],
    createdAt: seedNow - seedMin(60 * 24 * 60),
    chat: [
      { id: 'sc_bff_1', authorId: 'u_sam',   text: 'omg I love this app', at: seedNow - seedMin(60 * 12) },
      { id: 'sc_bff_2', authorId: 'u_maya',  text: 'we should do brunch next weekend', at: seedNow - seedMin(60 * 11) },
      { id: 'sc_bff_3', authorId: ME_ID,     text: 'down, I\'ll post it 🫡',  at: seedNow - seedMin(60 * 10) },
    ],
  },
  {
    id: 's_work',  name: 'Work crew',   emoji: '💻',
    hostId: 'u_maya',
    memberIds: [ME_ID, 'u_priya', 'u_ravi'],
    createdAt: seedNow - seedMin(60 * 24 * 90),
    chat: [
      { id: 'sc_work_1', authorId: 'u_maya', text: 'coffee + standup notes Thursday?', at: seedNow - seedMin(60 * 26) },
      { id: 'sc_work_2', authorId: 'u_ravi', text: 'in', at: seedNow - seedMin(60 * 25) },
    ],
  },
  {
    id: 's_sweat', name: 'Sweat squad', emoji: '🏋️',
    hostId: 'u_mike',
    memberIds: [ME_ID, 'u_josh'],
    createdAt: seedNow - seedMin(60 * 24 * 30),
    chat: [
      { id: 'sc_sweat_1', authorId: 'u_mike', text: 'leg day this week, do not skip 😈', at: seedNow - seedMin(60 * 6) },
    ],
  },
];

// Friend-of-friend map (which friend each FoF is connected through)
export const FOF_VIA: Record<string, string> = {
  u_alex: 'u_mike',
  u_kai:  'u_sam',
};

const now = Date.now();
const min = (n: number) => n * 60 * 1000;

export const SEED_ACTIVITIES: Activity[] = [
  {
    id: 'a1', hostId: 'u_mike', category: 'gym', title: 'Hitting the gym',
    place: 'Equinox SoHo', startsAt: now + min(30), createdAt: now - min(5),
    description: 'Push day. Anyone wanna spot?',
    joinerIds: ['u_josh'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: ['s_sweat'],
    isOpenInvite: true,                     // open to all friends, also tagged for Sweat squad
    mapX: 0.42, mapY: 0.58,
    reactions: [],
    chat: [
      { id: 'm1', authorId: 'u_mike', text: 'Heading in ~30. who pulling up?', at: now - min(4) },
      { id: 'm2', authorId: 'u_josh', text: 'in. bring the wrist wraps', at: now - min(3) },
    ],
  },
  {
    id: 'a2', hostId: 'u_sam', category: 'run', title: '5k jog along the river',
    place: 'West Side Greenway', startsAt: now + min(15), createdAt: now - min(8),
    description: 'Easy pace, ~9 min miles. Coffee after?',
    recurrence: { freq: 'weekly', weekday: new Date(now).getDay() },
    joinerIds: [],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [],
  },
  {
    id: 'a3', hostId: 'u_josh', category: 'gaming', title: 'Fortnite squad up',
    place: 'Online · PS5', startsAt: now + min(5), createdAt: now - min(20),
    description: 'Building a squad of 4 for ranked.',
    joinerIds: ['u_ravi'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [
      { emoji: '🔥', userId: 'u_mike',  at: now - min(15) },
      { emoji: '🔥', userId: 'u_priya', at: now - min(10) },
      { emoji: '🎮', userId: 'u_maya',  at: now - min(8) },
    ],
    chat: [
      { id: 'm3', authorId: 'u_josh', text: 'lobby up in 5', at: now - min(2) },
    ],
  },
  {
    id: 'a4', hostId: 'u_maya', category: 'coffee', title: 'Coffee + work session',
    place: 'Devoción Williamsburg', startsAt: now + min(60), createdAt: now - min(2),
    description: 'Bringing the laptop. Cozy spot upstairs.',
    joinerIds: [],
    isPrivate: false,
    maybeIds: ['u_sam', 'u_priya'],
    cantIds: [],
    squadIds: ['s_work'],
    isOpenInvite: true,                     // open to all friends, also tagged for Work crew
    bannerUrl: 'https://picsum.photos/seed/wud-coffee-spot/800/600',
    reactions: [],
    chat: [],
  },
  {
    id: 'a5', hostId: 'u_priya', category: 'drinks', title: 'Drinks @ rooftop',
    place: 'Westlight', startsAt: now + min(180), createdAt: now - min(40),
    description: 'Sunset views + spicy margs. who in?',
    joinerIds: ['u_ravi', 'u_maya'],
    isPrivate: false,
    maybeIds: ['u_josh'],
    cantIds: ['u_mike'],
    squadIds: [],
    isOpenInvite: true,
    reactions: [
      { emoji: '❤️', userId: 'u_sam',  at: now - min(35) },
      { emoji: '❤️', userId: 'u_mike', at: now - min(20) },
      { emoji: '🍹', userId: 'u_josh', at: now - min(12) },
    ],
    chat: [
      { id: 'm4', authorId: 'u_priya', text: 'reservation under Priya, 7pm', at: now - min(30) },
      { id: 'm5', authorId: 'u_ravi', text: 'down. brining a friend if cool', at: now - min(25) },
      {
        id: 'm5p', authorId: 'u_priya', type: 'poll', at: now - min(22),
        poll: {
          question: 'Where for dinner after?',
          options: [
            { id: 'p1o1', text: 'Lilia (pasta)',          voterIds: ['u_ravi', 'u_maya'] },
            { id: 'p1o2', text: 'Cosme (Mexican)',        voterIds: ['u_priya'] },
            { id: 'p1o3', text: 'Just keep drinking 🍸', voterIds: [] },
          ],
        },
      },
    ],
  },
  {
    id: 'a6', hostId: 'u_ravi', category: 'surf', title: 'Dawn patrol surf',
    place: 'Rockaway 67th', startsAt: now + min(720), createdAt: now - min(60),
    description: '5:30am call. tide looking clean. board rentals on site.',
    joinerIds: [],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [],
  },
  // FoF-hosted plans (Alex via Mike, Kai via Sam) — visible because a friend joined
  {
    id: 'a8', hostId: 'u_alex', category: 'food', title: 'Tacos at Los Tacos #1',
    place: 'Chelsea Market', startsAt: now + min(75), createdAt: now - min(15),
    description: 'Friend of Mike here — meeting up for a quick taco run.',
    joinerIds: ['u_mike'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [
      { id: 'm8', authorId: 'u_alex', text: 'gonna grab a few al pastor, anyone want in?', at: now - min(14) },
      { id: 'm9', authorId: 'u_mike', text: 'omw', at: now - min(10) },
    ],
  },
  {
    id: 'a9', hostId: 'u_kai', category: 'surf', title: 'Long Beach surf',
    place: 'Long Beach NY', startsAt: now + min(900), createdAt: now - min(30),
    description: 'Heading out early. Sam said she\'d bring extra wax.',
    joinerIds: ['u_sam'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [],
  },
  {
    id: 'a7', hostId: 'u_mike', category: 'outdoors', title: 'Central Park picnic',
    place: 'Sheep Meadow', startsAt: now + min(240), createdAt: now - min(90),
    description: 'Bringing a frisbee + speaker. BYO snacks.',
    joinerIds: [ME_ID, 'u_sam'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [
      { id: 'm6', authorId: 'u_mike', text: 'btw might have to bail, sister flying in', at: now - min(20) },
      { id: 'm7', authorId: 'system', text: 'Mike left. You\'ve been offered the host role.', at: now - min(2) },
    ],
  },

  // ──── Past plans (for the History page) ─────────────────────────────────────
  {
    id: 'p1', hostId: ME_ID, category: 'gym', title: 'Leg day',
    place: 'Equinox SoHo', startsAt: now - min(60 * 26), createdAt: now - min(60 * 28),
    description: 'Heavy squats. Brought a friend.',
    joinerIds: ['u_josh'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [
      { id: 'pm1', authorId: ME_ID, text: 'leg day, who in?', at: now - min(60 * 28) },
      { id: 'pm2', authorId: 'u_josh', text: 'pulling up', at: now - min(60 * 27) },
    ],
  },
  {
    id: 'p2', hostId: 'u_sam', category: 'run', title: 'Sunset 5k',
    place: 'West Side Greenway', startsAt: now - min(60 * 48), createdAt: now - min(60 * 50),
    description: 'Easy chatty pace. Coffee after.',
    joinerIds: [ME_ID, 'u_maya'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [
      { id: 'pm3', authorId: 'u_sam', text: 'meet at the boathouse', at: now - min(60 * 49) },
    ],
  },
  {
    id: 'p3', hostId: 'u_josh', category: 'gaming', title: 'Apex grind night',
    place: 'Online · PS5', startsAt: now - min(60 * 24 * 4), createdAt: now - min(60 * 24 * 5),
    description: 'Ranked push. Made it to Diamond 🎉',
    joinerIds: [ME_ID, 'u_ravi'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [
      { id: 'pm4', authorId: 'u_josh', text: 'gg', at: now - min(60 * 24 * 4) },
    ],
  },
  {
    id: 'p4', hostId: ME_ID, category: 'coffee', title: 'Coffee + standup notes',
    place: 'Devoción Williamsburg', startsAt: now - min(60 * 24 * 6), createdAt: now - min(60 * 24 * 7),
    description: 'Hashed out the Q3 plan over a flat white.',
    joinerIds: ['u_maya', 'u_priya'],
    isPrivate: true,
    maybeIds: [],
    cantIds: [],
    squadIds: ['s_work'],
    isOpenInvite: false,                     // squad-only — closed standup, Work crew only
    reactions: [],
    chat: [],
  },
  {
    id: 'p5', hostId: 'u_priya', category: 'drinks', title: 'Birthday drinks',
    place: 'Westlight', startsAt: now - min(60 * 24 * 10), createdAt: now - min(60 * 24 * 11),
    description: 'Priya\'s 28th — rooftop, spicy margs, lots of friends.',
    joinerIds: [ME_ID, 'u_ravi', 'u_maya', 'u_sam'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [
      { emoji: '🎉', userId: 'u_mike', at: now - min(60 * 24 * 10) },
      { emoji: '🎉', userId: 'u_josh', at: now - min(60 * 24 * 10) },
      { emoji: '🎉', userId: ME_ID,     at: now - min(60 * 24 * 10) },
      { emoji: '❤️', userId: 'u_ravi', at: now - min(60 * 24 * 10) },
    ],
    chat: [],
  },
  {
    id: 'p6', hostId: 'u_ravi', category: 'surf', title: 'Rockaway dawn patrol',
    place: 'Rockaway 67th', startsAt: now - min(60 * 24 * 14), createdAt: now - min(60 * 24 * 15),
    description: 'Cold but clean. Worth the alarm.',
    joinerIds: [ME_ID],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [],
  },
  {
    id: 'p7', hostId: ME_ID, category: 'movie', title: 'Movie night — Dune Pt II',
    place: 'AMC Lincoln Sq', startsAt: now - min(60 * 24 * 22), createdAt: now - min(60 * 24 * 23),
    description: 'IMAX. Worth it.',
    joinerIds: ['u_josh', 'u_maya', 'u_sam'],
    isPrivate: false,
    maybeIds: [],
    cantIds: [],
    squadIds: [],
    isOpenInvite: true,
    reactions: [],
    chat: [],
  },
];

export const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1', type: 'join', fromId: 'u_ravi', activityId: 'a5',
    text: 'joined your drinks plan',
    at: now - min(25), read: false,
  },
  {
    id: 'n2', type: 'ping', fromId: 'u_maya',
    text: 'pinged the squad: "i\'m booored 😩"',
    at: now - min(45), read: true,
  },
  {
    id: 'n3', type: 'host_offer', fromId: 'u_mike', activityId: 'a7',
    text: 'left Central Park picnic — want to take over hosting?',
    at: now - min(2), read: false,
  },
];
