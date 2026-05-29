import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronLeft, FileText, LogOut, Megaphone, ShieldCheck, ShieldOff, Trash2, UserCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Toggle } from '../components/Toggle';
import { useSwipeBack } from '../components/useSwipeBack';
import { useApp, type AppSettings } from '../store';
import { BlockedUsersBody } from './BlockedUsersScreen';
import { PrivacyBody, TermsBody } from './LegalScreens';

/**
 * Settings overlay — single persistent shell wrapping an internal page stack
 * for Blocked users / Privacy / Terms.
 *
 * Why a stack (not separate overlays)? Mounting the sub-screens at the
 * OverlayHost level made Settings unmount as Privacy slid in over the
 * underlying feed — exactly the same flash bug Squads had when entering a
 * squad. Reusing Squads' "one shell, inner AnimatePresence with directional
 * z-index" pattern fixes both problems cleanly: the shell stays mounted, the
 * pages slide push/pop on top of each other, and back from a sub-page
 * reveals the settings list underneath instead of closing everything.
 */

type SubScreen = null | 'blocked' | 'privacy' | 'terms';

/** Depth = 0 for the settings list, 1 for any sub-screen. Drives push/pop. */
const subDepth = (s: SubScreen) => (s === null ? 0 : 1);

/** Direction-aware slide. custom=+1 pushes forward (new from right, on top);
 *  custom=-1 pops back (old slides off to right, on top, revealing new). */
const pageSlide = {
  enter:  (dir: 1 | -1) => ({ x: dir > 0 ? '100%'  : '-100%', zIndex: dir > 0 ? 2 : 1 }),
  center: (dir: 1 | -1) => ({ x: 0,                            zIndex: dir > 0 ? 2 : 1 }),
  exit:   (dir: 1 | -1) => ({ x: dir > 0 ? '-100%' : '100%',  zIndex: dir > 0 ? 1 : 2 }),
};
const pageTransition = { type: 'spring' as const, stiffness: 360, damping: 36 };

export function SettingsScreen() {
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = () => openOverlay(null);
  const refreshBlocks = useApp(s => s.refreshBlocks);

  const [sub, setSub] = useState<SubScreen>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Set the slide direction at navigation time from the depth delta, so the
  // entrance animation reads as push vs. pop without per-callsite plumbing.
  const go = (next: SubScreen) => {
    setDirection(subDepth(next) >= subDepth(sub) ? 1 : -1);
    setSub(next);
    // Fetch the latest blocks when the user actually opens that pane —
    // matches the openOverlay refresh effect we used to do at the host level.
    if (next === 'blocked') void refreshBlocks();
  };

  // Back chevron pops within Settings first; only closes the overlay when
  // we're already on the root list. Left-edge swipe-right uses the same
  // logic so the gesture pops sub-pages step by step before exiting.
  const onClose = () => (sub ? go(null) : closeOverlay());
  const swipeRef = useSwipeBack<HTMLDivElement>(onClose);

  const title =
    sub === 'privacy' ? 'Privacy Policy'
    : sub === 'terms'  ? 'Terms of Service'
    : sub === 'blocked' ? 'Blocked users'
    : 'Settings';

  const pageKey = sub ?? 'list';

  return (
    // Outer = overlay-level open/close. Inline (vs OverlayShell) so the header
    // can update across sub-screens without remounting the shell — that's
    // what prevents the feed-flash between settings → privacy.
    <motion.div
      ref={swipeRef}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={pageTransition}
      className="absolute inset-0 z-40 bg-[#07060b] flex flex-col"
    >
      {/* Header — content swaps in place while the shell stays mounted. */}
      <div className="pt-status px-3 pb-3 flex items-center justify-between border-b border-white/5 relative z-10">
        <button
          onClick={onClose}
          className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-white hover:bg-white/5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-base font-bold text-white truncate px-2">{title}</div>
        <div className="min-w-[36px]" />
      </div>

      {/* Page stack — absolutely-positioned pages slide push/pop within. */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={pageKey}
            custom={direction}
            variants={pageSlide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0 overflow-y-auto no-scrollbar bg-[#07060b]"
          >
            {sub === null     && <SettingsListBody onGo={go} />}
            {sub === 'blocked' && <BlockedUsersBody />}
            {sub === 'privacy' && <PrivacyBody />}
            {sub === 'terms'   && <TermsBody />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── Settings list body ─────────────────────────── */

function SettingsListBody({ onGo }: { onGo: (s: SubScreen) => void }) {
  const settings = useApp(s => s.settings);
  const updateSettings = useApp(s => s.updateSettings);
  const signOut = useApp(s => s.signOut);

  const set = <K extends keyof AppSettings>(k: K) => (v: AppSettings[K]) =>
    updateSettings({ [k]: v } as Partial<AppSettings>);

  return (
    <div className="pb-32">
      {/* Account header card */}
      <AccountCard />

      {/* Notifications */}
      <Group title="Notifications">
        <Row
          icon={<Bell size={16} />}
          label="Push notifications"
          sub="Joins, host transfers, pings"
          right={<Toggle value={settings.pushEnabled} onChange={set('pushEnabled')} ariaLabel="Push notifications" />}
        />
        <Row
          icon={<Megaphone size={16} />}
          label="Allow pings from friends"
          sub="Friends can ping you with 'WUD?'"
          right={<Toggle value={settings.pingsEnabled} onChange={set('pingsEnabled')} ariaLabel="Allow pings" />}
        />
      </Group>

      {/* Reminders */}
      <Group title="Reminders">
        <div className="px-4 py-3">
          <div className="text-sm font-semibold text-white mb-0.5">Default reminder</div>
          <div className="text-[11px] text-zinc-400 mb-3">
            Fired for plans you're hosting or going to. Override per-plan from any event.
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { mins: null, label: 'Off' },
              { mins: 5,    label: '5m' },
              { mins: 15,   label: '15m' },
              { mins: 30,   label: '30m' },
              { mins: 60,   label: '1h' },
            ] as const).map(opt => {
              const active = settings.defaultReminderMins === opt.mins;
              return (
                <button
                  key={String(opt.mins)}
                  onClick={() => set('defaultReminderMins')(opt.mins)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                              ${active
                                ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400'
                                : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </Group>

      {/* Safety — Apple Guideline 1.2 */}
      <Group title="Safety">
        <Row
          icon={<ShieldOff size={16} />}
          label="Blocked users"
          sub="Manage who can't see or contact you"
          chevron
          onClick={() => onGo('blocked')}
        />
      </Group>

      {/* Legal */}
      <Group title="Legal">
        <Row
          icon={<ShieldCheck size={16} />}
          label="Privacy Policy"
          chevron
          onClick={() => onGo('privacy')}
        />
        <Row
          icon={<FileText size={16} />}
          label="Terms of Service"
          chevron
          onClick={() => onGo('terms')}
        />
      </Group>

      {/* About */}
      <Group title="About">
        <Row
          icon={<UserCircle size={16} />}
          label="Version"
          sub="WUD 0.1"
        />
      </Group>

      {/* Danger zone */}
      <Group title="Danger zone">
        <Row
          icon={<LogOut size={16} className="text-rose-300" />}
          label="Sign out"
          danger
          onClick={signOut}
        />
        <DeleteAccountRow />
      </Group>
    </div>
  );
}

/** Delete-account row with an inline two-step confirmation. */
function DeleteAccountRow() {
  const deleteAccount = useApp(s => s.deleteAccount);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Row
        icon={<Trash2 size={16} className="text-rose-300" />}
        label="Delete account"
        danger
        onClick={() => setConfirming(true)}
      />
    );
  }

  return (
    <div className="px-4 py-3.5">
      <div className="text-sm font-bold text-rose-200">Delete your account?</div>
      <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
        This permanently erases your profile, plans, squads, and messages.
        It cannot be undone.
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={deleteAccount}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-500 active:bg-rose-600"
        >
          Delete forever
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-zinc-200 bg-white/5 border border-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AccountCard() {
  const me = useApp(s => s.me());
  const openOverlay = useApp(s => s.openOverlay);
  return (
    <div className="mx-4 mt-4 p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
      <div className={`h-12 w-12 rounded-full grid place-items-center text-2xl bg-gradient-to-br ${me.color}`}>
        {me.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">{me.name}</div>
        <div className="text-[11px] text-zinc-400 truncate">@{me.handle}</div>
      </div>
      <button
        onClick={() => openOverlay('editProfile')}
        className="px-3 py-1.5 rounded-full text-xs font-bold bg-white text-zinc-900"
      >
        Edit
      </button>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-5">
        {title}
      </div>
      <div className="mx-4 rounded-2xl bg-white/5 border border-white/10 overflow-hidden divide-y divide-white/5">
        {children}
      </div>
    </div>
  );
}

function Row({
  icon, label, sub, right, chevron, danger, onClick,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  right?: ReactNode;
  chevron?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const Comp: 'button' | 'div' = interactive ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-center gap-3
                 ${interactive ? 'hover:bg-white/[0.04] active:bg-white/[0.06]' : ''}
                 ${danger ? 'text-rose-300' : 'text-white'}`}
    >
      <span className={`h-8 w-8 grid place-items-center rounded-xl
                       ${danger ? 'bg-rose-500/10' : 'bg-white/5'}`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold ${danger ? 'text-rose-200' : 'text-white'}`}>
          {label}
        </span>
        {sub && <span className="block text-[11px] text-zinc-400 mt-0.5">{sub}</span>}
      </span>
      {right}
      {chevron && (
        <span className="text-zinc-500 text-lg leading-none">›</span>
      )}
    </Comp>
  );
}
