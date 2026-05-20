import { motion } from 'framer-motion';
import { Bell, EyeOff, Globe2, HelpCircle, LogOut, Megaphone, Moon, Palette, Shield, Sun, Trash2, UserCircle } from 'lucide-react';
import { type ReactNode } from 'react';
import { OverlayShell } from '../components/OverlayShell';
import { Toggle } from '../components/Toggle';
import { useApp, type AppSettings } from '../store';

export function SettingsScreen() {
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = () => openOverlay(null);
  const settings = useApp(s => s.settings);
  const updateSettings = useApp(s => s.updateSettings);
  const pushToast = useApp(s => s.pushToast);
  const signOut = useApp(s => s.signOut);

  const set = <K extends keyof AppSettings>(k: K) => (v: AppSettings[K]) =>
    updateSettings({ [k]: v } as Partial<AppSettings>);

  return (
    <OverlayShell title="Settings" onClose={closeOverlay}>
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
          <Row
            icon={<Shield size={16} />}
            label="Host transfer offers"
            sub="Get offered the host role when a host leaves"
            right={<Toggle value={settings.hostTransferEnabled} onChange={set('hostTransferEnabled')} ariaLabel="Host transfer offers" />}
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

        {/* Privacy */}
        <Group title="Privacy">
          <Row
            icon={<EyeOff size={16} />}
            label="Show me to friends-of-friends"
            sub="When you join a friend's plan, their friends can see you"
            right={<Toggle value={settings.showMeToFoF} onChange={set('showMeToFoF')} ariaLabel="Show to friends of friends" />}
          />
          <Row
            icon={<Globe2 size={16} />}
            label="Default new plans to Private"
            sub="Only your direct friends can see — no FoF unlock"
            right={<Toggle value={settings.defaultPrivate} onChange={set('defaultPrivate')} ariaLabel="Default private" />}
          />
        </Group>

        {/* Appearance */}
        <Group title="Appearance">
          <div className="mx-4 mt-2 p-1 rounded-2xl bg-white/5 border border-white/10 grid grid-cols-3 gap-1 relative">
            {(['system', 'dark', 'light'] as const).map(opt => {
              const active = settings.appearance === opt;
              const Icon = opt === 'system' ? Palette : opt === 'dark' ? Moon : Sun;
              return (
                <button
                  key={opt}
                  onClick={() => set('appearance')(opt)}
                  className="relative py-2 rounded-xl text-sm font-semibold text-zinc-300 capitalize"
                >
                  {active && (
                    <motion.div
                      layoutId="appearancepill"
                      className="absolute inset-0 bg-white rounded-xl"
                      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                    />
                  )}
                  <span className={`relative inline-flex items-center gap-1.5 ${active ? 'text-zinc-900' : ''}`}>
                    <Icon size={13} />
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mx-4 mt-2 text-[11px] text-zinc-500 px-1">
            Mockup preview — visual setting only.
          </div>
        </Group>

        {/* About */}
        <Group title="About">
          <Row
            icon={<HelpCircle size={16} />}
            label="Help & support"
            chevron
            onClick={() => pushToast('Mockup — no support inbox yet', 'default')}
          />
          <Row
            icon={<UserCircle size={16} />}
            label="Version"
            sub="WUD 0.1 · mockup build"
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
          <Row
            icon={<Trash2 size={16} className="text-rose-300" />}
            label="Delete account"
            danger
            onClick={() => pushToast('Mockup only — account deletion not wired', 'warn')}
          />
        </Group>
      </div>
    </OverlayShell>
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
