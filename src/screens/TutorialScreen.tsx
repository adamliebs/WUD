import { motion, useMotionValue, animate, type PanInfo } from 'framer-motion';
import { ChevronRight, Sparkles, UserSearch, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import feedShot     from '../assets/tutorial/01-feed.png';
import filterShot   from '../assets/tutorial/02-filter.png';
import detailShot   from '../assets/tutorial/03-detail.png';
import postShot     from '../assets/tutorial/04-post.png';
import shareShot    from '../assets/tutorial/05-share.png';
import floatShot    from '../assets/tutorial/06-float.png';
import keenShot     from '../assets/tutorial/07-keen.png';

/**
 * First-run swipe-through tutorial. Sits above the signed-in app the first
 * time the user reaches it on a given device, and any time they tap
 * "Replay tutorial" in Settings.
 *
 * Layout per card:
 *   • Eyebrow + headline + body up top
 *   • The product screenshot in its natural aspect (no cropping) below
 *
 * The screenshots themselves carry their own annotations / arrows baked
 * into the PNG, so there's no overlay layer here. The final card is
 * imageless — it nudges the user to the Me tab to find friends, which is
 * the empty-state escape hatch a fresh account hits right after sign-in.
 */

interface ImageCard {
  src: string;
  eyebrow: string;
  headline: string;
  body: string;
}

const IMAGE_CARDS: ImageCard[] = [
  {
    src: feedShot,
    eyebrow: 'The Feed',
    headline: 'See what friends are up to',
    body: 'See who’s live, view your squads, browse your smart suggestions and scroll through the day’s plans.',
  },
  {
    src: filterShot,
    eyebrow: 'Browse + filter',
    headline: 'Find one, jump in',
    body: 'Filter by category, swap between Friends and Friends-of-Friends, tap to RSVP.',
  },
  {
    src: detailShot,
    eyebrow: 'Plan detail',
    headline: 'Tap a plan to open it',
    body: 'See the time, place, and who else is in. RSVP from the bottom, chat in the next tab - messages, polls and images.',
  },
  {
    src: postShot,
    eyebrow: 'Post a plan',
    headline: 'Post in seconds',
    body: 'Pick a category, say what you\'re doing, and choose now or later.',
  },
  {
    src: shareShot,
    eyebrow: 'Audience',
    headline: 'Share with the right crew',
    body: 'All friends and their friends too, a specific squad, or friends-only. Cap the party size if you need to, or make it a repeatable event.',
  },
  {
    src: floatShot,
    eyebrow: 'Floats',
    headline: 'Float a soft idea',
    body: 'Not ready to commit? Ping a few friends privately or creat an idea float and see who bites.',
  },
  {
    src: keenShot,
    eyebrow: 'Lock it in',
    headline: 'Keen → Lock it in',
    body: 'Watch the responses roll in. When enough are keen, lock the float as a real plan.',
  },
];

export function TutorialScreen() {
  const setShowTutorial = useApp(s => s.setShowTutorial);
  const setTab = useApp(s => s.setTab);
  const openOverlay = useApp(s => s.openOverlay);

  // Total cards = images + the final CTA card.
  const totalCards = IMAGE_CARDS.length + 1;

  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardWidth = useRef(0);
  const x = useMotionValue(0);

  // Measure card width once mounted so paging math works on any device.
  useEffect(() => {
    const measure = () => {
      const w = trackRef.current?.offsetWidth ?? window.innerWidth;
      cardWidth.current = w;
      x.set(-index * w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [index, x]);

  const close = () => setShowTutorial(false);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(totalCards - 1, next));
    setIndex(clamped);
    animate(x, -clamped * cardWidth.current, { type: 'spring', stiffness: 340, damping: 36 });
  };

  // Snap to nearest card after drag. Allow a quick flick to advance even on
  // a short drag — feels much more native than a strict 50% threshold.
  const onDragEnd = (_e: unknown, info: PanInfo) => {
    const w = cardWidth.current || 1;
    const ratio = info.offset.x / w;
    const flickThreshold = 0.4;
    const velocityThreshold = 380;
    let delta = 0;
    if (ratio < -flickThreshold || info.velocity.x < -velocityThreshold) delta = 1;
    else if (ratio > flickThreshold || info.velocity.x > velocityThreshold) delta = -1;
    goTo(index + delta);
  };

  const isLast = index === totalCards - 1;

  // CTA on the final card jumps to the Me tab + opens the Friends overlay
  // (which has search + contact-matching). Closes the tutorial as it goes.
  const goFindFriends = () => {
    setTab('profile');
    openOverlay('friends');
    close();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[90] bg-[#07060b] overflow-hidden"
      aria-modal="true"
      role="dialog"
      aria-label="WUD tutorial"
    >
      <TutorialBackgroundOrbs />

      {/* Skip — sits below the safe-area inset + an explicit gap so it lands
          comfortably in the body of the page, not jammed under the notch. */}
      <button
        onClick={close}
        className="absolute right-4 z-20 inline-flex items-center gap-1.5
                   px-3 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-widest
                   bg-white/8 border border-white/10 text-zinc-200 hover:bg-white/14 transition"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
        aria-label="Skip tutorial"
      >
        Skip
        <X size={12} />
      </button>

      {/* Card track */}
      <motion.div
        ref={trackRef}
        className="absolute inset-0 flex touch-pan-y"
        style={{ x }}
        drag="x"
        dragConstraints={{
          left: -(totalCards - 1) * (cardWidth.current || 0),
          right: 0,
        }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
      >
        {IMAGE_CARDS.map((card, i) => (
          <TutorialImageCard key={i} card={card} />
        ))}
        <TutorialFinalCard active={index === totalCards - 1} onCta={goFindFriends} />
      </motion.div>

      {/* Bottom UI — dots + primary action. Pinned with safe-area padding so
          it doesn't sit under the iPhone home indicator. */}
      <div className="absolute left-0 right-0 bottom-0 z-20 pb-safe">
        <div className="px-6 pb-5 pt-3 flex items-center justify-between gap-4">
          <Dots count={totalCards} active={index} onTap={goTo} />
          <button
            onClick={() => {
              if (!isLast) return goTo(index + 1);
              goFindFriends();
            }}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full
                       text-sm font-bold text-white
                       bg-gradient-to-br from-rose-500 to-orange-500
                       shadow-[0_18px_40px_-14px_rgba(244,63,94,0.6)]
                       active:scale-[0.97] transition"
          >
            {isLast ? 'Find friends' : 'Next'}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/** Image card — eyebrow + headline + body, then a full-aspect screenshot.
 *  Callouts / labels are baked into the PNG itself; this layer is purely
 *  the framing. */
function TutorialImageCard({ card }: { card: ImageCard }) {
  return (
    <div className="relative shrink-0 w-full h-full flex flex-col items-center px-5"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}>
      <Eyebrow text={card.eyebrow} />
      <h2 className="text-[24px] font-black text-center leading-[1.1] mb-1.5">
        <span className="text-grad">{card.headline}</span>
      </h2>
      <p className="text-[12.5px] text-zinc-300 text-center max-w-[320px] leading-snug">
        {card.body}
      </p>

      {/* Screenshot — wrap in a frame that matches the image's natural
          aspect (no cropping).
          - `items-start` (not center) so the image hugs the TOP of its
            available area; centering overflows upward into the body text
            on shorter viewports.
          - `mt-8` gives explicit air between body text and image top.
          - `max-h-[52vh]` keeps the image short enough to never push past
            its container on phone-sized screens (the previous 58vh did).
          - `pb-32` reserves room for the absolute action bar below. */}
      <div className="relative flex-1 w-full min-h-0 flex items-start justify-center pb-32 mt-8">
        <div className="relative rounded-[28px] overflow-hidden
                        border border-white/10
                        shadow-[0_30px_80px_-30px_rgba(244,63,94,0.45)]
                        bg-black inline-block">
          <img
            src={card.src}
            alt=""
            className="block max-h-[52vh] w-auto h-auto"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

/** Final imageless card — sits at the end of the track. Nudges the user
 *  to the Me tab to find friends, which is the realistic empty-state
 *  escape on a fresh account. */
function TutorialFinalCard({ active, onCta }: { active: boolean; onCta: () => void }) {
  return (
    <div className="relative shrink-0 w-full h-full flex flex-col items-center justify-center px-8 text-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}>
      {/* Hero — gentle floating sparkle + contact glyph. No continuous
          bounce; just a one-time entrance ripple. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 12 }}
        animate={active ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.7 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-8"
      >
        <div className="absolute inset-0 rounded-full
                        bg-gradient-to-br from-rose-500/30 to-orange-500/30 blur-2xl" />
        <div className="relative h-24 w-24 rounded-full
                        bg-gradient-to-br from-rose-500 to-orange-500
                        grid place-items-center text-white
                        ring-2 ring-white/30
                        shadow-[0_20px_60px_-15px_rgba(244,63,94,0.6)]">
          <UserSearch size={38} strokeWidth={2.2} />
        </div>
        <span className="absolute -top-1 -right-1 text-amber-200">
          <Sparkles size={18} />
        </span>
      </motion.div>

      <Eyebrow text="You're set up" />
      <h2 className="text-[28px] font-black leading-[1.05] mb-3">
        <span className="text-grad">Find your crew</span>
      </h2>
      <p className="text-sm text-zinc-300 max-w-[320px] leading-snug mb-2">
        Head over to the <strong className="text-white">Me</strong> tab and tap{' '}
        <strong className="text-white">Friends</strong> to search by name,
        handle, or sync your contacts. Once you've got friends, the feed
        comes alive.
      </p>
      <button
        onClick={onCta}
        className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full
                   text-sm font-bold text-white
                   bg-white/8 border border-white/15
                   hover:bg-white/14 transition"
      >
        Take me there
      </button>

      {/* Reserve bottom space so the absolute action bar doesn't overlap
          the CTA above. Matches the image card's pb-32 reservation. */}
      <div className="h-32" />
    </div>
  );
}

/** Small uppercase eyebrow tag with the brand dot — reused on every card so
 *  the header reads consistently while swiping. */
function Eyebrow({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 mb-2">
      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-rose-500 to-orange-500" />
      <span className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-zinc-400">
        {text}
      </span>
    </div>
  );
}

function Dots({ count, active, onTap }: { count: number; active: number; onTap: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => {
        const isActive = i === active;
        return (
          <button
            key={i}
            onClick={() => onTap(i)}
            aria-label={`Go to step ${i + 1}`}
            className={`h-1.5 rounded-full transition-all
                        ${isActive
                          ? 'w-6 bg-gradient-to-r from-rose-500 to-orange-500'
                          : 'w-1.5 bg-white/25 hover:bg-white/40'}`}
          />
        );
      })}
    </div>
  );
}

function TutorialBackgroundOrbs() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-rose-500/14 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute top-1/3 -right-16 h-80 w-80 rounded-full bg-orange-500/12 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
      />
      <motion.div
        className="absolute bottom-16 left-1/3 h-64 w-64 rounded-full bg-amber-400/8 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
      />
    </div>
  );
}
