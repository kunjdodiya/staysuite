// Renders the source artwork for app icons & splash screens into ./assets,
// then `npx capacitor-assets generate` produces every iOS/Android size.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });

// House mark on a 100x100 grid: roof, body, arched door, and a small pine.
const mark = (fill) => `
  <path d="M50 14 L88 46 a4 4 0 0 1 -2.6 7 H80 V82 a4 4 0 0 1 -4 4 H24 a4 4 0 0 1 -4 -4 V53 H14.6 a4 4 0 0 1 -2.6 -7 Z" fill="${fill}"/>
  <path d="M42 86 V68 a8 8 0 0 1 16 0 V86 Z" fill="#0f766e"/>
  <path d="M68 34 l7 10 h-4 l6 9 h-5 l6 9 h-20 l6 -9 h-5 l6 -9 h-4 Z" fill="#0f766e" opacity=".9"/>`;

const bg = (w, h) => `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14b8a6"/><stop offset=".55" stop-color="#0f766e"/><stop offset="1" stop-color="#0b4f4a"/>
    </linearGradient>
    <radialGradient id="glow" cx=".3" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#glow)"/>`;

const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

// Full-bleed icon (iOS masks the corners itself): mark fills ~58% of the canvas
await sharp(svg(1024, 1024, `${bg(1024, 1024)}<g transform="translate(182 168) scale(6.6)">${mark('#ffffff')}</g>`)).png().toFile('assets/icon-only.png');
// Android adaptive icon: foreground within the 66% safe zone, transparent elsewhere
await sharp(svg(1024, 1024, `<g transform="translate(232 220) scale(5.6)">${mark('#ffffff')}</g>`)).png().toFile('assets/icon-foreground.png');
await sharp(svg(1024, 1024, bg(1024, 1024))).png().toFile('assets/icon-background.png');

// Splash: brand gradient, mark and wordmark centred
const splash = (dark) => svg(2732, 2732, `
  ${dark ? '<rect width="2732" height="2732" fill="#0c0e0d"/>' : bg(2732, 2732)}
  <g transform="translate(1166 1046) scale(4)">${dark ? '<rect x="2" y="2" width="96" height="96" rx="24" fill="#0f766e"/><g transform="translate(15 13) scale(.7)">' + mark('#ffffff') + '</g>' : mark('#ffffff')}</g>
  <text x="1366" y="1560" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial" font-size="120" font-weight="600" letter-spacing="2" fill="${dark ? '#eef0ee' : '#ffffff'}">StaySuite</text>`);
await sharp(splash(false)).png().toFile('assets/splash.png');
await sharp(splash(true)).png().toFile('assets/splash-dark.png');
console.log('assets rendered');
