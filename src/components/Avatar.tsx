import { mediaUrl } from '../api/client';
import { isLive } from '../store';
import type { LiveStatus, User } from '../types';

interface Props {
  user: Pick<User, 'avatar' | 'color' | 'name'> & { photoUrl?: string; liveStatus?: LiveStatus };
  size?: number; // px
  ring?: boolean;
  /** Show a pulsing live ring if the user is live. Default true. */
  liveRing?: boolean;
}

export function Avatar({ user, size = 40, ring, liveRing = true }: Props) {
  const ringCls = ring ? 'ring-2 ring-white/80' : '';
  const showLive = liveRing && isLive(user);

  const inner = user.photoUrl ? (
    <img
      src={mediaUrl(user.photoUrl)}
      alt={user.name}
      className={`rounded-full object-cover ${ringCls}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  ) : (
    <div
      className={`relative rounded-full grid place-items-center bg-gradient-to-br ${user.color} ${ringCls}`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      title={user.name}
    >
      <span className="leading-none select-none">{user.avatar}</span>
    </div>
  );

  if (!showLive) return inner;

  // Wrap with a static glowey gradient ring (no animation). Padding scales with
  // avatar size so the ring sits a couple of pixels off the edge of the avatar.
  const pad = Math.max(2, Math.round(size * 0.06));
  return (
    <div className="relative inline-block">
      <div
        className="rounded-full bg-gradient-to-br from-rose-500 to-orange-500
                   shadow-[0_0_14px_-2px_rgba(244,63,94,0.6)]"
        style={{ padding: pad }}
      >
        <div className="rounded-full ring-2 ring-[#07060b]">
          {inner}
        </div>
      </div>
    </div>
  );
}

interface StackProps {
  users: (Pick<User, 'avatar' | 'color' | 'name' | 'id'> & { photoUrl?: string })[];
  size?: number;
  max?: number;
}

export function AvatarStack({ users, size = 28, max = 4 }: StackProps) {
  const shown = users.slice(0, max);
  const rest = Math.max(0, users.length - shown.length);
  return (
    <div className="flex items-center">
      {shown.map((u, i) => (
        <div
          key={u.id}
          style={{ marginLeft: i === 0 ? 0 : -size * 0.35, zIndex: 20 - i }}
        >
          <Avatar user={u} size={size} ring />
        </div>
      ))}
      {rest > 0 && (
        <div
          style={{ marginLeft: -size * 0.35, width: size, height: size, fontSize: size * 0.36 }}
          className="rounded-full bg-zinc-800 ring-2 ring-white/80 grid place-items-center text-white/90 font-bold"
        >
          +{rest}
        </div>
      )}
    </div>
  );
}
