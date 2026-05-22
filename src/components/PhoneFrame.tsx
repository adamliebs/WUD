import { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/**
 * iPhone-style frame so the browser preview reads as a mobile app.
 * On small screens the frame disappears and the app fills the viewport.
 */
export function PhoneFrame({ children }: Props) {
  return (
    <div className="stage-bg min-h-screen w-full flex items-center justify-center sm:p-8">
      {/* Decorative branding off-frame on big screens */}
      <div className="hidden lg:flex flex-col gap-2 mr-12 select-none">
        <div className="text-[120px] font-black tracking-tight leading-none text-grad">
          WUD
        </div>
        <div className="text-zinc-400 text-lg max-w-xs">
          What U doing? — see what your friends are up to and jump in.
        </div>
      </div>

      {/* Phone shell */}
      <div className="relative w-full sm:w-[390px] h-[100dvh] sm:h-[844px] sm:rounded-[55px] overflow-hidden
                      sm:border-[10px] border-zinc-800 sm:shadow-[0_60px_120px_-30px_rgba(0,0,0,0.7)]
                      bg-black">
        {/* Notch (only on framed view) */}
        <div className="hidden sm:block absolute top-2 left-1/2 -translate-x-1/2 z-50
                        h-[28px] w-[110px] rounded-full bg-black" />
        {/* Simulated status bar — desktop mockup frame only. On real phones the
            OS (native) or browser draws the status bar. */}
        <div className="absolute top-0 left-0 right-0 h-11 z-40 hidden sm:flex items-end justify-between px-7 pb-1 text-[13px] font-semibold text-white pointer-events-none">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-2.5 rounded-[2px] border border-white/80 relative">
              <span className="absolute inset-[2px] bg-white rounded-[1px]" />
              <span className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-[6px] bg-white/80 rounded-r" />
            </span>
          </span>
        </div>

        {/* Screen content — `phone-screen` carries the --status-inset variable. */}
        <div className="phone-screen relative h-full w-full">
          {children}
        </div>

        {/* Home indicator */}
        <div className="hidden sm:block absolute bottom-1.5 left-1/2 -translate-x-1/2 z-50
                        h-[5px] w-[120px] rounded-full bg-white/70" />
      </div>
    </div>
  );
}
