import { useEffect, useRef } from 'react';

/**
 * Android hardware back button.
 * Order: close the top open sheet → go back one screen → on the home screen, exit only after
 * a second press within EXIT_WINDOW_MS (the first press shows a hint).
 */
export const EXIT_WINDOW_MS = 2000;

type Handler = () => void;

export function createBackController(opts: { exit: () => void; hint: () => void; now: () => number }) {
  const overlays: Handler[] = [];
  let navigate: (() => boolean) | null = null;
  let lastPress = -Infinity;
  return {
    /** Register an open sheet/dialog. Returns the unregister function. */
    pushOverlay(fn: Handler) {
      overlays.push(fn);
      return () => {
        const i = overlays.lastIndexOf(fn);
        if (i >= 0) overlays.splice(i, 1);
      };
    },
    /** The router's "go back" — returns false when already on the home screen. */
    setNavigate(fn: (() => boolean) | null) {
      navigate = fn;
    },
    press(): 'overlay' | 'navigate' | 'hint' | 'exit' {
      const top = overlays[overlays.length - 1];
      if (top) {
        top();
        return 'overlay';
      }
      if (navigate?.()) return 'navigate';
      const t = opts.now();
      if (t - lastPress <= EXIT_WINDOW_MS) {
        opts.exit();
        return 'exit';
      }
      lastPress = t;
      opts.hint();
      return 'hint';
    },
  };
}

type Controller = ReturnType<typeof createBackController>;
let controller: Controller | null = null;

/** Called once at app start on the phone (Capacitor). */
export function installBackButton(c: Controller) {
  controller = c;
}

/** While `active`, the hardware back button calls `onBack` (e.g. closes a sheet). */
export function useBackOverlay(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active || !controller) return;
    return controller.pushOverlay(() => ref.current());
  }, [active]);
}

/** The router registers how to go back one screen. */
export function useBackNavigate(fn: () => boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!controller) return;
    const c = controller;
    c.setNavigate(() => ref.current());
    return () => c.setNavigate(null);
  }, []);
}
