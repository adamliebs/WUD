/**
 * Demo seed — loads a social graph + plans so the API has data to serve.
 * Run with `npm run seed`. Idempotent-ish: it wipes the demo rows first.
 *
 * The "admin" account can be logged into with:
 *   email: admin@wud.app   password: admin1234
 *
 * Seed shape (May 2026):
 *   • 9 users (6 friends of admin, 3 friends-of-friends).
 *   • 2 squads — BFFs (4 ppl) and Run Club (3 ppl) — both hosted by admin.
 *   • ~20 upcoming plans spread across "starting soon," today, tonight,
 *     tomorrow, and this weekend. Coverage is designed so every For You
 *     digest can fire AND the Popular sort has obvious winners:
 *       — 3 coffee + 3 food plans today        → category_cluster
 *       — ≥2 plans within the next hour        → starting_soon
 *       — 5 distinct friends on tonight's plans → big_night
 *       — a "rooftop birthday" with 5 joiners   → top of Popular sort
 *       — a couple of FoF-hosted plans          → FoF visibility unlock
 *     If the seed runs in the morning (6–11 local), morning_pulse also fires
 *     immediately because there are well over 2 plans today.
 *   • Chat seeded on a couple of plans + a few notifications on admin.
 */
import { migrate, q, tx } from './index.js';
import { hashPassword } from '../lib/password.js';
import { newId, now } from '../lib/ids.js';

const min = (n: number) => n * 60_000;

interface SeedUser { id: string; name: string; handle: string; emoji: string; color: string; photoUrl: string; }

/**
 * Profile photos pulled from pravatar.cc — free, no-API-key avatar CDN. Stable
 * URLs at /300?img=<1..70>. Swap any number if the look doesn't fit the seed
 * persona (they're real-person stock photos, not category-tagged).
 */
const FACE = (n: number) => `https://i.pravatar.cc/300?img=${n}`;

const USERS: SeedUser[] = [
  { id: 'u_me',    name: 'Alex Admin', handle: 'admin',   emoji: '🧑‍💻', color: 'from-rose-400 to-orange-500',       photoUrl: FACE(12) },
  { id: 'u_mike',  name: 'Mike',       handle: 'mike',    emoji: '🧔',  color: 'from-sky-400 to-indigo-600',          photoUrl: FACE(33) },
  { id: 'u_sam',   name: 'Samantha',   handle: 'sammy',   emoji: '👩‍🦰', color: 'from-pink-400 to-rose-600',          photoUrl: FACE(5)  },
  { id: 'u_josh',  name: 'Josh',       handle: 'jshredd', emoji: '🧑',  color: 'from-violet-500 to-fuchsia-600',      photoUrl: FACE(14) },
  { id: 'u_maya',  name: 'Maya',       handle: 'mayaa',   emoji: '👩',  color: 'from-emerald-400 to-teal-600',        photoUrl: FACE(44) },
  { id: 'u_ravi',  name: 'Ravi',       handle: 'rav',     emoji: '🧑‍🎤', color: 'from-amber-400 to-orange-600',       photoUrl: FACE(60) },
  { id: 'u_priya', name: 'Priya',      handle: 'pri',     emoji: '👩‍🎨', color: 'from-fuchsia-400 to-purple-700',     photoUrl: FACE(49) },
  // Not admin's friends — they exist so "people you may know" (friends-of-
  // friends) and handle search have something to surface in the demo.
  { id: 'u_noah',  name: 'Noah',       handle: 'noahw',   emoji: '🧑‍🚀', color: 'from-teal-400 to-cyan-700',          photoUrl: FACE(11) },
  { id: 'u_zoe',   name: 'Zoe',        handle: 'zoey',    emoji: '🦊',  color: 'from-violet-500 to-fuchsia-600',      photoUrl: FACE(47) },
  { id: 'u_liam',  name: 'Liam',       handle: 'liamk',   emoji: '🥷',  color: 'from-zinc-500 to-zinc-800',           photoUrl: FACE(68) },
];

/**
 * Event banner photos pulled from Unsplash by stable photo ID. Loaded as
 * absolute URLs so the existing mediaUrl() passthrough works without changes
 * to the upload pipeline. Width-capped via `?w=1200` for sane bandwidth.
 */
const BANNER = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&auto=format&fit=crop&q=80`;

const FRIEND_IDS = ['u_mike', 'u_sam', 'u_josh', 'u_maya', 'u_ravi', 'u_priya'];

// Friendships between non-admin users — these create the friend-of-friend graph
// that powers "people you may know" suggestions in Discover.
const CROSS_FRIENDSHIPS: [string, string][] = [
  ['u_noah', 'u_mike'], ['u_noah', 'u_sam'],
  ['u_zoe', 'u_maya'], ['u_zoe', 'u_ravi'],
  ['u_liam', 'u_josh'], ['u_liam', 'u_ravi'],
];

/* --- timestamp helpers --------------------------------------------------- */

/** Today at HH:MM local. If already in the past, rolls to tomorrow. */
const todayAt = (hour: number, minute = 0): number => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
};

/** N days from today at HH:MM local. days=1 = tomorrow, days=2 = day after, … */
const daysAhead = (days: number, hour: number, minute = 0): number => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};

function run(): void {
  migrate();
  const ts = now();

  tx(() => {
    // Wipe — clear the whole graph (FK cascade does the heavy lifting).
    for (const t of ['users']) q.run(`DELETE FROM ${t}`);

    // Users + settings + an email login for each (admin gets a dedicated one;
    // every other seed user can be logged into as <handle>@wud.app / demo1234).
    const demoHash = hashPassword('demo1234');
    for (const u of USERS) {
      q.run(
        `INSERT INTO users (id, name, handle, avatar_emoji, color, photo_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        u.id, u.name, u.handle, u.emoji, u.color, u.photoUrl, ts, ts,
      );
      q.run('INSERT INTO user_settings (user_id) VALUES (?)', u.id);
      const email = u.id === 'u_me' ? 'admin@wud.app' : `${u.handle}@wud.app`;
      const hash = u.id === 'u_me' ? hashPassword('admin1234') : demoHash;
      q.run(
        `INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, password_hash, created_at)
         VALUES (?, ?, 'email', ?, ?, ?, ?)`,
        newId(), u.id, email, email, hash, ts,
      );
    }

    // Friendships — admin is friends with everyone in FRIEND_IDS.
    for (const fid of FRIEND_IDS) {
      const [a, b] = 'u_me' < fid ? ['u_me', fid] : [fid, 'u_me'];
      q.run('INSERT INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)', a, b, ts);
    }
    // Cross-friendships between non-admin users → friend-of-friend graph.
    for (const [u1, u2] of CROSS_FRIENDSHIPS) {
      const [a, b] = u1 < u2 ? [u1, u2] : [u2, u1];
      q.run('INSERT INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)', a, b, ts);
    }

    /* --- squads --------------------------------------------------------- */

    // BFFs — broad social squad. Tagged on a couple of dinners + the gym session.
    q.run(
      'INSERT INTO squads (id, name, emoji, host_id, created_at) VALUES (?, ?, ?, ?, ?)',
      's_bff', 'BFFs', '💖', 'u_me', ts,
    );
    for (const m of ['u_mike', 'u_sam', 'u_maya']) {
      q.run('INSERT INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)', 's_bff', m, ts);
    }

    // Run Club — narrower fitness squad. Tagged on the morning run.
    q.run(
      'INSERT INTO squads (id, name, emoji, host_id, created_at) VALUES (?, ?, ?, ?, ?)',
      's_run', 'Run Club', '🏃', 'u_me', ts,
    );
    for (const m of ['u_sam', 'u_maya', 'u_ravi']) {
      q.run('INSERT INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)', 's_run', m, ts);
    }

    /* --- activities ----------------------------------------------------- */

    // 2h default duration matches the migration's backfill default, so seed
    // data and migrated rows feel consistent. Override per-activity via
    // opts.durationMins when a specific activity needs a longer/shorter window.
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const mkActivity = (
      id: string, host: string, category: string, title: string, place: string,
      startsAt: number,
      opts: { joiners?: string[]; maybe?: string[]; squadIds?: string[]; isPrivate?: boolean; isOpenInvite?: boolean; description?: string; bannerUrl?: string; durationMins?: number } = {},
    ) => {
      const endsAt = startsAt + (opts.durationMins !== undefined
        ? opts.durationMins * 60_000
        : TWO_HOURS);
      q.run(
        `INSERT INTO activities
          (id, host_id, category, title, description, place, starts_at, ends_at,
           is_private, is_open_invite, banner_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, host, category, title, opts.description ?? '', place,
        startsAt, endsAt,
        opts.isPrivate ? 1 : 0,
        opts.isOpenInvite === false ? 0 : 1,
        opts.bannerUrl ?? null,
        ts, ts,
      );
      let order = 0;
      for (const j of opts.joiners ?? []) {
        q.run(
          `INSERT INTO rsvps (activity_id, user_id, state, order_index, created_at, updated_at)
           VALUES (?, ?, 'going', ?, ?, ?)`,
          id, j, ++order, ts, ts,
        );
      }
      for (const m of opts.maybe ?? []) {
        q.run(
          `INSERT INTO rsvps (activity_id, user_id, state, order_index, created_at, updated_at)
           VALUES (?, ?, 'maybe', ?, ?, ?)`,
          id, m, ++order, ts, ts,
        );
      }
      for (const sq of opts.squadIds ?? []) {
        q.run('INSERT INTO activity_squads (activity_id, squad_id) VALUES (?, ?)', id, sq);
      }
    };

    /* Starting soon — within the next hour, drives the ⏰ "starting_soon" card. */
    mkActivity('a1', 'u_josh',  'gaming', 'Fortnite squad up',       'Online · PS5',         ts + min(5),   { joiners: ['u_ravi', 'u_liam'] });
    mkActivity('a2', 'u_sam',   'run',    '5k jog along the river',  'West Side Greenway',   ts + min(15),  { squadIds: ['s_run'] });
    mkActivity('a3', 'u_mike',  'gym',    'Hitting the gym',         'Equinox SoHo',         ts + min(30),  { joiners: ['u_josh'], squadIds: ['s_bff'] });
    mkActivity('a4', 'u_maya',  'coffee', 'Coffee + work session',   'Devoción Williamsburg', ts + min(45),  { maybe: ['u_sam', 'u_priya'] });

    /* Today, a couple hours out — same-category clustering trips category_cluster.
       Three coffee plans + three food plans today (counting a4 above) → cluster card. */
    mkActivity('a5', 'u_ravi',  'coffee', 'Brew tasting',            'Sey Coffee',           ts + min(90),  { joiners: ['u_sam'], bannerUrl: BANNER('1495474472287-4d71bcdd2085') });
    mkActivity('a6', 'u_sam',   'coffee', 'Espresso bar pop-up',     'Devoción Flatiron',    ts + min(200), { joiners: ['u_mike', 'u_maya'] });
    mkActivity('a7', 'u_maya',  'food',   'Ramen run',               'Ippudo East Village',  ts + min(120), { joiners: ['u_josh', 'u_ravi', 'u_priya'] });
    mkActivity('a8', 'u_josh',  'food',   'Taco truck dinner',       'Los Tacos No.1',       ts + min(240), { joiners: ['u_mike', 'u_sam'] });
    mkActivity('a9', 'u_priya', 'food',   'Dim sum brunch',          'Nom Wah Tea Parlor',   ts + min(300), { joiners: ['u_maya', 'u_ravi'] });

    /* Tonight (5pm onward) — drives the 🔥 big_night card. Five distinct friends
       across the three plans below. Picked specifically for tonight so the card
       fires on the same day; the bucket logic handles after-midnight plans too. */
    mkActivity('a10', 'u_mike',  'drinks', 'Beer garden hang',        'Standings Bushwick', todayAt(19, 0),     { joiners: ['u_sam', 'u_josh', 'u_maya', 'u_ravi', 'u_priya'], squadIds: ['s_bff'], bannerUrl: BANNER('1514933651103-005eec06c04b') });
    mkActivity('a11', 'u_sam',   'party',  'Karaoke night',           'Insa Gowanus',       todayAt(21, 30),    { joiners: ['u_mike', 'u_maya', 'u_priya'], bannerUrl: BANNER('1493676304819-0d7a8d026dcf') });
    mkActivity('a12', 'u_josh',  'food',   'Late-night ramen',        'Ichiran Bushwick',   todayAt(23, 30),    { joiners: ['u_ravi'] });

    /* Tomorrow — variety + a clear popular-sort winner. */
    mkActivity('a13', 'u_maya',  'outdoors', 'Sunrise hike',          'Breakneck Ridge',    daysAhead(1, 6, 30),  { joiners: ['u_sam'], bannerUrl: BANNER('1571019613454-1cb2f99b2d8b') });
    mkActivity('a14', 'u_ravi',  'party',    "Ravi's rooftop birthday", 'Westlight',         daysAhead(1, 20, 0),  { joiners: ['u_priya', 'u_maya', 'u_sam', 'u_mike', 'u_josh'], description: 'Bring something sparkly. There will be cake.', bannerUrl: BANNER('1492684223066-81342ee5ff30') });
    mkActivity('a15', 'u_priya', 'food',     'Brunch',                'Jack\'s Wife Freda', daysAhead(1, 11, 0),  { joiners: ['u_maya'] });
    mkActivity('a16', 'u_mike',  'drinks',   'Wine night',            'Vinya Wine',         daysAhead(1, 19, 0),  { joiners: ['u_sam', 'u_josh'] });

    /* Weekend / later — gives the calendar / week filter something to chew on. */
    mkActivity('a17', 'u_sam',   'outdoors', 'Beach day',             'Riis Beach',         daysAhead(3, 11, 0),  { joiners: ['u_mike', 'u_maya', 'u_josh', 'u_ravi', 'u_priya'], bannerUrl: BANNER('1507525428034-b723cf961d3e') });
    mkActivity('a18', 'u_josh',  'movie',    'IMAX showing',          'AMC Lincoln Square', daysAhead(4, 19, 30), { joiners: ['u_mike', 'u_maya'], bannerUrl: BANNER('1489599849927-2ee91cede3ba') });
    mkActivity('a19', 'u_ravi',  'gaming',   'LAN party',             'Ravi\'s place',      daysAhead(5, 18, 0),  { joiners: ['u_mike', 'u_josh', 'u_sam'] });
    mkActivity('a20', 'u_me',    'study',    'Co-working session',    'Public Records',     daysAhead(2, 10, 0),  { joiners: ['u_maya'], description: 'Heads-down focus block. BYO laptop.' });

    /* Friend-of-friend hosted — admin isn't friends with Noah/Zoe/Liam, so
       these are FoF and unlock only when a mutual friend RSVPs. Each one has
       a friend joiner so the FoF visibility toggle has something to surface. */
    mkActivity('a21', 'u_noah',  'food',     'Smashburger meetup',    'Hamburger America', daysAhead(2, 19, 0),  { joiners: ['u_mike', 'u_sam'] });
    mkActivity('a22', 'u_zoe',   'coffee',   'Latte art workshop',    'Variety Coffee',    daysAhead(3, 14, 0),  { joiners: ['u_maya'] });

    /* --- chat seed ------------------------------------------------------- */

    // Body bound as a parameter — inlining literals breaks the moment a string
    // contains an apostrophe (SQLite then reads "..." as an identifier).
    const mkMsg = (activityId: string, authorId: string, body: string, atMs: number) => {
      q.run(
        `INSERT INTO messages (id, activity_id, author_id, type, body, created_at)
         VALUES (?, ?, ?, 'text', ?, ?)`,
        newId(), activityId, authorId, body, atMs,
      );
    };
    mkMsg('a10', 'u_mike',  "I'll grab a table by the back patio", ts - min(40));
    mkMsg('a10', 'u_sam',   'great, see you at 7',                  ts - min(35));
    mkMsg('a14', 'u_ravi',  'wear something fun ✨',                ts - min(120));
    mkMsg('a14', 'u_priya', 'bringing my polaroid',                 ts - min(100));
    mkMsg('a17', 'u_sam',   "I'll bring the speaker + sunscreen",   ts - min(60));

    /* --- LIVE NOW activities --------------------------------------------
     * Two activities currently mid-window so the live strip on the feed has
     * something to render after the seed. (The old per-user `live_statuses`
     * table is gone — these are real activities, just with starts_at slightly
     * in the past and ends_at in the future.) */
    mkActivity('a_live_1', 'u_mike', 'gym',    'Quick gym session',  'Equinox SoHo', ts - min(15), { joiners: ['u_sam'], durationMins: 60 });
    mkActivity('a_live_2', 'u_sam',  'coffee', 'Coffee + work',      'Sey Coffee',   ts - min(5),  { durationMins: 60 });

    /* --- notifications for admin --------------------------------------- */

    const mkNotif = (
      type: string, fromId: string, activityId: string, body: string, atMs: number,
    ) => {
      q.run(
        `INSERT INTO notifications (id, user_id, type, from_id, activity_id, body, read, resolved, created_at)
         VALUES (?, 'u_me', ?, ?, ?, ?, 0, 0, ?)`,
        newId(), type, fromId, activityId, body, atMs,
      );
    };
    mkNotif('join',   'u_ravi',  'a14', 'Ravi is going to "Ravi\'s rooftop birthday"',                       ts - min(45));
    mkNotif('join',   'u_priya', 'a14', 'Priya is going to "Ravi\'s rooftop birthday"',                      ts - min(30));
    mkNotif('invite', 'u_mike',  'a21', 'Mike RSVP\'d to "Smashburger meetup" — now visible to you',         ts - min(20));
  });

  console.log('✅ Seed complete.');
  console.log('   Admin login →  email: admin@wud.app   password: admin1234');
  console.log(`   ${USERS.length} users, ${FRIEND_IDS.length + CROSS_FRIENDSHIPS.length} friendships, 24 activities (2 live now), 2 squads.`);
}

run();
