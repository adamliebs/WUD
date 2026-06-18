import { motion } from 'framer-motion';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { OverlayShell } from '../components/OverlayShell';
import { PulseButton } from '../components/PulseButton';
import { uploadApi } from '../api/endpoints';
import { useApp } from '../store';

const AVATAR_OPTIONS = [
  '🧑‍💻', '🧑‍🎤', '🧑‍🎨', '🧑‍🚀', '🧑‍🍳', '🧑‍🎓',
  '🧔', '👩‍🦰', '👩', '👱‍♀️', '🧝‍♀️', '🦸', '🥷', '🧙',
  '🐱', '🐶', '🦊', '🐻', '🐯', '🦄', '🐙', '🐳',
  '🌈', '✨', '🔥', '🌊', '🌵', '🍕',
];

// Glassy/transparent palette — three-stop gradients at low opacity so the
// profile banner and emoji avatars read as soft tints over a dark base.
// Matches the Floats card palette so colors feel consistent across the app.
const COLOR_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sunset',   value: 'from-rose-500/25 via-pink-500/15 to-orange-500/10' },
  { label: 'Berry',    value: 'from-pink-500/25 via-rose-500/15 to-rose-500/10' },
  { label: 'Coral',    value: 'from-amber-500/25 via-orange-500/15 to-rose-500/10' },
  { label: 'Aurora',   value: 'from-violet-500/25 via-fuchsia-500/15 to-pink-500/10' },
  { label: 'Ocean',    value: 'from-sky-500/25 via-blue-500/15 to-indigo-500/10' },
  { label: 'Forest',   value: 'from-emerald-500/25 via-teal-500/15 to-cyan-500/10' },
  { label: 'Lagoon',   value: 'from-teal-500/25 via-cyan-500/15 to-sky-500/10' },
  { label: 'Plum',     value: 'from-fuchsia-500/25 via-purple-500/15 to-purple-500/10' },
  { label: 'Storm',    value: 'from-zinc-400/25 via-zinc-500/15 to-zinc-600/10' },
];

export function EditProfileScreen() {
  const me = useApp(s => s.me());
  const updateMe = useApp(s => s.updateMe);
  const openOverlay = useApp(s => s.openOverlay);
  const pushToast = useApp(s => s.pushToast);
  const closeOverlay = () => openOverlay(null);

  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [avatar, setAvatar] = useState(me.avatar);
  const [color, setColor] = useState(me.color);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(me.photoUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    name.trim() !== me.name ||
    handle.trim() !== me.handle ||
    phone.trim() !== (me.phone ?? '') ||
    avatar !== me.avatar ||
    color !== me.color ||
    photoUrl !== me.photoUrl;

  const sanitize = (h: string) => h.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadApi.photo(file, 'avatar');
      setPhotoUrl(url);
    } catch {
      pushToast('Could not upload that photo', 'warn');
    } finally {
      setUploading(false);
    }
  };

  const onRemovePhoto = () => setPhotoUrl(undefined);

  const save = () => {
    if (!dirty) return;
    // Phone semantics: a trimmed empty string clears the phone server-side
    // (null). A non-empty string is normalized by the server. Leaving phone
    // out entirely would NOT clear it — that's why we always send the field.
    const trimmedPhone = phone.trim();
    const phonePatch = trimmedPhone === (me.phone ?? '')
      ? undefined                     // unchanged — omit so we don't churn the server
      : (trimmedPhone === '' ? null : trimmedPhone);
    // Photo semantics mirror phone: the server treats `undefined` as "leave
    // unchanged" and only clears on an explicit `null`. So when the user
    // removed their photo (photoUrl now undefined but they had one), send
    // null — sending undefined silently kept the old photo (the remove bug).
    const photoPatch = photoUrl === me.photoUrl
      ? undefined                     // unchanged — omit
      : (photoUrl ?? null);           // new url, or null to clear
    updateMe({
      name: name.trim() || 'You',
      handle: sanitize(handle) || 'you',
      avatar,
      color,
      ...(photoPatch !== undefined ? { photoUrl: photoPatch } : {}),
      ...(phonePatch !== undefined ? { phone: phonePatch } : {}),
    });
    closeOverlay();
  };

  const previewUser = { id: me.id, name: name.trim() || 'You', avatar, color, photoUrl };

  return (
    <OverlayShell
      title="Edit profile"
      onClose={closeOverlay}
      trailing={
        <button
          onClick={save}
          disabled={!dirty}
          className={`px-3 py-1.5 rounded-full text-sm font-bold transition ${
            dirty ? 'bg-white text-zinc-900' : 'bg-white/5 text-zinc-500'
          }`}
        >
          Save
        </button>
      }
    >
      <div className="pb-32">
        {/* Live preview hero */}
        <div className={`relative h-40 bg-gradient-to-br ${color} transition-colors`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        </div>
        <div className="px-5 -mt-12">
          <div className="relative inline-block">
            <div className="ring-4 ring-[#07060b] rounded-full">
              <motion.div
                key={(photoUrl ?? '') + avatar + color}
                initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              >
                <Avatar user={previewUser} size={88} />
              </motion.div>
            </div>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Upload a profile photo"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full grid place-items-center
                         bg-gradient-to-br from-rose-500 to-orange-500 text-white
                         ring-2 ring-[#07060b] shadow-[0_10px_25px_-10px_rgba(244,63,94,0.7)]"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            </motion.button>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{name.trim() || 'You'}</div>
            <div className="text-sm text-zinc-400">@{sanitize(handle) || 'you'}</div>
          </div>
        </div>

        {/* Hidden file input — triggered by the camera badge + "Upload photo" button */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickFile}
          className="hidden"
        />

        {/* Photo section — upload / replace / remove */}
        <Section title="Profile photo">
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-2xl
                         bg-gradient-to-br from-rose-500/15 to-orange-500/15 border border-rose-400/30
                         text-white text-sm font-bold disabled:opacity-60"
            >
              {uploading
                ? <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                : <><Upload size={15} /> {photoUrl ? 'Replace photo' : 'Upload photo'}</>}
            </motion.button>
            {photoUrl && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onRemovePhoto}
                className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-rose-200 text-sm font-bold inline-flex items-center gap-2"
              >
                <Trash2 size={15} />
                Remove
              </motion.button>
            )}
          </div>
          <div className="text-[11px] text-zinc-500 mt-2 px-1">
            {photoUrl
              ? 'Your photo overrides the emoji + color avatar below.'
              : 'No photo set — your emoji + color combo is used instead.'}
          </div>
        </Section>

        {/* Avatar picker — only used when no photo is set */}
        <Section title={photoUrl ? 'Fallback emoji' : 'Avatar'}>
          <div className="grid grid-cols-7 gap-2 px-1">
            {AVATAR_OPTIONS.map(emoji => {
              const active = emoji === avatar;
              return (
                <motion.button
                  key={emoji}
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setAvatar(emoji)}
                  className={`aspect-square rounded-2xl grid place-items-center text-2xl transition
                              ${active
                                ? 'bg-white text-zinc-900 ring-2 ring-rose-400'
                                : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                >
                  {emoji}
                </motion.button>
              );
            })}
          </div>
        </Section>

        {/* Color picker */}
        <Section title="Color">
          <div className="grid grid-cols-3 gap-2 px-1">
            {COLOR_OPTIONS.map(c => {
              const active = c.value === color;
              return (
                <motion.button
                  key={c.value}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setColor(c.value)}
                  className={`relative h-16 rounded-2xl overflow-hidden border transition
                              ${active ? 'border-white ring-2 ring-white/60' : 'border-white/10'}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${c.value}`} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_60%)]" />
                  <div className="relative h-full w-full flex items-end justify-center pb-1.5">
                    <span className="text-[10.5px] uppercase tracking-widest font-bold text-white/95 drop-shadow">
                      {c.label}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </Section>

        {/* Name + handle */}
        <Section title="Name">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            maxLength={30}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
          />
        </Section>

        <Section title="Handle">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3
                          focus-within:ring-2 focus-within:ring-rose-400/60 focus-within:border-rose-400/30">
            <span className="text-zinc-500 mr-1">@</span>
            <input
              value={handle}
              onChange={e => setHandle(sanitize(e.target.value))}
              placeholder="username"
              maxLength={20}
              className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
          <div className="text-[11px] text-zinc-500 mt-1.5 px-1">
            Lowercase letters, numbers, and underscores.
          </div>
        </Section>

        <Section title="Phone (optional)">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+27 82 123 4567"
            maxLength={20}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
          />
          <div className="text-[11px] text-zinc-500 mt-1.5 px-1 leading-relaxed">
            Helps friends find you on WUD when they search their contacts.
            Never shown to anyone — stored as a one-way hash for matching only.
            Clear the field to remove it.
          </div>
        </Section>

        {/* Sticky save (also avail in header) */}
        <div className="px-4 mt-6">
          <PulseButton onClick={save} disabled={!dirty}>
            {dirty ? 'Save changes' : 'No changes yet'}
          </PulseButton>
        </div>
      </div>
    </OverlayShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 px-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
        {title}
      </div>
      {children}
    </div>
  );
}
