import { AnimatePresence, motion } from 'framer-motion';
import { Contact2, Search, Send, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { OverlayShell } from '../components/OverlayShell';
import { socialApi } from '../api/endpoints';
import { useApp } from '../store';
import type { User } from '../types';

/** Build the invite link + body for the native share sheet. The recipient
 *  taps it and either lands in the iOS app (universal link) or in the web
 *  build's Welcome screen (which can read ?from to greet them by name). */
async function shareInvite(me: User): Promise<void> {
  const url = `https://app.wud.app/invite?from=${encodeURIComponent(me.handle)}`;
  const text = `Hey! What U Doing? "${me.name}" wants you on WUD — come hang out.`;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      const can = await Share.canShare();
      if (can.value) {
        await Share.share({ title: 'Join me on WUD', text, url, dialogTitle: 'Invite friends' });
        return;
      }
    }
  } catch (e) {
    // User dismissal surfaces as a throw; treat as silent no-op.
    const msg = (e as { message?: string })?.message?.toLowerCase() ?? '';
    if (msg.includes('cancel') || msg.includes('abort')) return;
  }
  // Web fallback.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'Join me on WUD', text, url });
      return;
    }
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    useApp.getState().pushToast('Invite copied to clipboard', 'success');
  } catch {
    useApp.getState().pushToast('Could not share the invite', 'warn');
  }
}

type Tab = 'friends' | 'discover';

export function FriendsScreen() {
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = () => openOverlay(null);
  const me = useApp(s => s.me());
  const friends = useApp(useShallow(s => s.friendIds.map(id => s.userById(id))));

  const [tab, setTab] = useState<Tab>('friends');
  const [contactsOpen, setContactsOpen] = useState(false);
  const [q, setQ] = useState('');
  // Discover results come from the server (the store only caches known users).
  const [discoverResults, setDiscoverResults] = useState<User[]>([]);

  // Fetch the discover list whenever the Discover tab is active and the query
  // changes (lightly debounced).
  useEffect(() => {
    if (tab !== 'discover') return;
    let cancelled = false;
    const t = setTimeout(() => {
      socialApi.discover(q.trim())
        .then(r => { if (!cancelled) setDiscoverResults(r.users); })
        .catch(() => { if (!cancelled) setDiscoverResults([]); });
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tab, q]);

  // Discover shows "people you may know" until 2+ chars are typed, at which
  // point it becomes an explicit handle/name search (matches the server).
  const discoverSearching = tab === 'discover' && q.trim().length >= 2;

  const filtered = useMemo(() => {
    if (tab === 'discover') return discoverResults;
    const needle = q.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter(u =>
      u.name.toLowerCase().includes(needle) || u.handle.toLowerCase().includes(needle),
    );
  }, [tab, friends, discoverResults, q]);

  return (
    <OverlayShell title="Friends" onClose={closeOverlay}>
      <div className="px-4 pt-4 pb-32">
        {/* Two stacked CTAs: pull from contacts (matches already-on-WUD users)
            + share an invite link (covers everyone else). */}
        <div className="grid grid-cols-1 gap-2 mb-3">
          <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={() => setContactsOpen(true)}
            className="w-full inline-flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left
                       bg-gradient-to-br from-sky-500/15 via-cyan-500/10 to-blue-500/10
                       border border-sky-400/30
                       hover:from-sky-500/20 hover:via-cyan-500/15 hover:to-blue-500/15 transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full grid place-items-center
                              bg-gradient-to-br from-sky-500 to-blue-600 text-white shrink-0">
                <Contact2 size={15} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">Find friends in your contacts</div>
                <div className="text-[11px] text-zinc-300 truncate">See who's already on WUD.</div>
              </div>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={() => void shareInvite(me)}
            className="w-full inline-flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left
                       bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-orange-500/10
                       border border-rose-400/30
                       hover:from-rose-500/20 hover:via-pink-500/15 hover:to-orange-500/15 transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full grid place-items-center
                              bg-gradient-to-br from-rose-500 to-orange-500 text-white shrink-0">
                <Send size={15} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">Invite friends</div>
                <div className="text-[11px] text-zinc-300 truncate">Share a link and bring your crew over.</div>
              </div>
            </div>
          </motion.button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={tab === 'friends' ? 'Search your friends' : 'Search a @handle to add someone'}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-sm placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
          />
        </div>

        {/* Tab switch */}
        <div className="mt-3 grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1 relative">
          {(['friends', 'discover'] as const).map(t => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative py-2 rounded-xl text-sm font-semibold text-zinc-300"
              >
                {active && (
                  <motion.div
                    layoutId="friendspill"
                    className="absolute inset-0 bg-white rounded-xl"
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}
                <span className={`relative inline-flex items-center gap-1.5 ${active ? 'text-zinc-900' : ''}`}>
                  {t === 'friends' ? <Users size={13} /> : <UserPlus size={13} />}
                  {t === 'friends' ? `Friends · ${friends.length}` : 'Discover'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Incoming friend requests — shown on the Friends tab. */}
        {tab === 'friends' && <FriendRequests />}

        {/* List — outer div is keyed by `tab` so swapping tabs cleanly remounts the
            list (no per-row exit/enter cascading from the old tab). Within a tab,
            AnimatePresence still gives a soft fade when a row is added/removed
            (e.g. removing a friend), without any layout-driven sliding. */}
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="mt-4 flex flex-col gap-2"
        >
          {/* Discover header — distinguishes "people you may know" (no query)
              from explicit handle-search results. */}
          {tab === 'discover' && filtered.length > 0 && (
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 px-1 -mb-0.5">
              {discoverSearching ? `Results · ${filtered.length}` : 'People you may know'}
            </div>
          )}

          <AnimatePresence initial={false}>
            {filtered.map(u => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <PersonRow user={u} mode={tab} />
              </motion.div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="text-center text-zinc-500 text-sm mt-12 px-6 leading-relaxed">
              {tab === 'friends'
                ? (q ? 'No friends match.' : 'You haven\'t added any friends yet.')
                : (discoverSearching
                    ? 'No one with that handle. Check the exact @handle and try again.'
                    : 'Search a friend’s @handle above to add them. People you may know show up here too.')}
            </div>
          )}
        </motion.div>
      </div>

      {/* Contact-matching modal — overlays the FriendsScreen. Kept inside
          OverlayShell so its z-index inherits the overlay stack. */}
      <AnimatePresence>
        {contactsOpen && (
          <ContactFinderModal onClose={() => setContactsOpen(false)} />
        )}
      </AnimatePresence>
    </OverlayShell>
  );
}

/**
 * Modal that asks for contacts permission, reads the device address book,
 * matches emails against registered WUD users, and lets you send friend
 * requests to the matches.
 *
 * Phases:
 *   • idle       → "Tap to allow" intro
 *   • working    → reading + matching spinner
 *   • matched    → list of matches with Add buttons
 *   • empty      → matched, but nothing came back
 *   • denied     → permission refused
 *   • unavailable → not running natively (web build)
 */
function ContactFinderModal({ onClose }: { onClose: () => void }) {
  type Phase = 'idle' | 'working' | 'matched' | 'empty' | 'denied' | 'unavailable';
  const [phase, setPhase] = useState<Phase>('idle');
  const [matches, setMatches] = useState<User[]>([]);
  const addFriend = useApp(s => s.addFriend);
  const pushToast = useApp(s => s.pushToast);

  const findInContacts = async () => {
    setPhase('working');
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        setPhase('unavailable');
        return;
      }
      const { Contacts } = await import('@capacitor-community/contacts');

      const perm = await Contacts.requestPermissions();
      if (perm.contacts !== 'granted') {
        setPhase('denied');
        return;
      }

      // Pull both emails and phone numbers. We send them raw to the server
      // over TLS; the server normalizes + HMAC-hashes phones in memory and
      // discards them after matching — they're never persisted.
      const { contacts } = await Contacts.getContacts({
        projection: { emails: true, phones: true, name: false, postalAddresses: false,
                      organization: false, birthday: false, urls: false, image: false, note: false },
      });
      const emails: string[] = [];
      const phones: string[] = [];
      for (const c of contacts) {
        for (const e of c.emails ?? []) {
          if (e?.address) emails.push(e.address);
        }
        for (const p of c.phones ?? []) {
          if (p?.number) phones.push(p.number);
        }
      }
      if (emails.length === 0 && phones.length === 0) {
        setMatches([]);
        setPhase('empty');
        return;
      }
      const { users } = await socialApi.contactMatch({ emails, phones });
      setMatches(users);
      setPhase(users.length === 0 ? 'empty' : 'matched');
    } catch (e) {
      pushToast(
        (e as { message?: string })?.message?.includes('cancel')
          ? "Contacts access cancelled"
          : "Couldn't read your contacts",
        'warn',
      );
      setPhase('idle');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-black/60"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-3xl bg-[#15121b]
                   border border-white/10 p-5 shadow-2xl max-h-[70vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold text-white inline-flex items-center gap-2">
            <Contact2 size={16} className="text-sky-300" />
            Find friends from contacts
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-full text-zinc-300 hover:bg-white/5"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {phase === 'idle' && (
          <>
            <div className="text-sm text-zinc-300 leading-relaxed mb-4">
              We'll match the emails in your contacts against WUD accounts. Nothing else
              is stored or shared — we just check who's already here.
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void findInContacts()}
              className="w-full py-3 rounded-2xl text-sm font-bold text-white
                         bg-gradient-to-br from-sky-500 to-blue-600
                         shadow-[0_14px_30px_-12px_rgba(56,189,248,0.55)]"
            >
              Allow contacts access
            </motion.button>
          </>
        )}

        {phase === 'working' && (
          <div className="text-center py-8">
            <div className="text-sm text-zinc-300">Reading your contacts…</div>
          </div>
        )}

        {phase === 'matched' && (
          <>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-bold mb-2">
              {matches.length} on WUD
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
              {matches.map(u => (
                <ContactMatchRow key={u.id} user={u} onAdd={() => addFriend(u.id)} />
              ))}
            </div>
          </>
        )}

        {phase === 'empty' && (
          <div className="text-center py-6 text-sm text-zinc-400">
            Nobody from your contacts is on WUD yet. Try the invite link — bring them over.
          </div>
        )}

        {phase === 'denied' && (
          <div className="text-center py-6 text-sm text-zinc-400">
            Contacts access was denied. You can re-enable it in Settings.
          </div>
        )}

        {phase === 'unavailable' && (
          <div className="text-center py-6 text-sm text-zinc-400">
            Contact matching is only available in the native app.
          </div>
        )}
      </motion.div>
    </>
  );
}

function ContactMatchRow({ user, onAdd }: { user: User; onAdd: () => void }) {
  const [added, setAdded] = useState(false);
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.04] border border-white/10">
      <Avatar user={user} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{user.name}</div>
        <div className="text-[11px] text-zinc-400 truncate">@{user.handle}</div>
      </div>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => { if (!added) { onAdd(); setAdded(true); } }}
        disabled={added}
        className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition
                    ${added
                      ? 'bg-white/5 text-zinc-400 cursor-default'
                      : 'bg-gradient-to-br from-rose-500 to-orange-500 text-white'}`}
      >
        {added ? 'Sent' : 'Add'}
      </motion.button>
    </div>
  );
}

/** Incoming friend-request cards with Accept / Decline. */
function FriendRequests() {
  const requests = useApp(useShallow(s => s.friendRequests));
  const accept = useApp(s => s.acceptFriendRequest);
  const decline = useApp(s => s.declineFriendRequest);
  if (requests.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
        Friend requests · {requests.length}
      </div>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {requests.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-3 p-2.5 rounded-2xl bg-rose-500/10 border border-rose-400/25"
            >
              <Avatar user={r.from} size={42} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{r.from.name}</div>
                <div className="text-[11px] text-zinc-400 truncate">@{r.from.handle} · wants to be friends</div>
              </div>
              <div className="flex items-center gap-1.5">
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => accept(r.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-br from-emerald-500 to-teal-600"
                >
                  Accept
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => decline(r.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold text-zinc-300 bg-white/5 border border-white/10"
                >
                  Decline
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PersonRow({ user, mode }: { user: User; mode: Tab }) {
  const addFriend = useApp(s => s.addFriend);
  const removeFriend = useApp(s => s.removeFriend);
  const friendIds = useApp(s => s.friendIds);

  const isFriend = friendIds.includes(user.id);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10">
      <Avatar user={user} size={42} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{user.name}</div>
        <div className="text-[11px] text-zinc-400 truncate">@{user.handle}</div>
      </div>

      {mode === 'friends' ? (
        <RemoveButton onClick={() => removeFriend(user.id)} />
      ) : isFriend ? (
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 px-2 py-1 rounded-full">
          ✓ Friend
        </span>
      ) : (
        <AddButton onClick={() => addFriend(user.id)} />
      )}
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <span className="text-[10.5px] font-bold uppercase tracking-widest text-zinc-300 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
        Requested
      </span>
    );
  }
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => { onClick(); setSent(true); }}
      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-br from-rose-500 to-orange-500 shadow-[0_8px_24px_-12px_rgba(244,63,94,0.7)]"
    >
      <UserPlus size={12} />
      Add
    </motion.button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-zinc-300 bg-white/5 border border-white/10 hover:bg-white/10"
      >
        <UserMinus size={12} />
        Remove
      </motion.button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        className="px-2.5 py-1.5 rounded-full text-[11px] font-bold text-white bg-rose-500"
      >
        Confirm
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setConfirming(false)}
        className="px-2.5 py-1.5 rounded-full text-[11px] font-bold text-zinc-300 bg-white/5 border border-white/10"
      >
        Cancel
      </motion.button>
    </div>
  );
}
