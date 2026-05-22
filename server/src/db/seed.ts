/**
 * Demo seed — loads a small social graph + plans so the API has data to serve.
 * Run with `npm run seed`. Idempotent-ish: it wipes the demo rows first.
 *
 * The "admin" account can be logged into with:
 *   email: admin@wud.app   password: admin1234
 */
import { migrate, q, tx } from './index.js';
import { hashPassword } from '../lib/password.js';
import { newId, now } from '../lib/ids.js';

const min = (n: number) => n * 60_000;

interface SeedUser { id: string; name: string; handle: string; emoji: string; color: string; }

const USERS: SeedUser[] = [
  { id: 'u_me',    name: 'Alex Admin', handle: 'admin',  emoji: '🧑‍💻', color: 'from-rose-400 to-orange-500' },
  { id: 'u_mike',  name: 'Mike',       handle: 'mike',   emoji: '🧔',  color: 'from-sky-400 to-indigo-600' },
  { id: 'u_sam',   name: 'Samantha',   handle: 'sammy',  emoji: '👩‍🦰', color: 'from-pink-400 to-rose-600' },
  { id: 'u_josh',  name: 'Josh',       handle: 'jshredd', emoji: '🧑', color: 'from-violet-500 to-fuchsia-600' },
  { id: 'u_maya',  name: 'Maya',       handle: 'mayaa',  emoji: '👩',  color: 'from-emerald-400 to-teal-600' },
  { id: 'u_ravi',  name: 'Ravi',       handle: 'rav',    emoji: '🧑‍🎤', color: 'from-amber-400 to-orange-600' },
  { id: 'u_priya', name: 'Priya',      handle: 'pri',    emoji: '👩‍🎨', color: 'from-fuchsia-400 to-purple-700' },
  // Not admin's friends — they exist so "people you may know" (friends-of-
  // friends) and handle search have something to surface in the demo.
  { id: 'u_noah',  name: 'Noah',       handle: 'noahw',  emoji: '🧑‍🚀', color: 'from-teal-400 to-cyan-700' },
  { id: 'u_zoe',   name: 'Zoe',        handle: 'zoey',   emoji: '🦊',  color: 'from-violet-500 to-fuchsia-600' },
  { id: 'u_liam',  name: 'Liam',       handle: 'liamk',  emoji: '🥷',  color: 'from-zinc-500 to-zinc-800' },
];

const FRIEND_IDS = ['u_mike', 'u_sam', 'u_josh', 'u_maya', 'u_ravi', 'u_priya'];

// Friendships between non-admin users — these create the friend-of-friend graph
// that powers "people you may know" suggestions in Discover.
const CROSS_FRIENDSHIPS: [string, string][] = [
  ['u_noah', 'u_mike'], ['u_noah', 'u_sam'],
  ['u_zoe', 'u_maya'], ['u_zoe', 'u_ravi'],
  ['u_liam', 'u_josh'], ['u_liam', 'u_ravi'],
];

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
        `INSERT INTO users (id, name, handle, avatar_emoji, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        u.id, u.name, u.handle, u.emoji, u.color, ts, ts,
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

    // A squad hosted by the admin.
    q.run(
      'INSERT INTO squads (id, name, emoji, host_id, created_at) VALUES (?, ?, ?, ?, ?)',
      's_bff', 'BFFs', '💖', 'u_me', ts,
    );
    for (const m of ['u_mike', 'u_sam', 'u_maya']) {
      q.run('INSERT INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)', 's_bff', m, ts);
    }

    // A few upcoming activities.
    const mkActivity = (
      id: string, host: string, category: string, title: string, place: string,
      inMins: number, opts: { joiners?: string[]; maybe?: string[]; mapX?: number; mapY?: number } = {},
    ) => {
      q.run(
        `INSERT INTO activities
          (id, host_id, category, title, description, place, map_x, map_y, starts_at,
           is_private, is_open_invite, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, 0, 1, ?, ?)`,
        id, host, category, title, place, opts.mapX ?? 0.5, opts.mapY ?? 0.5,
        ts + min(inMins), ts, ts,
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
    };

    mkActivity('a1', 'u_mike', 'gym', 'Hitting the gym', 'Equinox SoHo', 30, { joiners: ['u_josh'], mapX: 0.42, mapY: 0.58 });
    mkActivity('a2', 'u_sam', 'run', '5k jog along the river', 'West Side Greenway', 15, { mapX: 0.3, mapY: 0.4 });
    mkActivity('a3', 'u_josh', 'gaming', 'Fortnite squad up', 'Online · PS5', 5, { joiners: ['u_ravi'] });
    mkActivity('a4', 'u_maya', 'coffee', 'Coffee + work session', 'Devoción Williamsburg', 60, { maybe: ['u_sam', 'u_priya'], mapX: 0.55, mapY: 0.5 });
    mkActivity('a5', 'u_priya', 'drinks', 'Drinks @ rooftop', 'Westlight', 180, { joiners: ['u_ravi', 'u_maya'], mapX: 0.6, mapY: 0.62 });

    // Tag the gym session for the BFFs squad.
    q.run('INSERT INTO activity_squads (activity_id, squad_id) VALUES (?, ?)', 'a1', 's_bff');

    // A couple of chat messages on the drinks plan.
    q.run(
      `INSERT INTO messages (id, activity_id, author_id, type, body, created_at)
       VALUES (?, 'a5', 'u_priya', 'text', 'reservation under Priya, 7pm', ?)`,
      newId(), ts - min(30),
    );

    // A live status for Mike.
    q.run(
      `INSERT INTO live_statuses (user_id, emoji, text, place, open_to_join, started_at, expires_at)
       VALUES ('u_mike', '🏋️', 'at the gym', 'Equinox SoHo', 1, ?, ?)`,
      ts - min(15), ts + min(45),
    );

    // A seed notification for the admin.
    q.run(
      `INSERT INTO notifications (id, user_id, type, from_id, activity_id, body, read, resolved, created_at)
       VALUES (?, 'u_me', 'join', 'u_ravi', 'a5', 'Ravi is going to "Drinks @ rooftop"', 0, 0, ?)`,
      newId(), ts - min(25),
    );
  });

  console.log('✅ Seed complete.');
  console.log('   Admin login →  email: admin@wud.app   password: admin1234');
  console.log(`   ${USERS.length} users, ${FRIEND_IDS.length + CROSS_FRIENDSHIPS.length} friendships, 5 activities, 1 squad.`);
}

run();
