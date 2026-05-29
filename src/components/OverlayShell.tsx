import { ChevronLeft } from 'lucide-react';
import { type ReactNode } from 'react';
import { SwipeBackPage } from './SwipeBackPage';

interface Props {
  title: string;
  onClose: () => void;
  /** Trailing action in the header (e.g. a "Save" button). */
  trailing?: ReactNode;
  children: ReactNode;
}

/**
 * Full-screen push overlay — used for Settings, Edit Profile, Friends, etc.
 * Slides in from the right with a back chevron + title in the header, and
 * supports an anywhere-on-screen drag-right gesture to dismiss (the page
 * follows the finger, revealing the underlying tab page behind it).
 */
export function OverlayShell({ title, onClose, trailing, children }: Props) {
  return (
    <SwipeBackPage
      onBack={onClose}
      className="absolute inset-0 z-40 bg-[#07060b] flex flex-col"
    >
      {/* Header */}
      <div className="pt-status px-3 pb-3 flex items-center justify-between border-b border-white/5">
        <button
          onClick={onClose}
          className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-white hover:bg-white/5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-base font-bold text-white">{title}</div>
        <div className="min-w-[36px] flex justify-end">{trailing}</div>
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </SwipeBackPage>
  );
}
