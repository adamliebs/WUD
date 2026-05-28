import { mediaUrl } from '../api/client';
import type { User } from '../types';

interface Props {
  user: Pick<User, 'avatar' | 'color' | 'name'> & { photoUrl?: string };
  size?: number; // px
  ring?: boolean;
}

export function Avatar({ user, size = 40, ring }: Props) {
  const ringCls = ring ? 'ring-2 ring-white/80' : '';

  if (user.photoUrl) {
    return (
      <img
        src={mediaUrl(user.photoUrl)}
        alt={user.name}
        className={`rounded-full object-cover ${ringCls}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className={`relative rounded-full grid place-items-center bg-gradient-to-br ${user.color} ${ringCls}`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      title={user.name}
    >
      <span className="leading-none select-none">{user.avatar}</span>
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
