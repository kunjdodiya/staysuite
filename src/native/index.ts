/**
 * Native (iOS / Android) integration. Everything here is a no-op on the web, so the same
 * build runs as a PWA and inside the Capacitor shells.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useStore } from '@/data/store';
import { useUI } from '@/data/ui';
import { syncReminders } from './reminders';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/** Match status bar icons to the current theme (light icons on dark UI and vice versa). */
export function applyStatusBar() {
  if (!isNative) return;
  const dark = document.documentElement.classList.contains('dark');
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

export function haptic(style: 'light' | 'medium' = 'light') {
  if (!isNative) return;
  Haptics.impact({ style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }).catch(() => {});
}

let started = false;
export function initNative() {
  if (!isNative || started) return;
  started = true;
  document.documentElement.classList.add(`native-${platform}`);

  applyStatusBar();
  new MutationObserver(applyStatusBar).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // Android hardware back: close the top drawer first, then go back, then leave the app.
  App.addListener('backButton', ({ canGoBack }) => {
    const ui = useUI.getState();
    if (ui.stack.length) ui.close();
    else if (canGoBack && location.pathname !== '/') history.back();
    else App.exitApp();
  });

  // Light haptic tick whenever something meaningful is saved (activity log grows).
  useStore.subscribe((s, prev) => {
    if (s.hydrated && prev.hydrated && s.data.activity.length > prev.data.activity.length && s.data.activity[0]?.id !== prev.data.activity[0]?.id) haptic();
  });

  // Keep scheduled reminders in step with bookings, tasks and bills.
  let t: ReturnType<typeof setTimeout> | undefined;
  const resync = () => { clearTimeout(t); t = setTimeout(() => syncReminders(useStore.getState().data), 1500); };
  useStore.subscribe((s, prev) => { if (s.hydrated && s.data !== prev.data) resync(); });
  App.addListener('appStateChange', ({ isActive }) => { if (isActive) resync(); });
  resync();
}

export function hideSplash() {
  if (isNative) SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
}
