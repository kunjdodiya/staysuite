import { useEffect, useState } from 'react';
export type ThemePref = 'light' | 'dark' | 'system';

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0e0d' : '#f7f7f5');
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => {
    try { return (localStorage.getItem('ss-theme') as ThemePref) || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    apply(pref);
    try { localStorage.setItem('ss-theme', pref); } catch { /* ignore */ }
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const h = () => apply('system');
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [pref]);
  return [pref, setPref] as const;
}
