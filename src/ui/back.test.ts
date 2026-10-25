import { describe, expect, it } from 'vitest';
import { createBackController, EXIT_WINDOW_MS } from './back';

function setup() {
  let t = 0;
  const log: string[] = [];
  const c = createBackController({ exit: () => log.push('exit'), hint: () => log.push('hint'), now: () => t });
  return { c, log, tick: (ms: number) => (t += ms) };
}

describe('hardware back button', () => {
  it('closes the top sheet first, then navigates back', () => {
    const { c, log } = setup();
    let screens = 2;
    c.setNavigate(() => (screens > 0 ? (screens--, true) : false));
    const off1 = c.pushOverlay(() => log.push('sheet1'));
    c.pushOverlay(() => log.push('sheet2'));
    expect(c.press()).toBe('overlay');
    expect(log).toEqual(['sheet2']);
    off1();
    expect(c.press()).toBe('overlay'); // sheet2 still registered (its owner did not close it)
    expect(screens).toBe(2);
  });

  it('goes back through screens and never exits while not on home', () => {
    const { c, log } = setup();
    let screens = 2;
    c.setNavigate(() => (screens > 0 ? (screens--, true) : false));
    expect(c.press()).toBe('navigate');
    expect(c.press()).toBe('navigate');
    expect(log).toEqual([]);
  });

  it('exits only on a second press within the window on the home screen', () => {
    const { c, log, tick } = setup();
    c.setNavigate(() => false);
    expect(c.press()).toBe('hint');
    tick(EXIT_WINDOW_MS + 1);
    expect(c.press()).toBe('hint'); // too slow: hint again
    tick(500);
    expect(c.press()).toBe('exit');
    expect(log).toEqual(['hint', 'hint', 'exit']);
  });

  it('with no router (lock screen) it uses the double-press exit', () => {
    const { c } = setup();
    expect(c.press()).toBe('hint');
    expect(c.press()).toBe('exit');
  });
});
