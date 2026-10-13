# StaySuite

**Live:** https://kunjdodiya.github.io/staysuite/ — redeployed automatically on every push to `main` (`.github/workflows/deploy.yml`).

Property management for cabins, homestays, guesthouses, boutique hotels and short-term rentals: bookings, guests, money, receipts, housekeeping and reports in one app. One React codebase runs as a web app/PWA and, through Capacitor, as native iOS and Android apps.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # financial engine tests (vitest)
npm run build        # type-check + production build (PWA with offline support)
```

The first launch loads a realistic demo workspace: 3 properties, 8 units, about 7 months of bookings, payments and expenses, plus staff and tasks. **Settings → Data & backups** lets you reload the demo or start fresh.

### Mobile apps (iOS & Android)

Native shells are built with Capacitor 8 from the same web build. Inside the apps:
- **Files:** PDF receipts, invoices and report exports open the native share sheet (Save to Files, WhatsApp, Mail, Print).
- **Notifications:** on-device reminders, an 8 am briefing on busy days and alerts before bills fall due, delivered even when the app is closed.
- **Native feel:** status bar matched to the theme, branded icon and splash screen, haptics, and the Android back button closes drawers before navigating back.

```bash
npm run android:apk   # build → sync → debug APK (installs on any Android phone)
npm run cap:android   # open in Android Studio
npm run cap:ios       # open in Xcode → pick your Team under Signing → Run on iPhone
npm run assets        # regenerate icons & splash from scripts/make-app-assets.mjs
```

- **Android:** needs Android Studio (its bundled JDK 21 and SDK 36). The APK lands in `$STAYSUITE_BUILD_DIR/app/outputs/apk/debug/`. On external drives, set `STAYSUITE_BUILD_DIR` (the npm script defaults it to `~/Library/Caches/staysuite-android`): macOS writes `._*` files on exFAT volumes, and these break Android resource merging. For Play Store release, create an upload keystore and run `./gradlew bundleRelease`.
- **iOS:** needs Xcode 26+ (iOS 15+ target). Dependencies come through Swift Package Manager, so there's no CocoaPods step. A real-device or App Store build needs an Apple Developer team selected in Xcode → App target → Signing & Capabilities.

## Architecture

```
src/
  domain/        Pure business logic, no React
    types.ts         Data model. Money is integer minor units (paise/cents) everywhere
    pricing.ts       Nightly rates (base → weekend → rate rules), booking totals & tax
    availability.ts  Double-booking detection
    finance.ts       Revenue recognition, cash, deposits, outstanding, occupancy/ADR/RevPAR
    documents.ts     Invoice/receipt snapshots + sequential numbering
    permissions.ts   Role → capability matrix, per-property access
    alerts.ts        Notification feed derived from data
    automation.ts    Auto-created turnover cleaning tasks
  data/
    store.ts         Zustand store: every mutation validates, logs activity, queues a sync change
    persistence.ts   IndexedDB persistence + daily local snapshots (last 7 days)
    sync.ts          Outbox + SyncAdapter boundary for a cloud backend
    seed.ts          Deterministic demo data generated relative to today
  components/      Design system (ui/), charts, layout shell, domain badges
  features/        One folder per section: dashboard, bookings, properties, guests,
                   finance, documents, tasks, reports, settings, overlays (global drawers)
supabase/schema.sql  Cloud schema with row-level security mirroring the app's roles
```

**Local-first.** Every change applies instantly, persists to IndexedDB and goes into a sync outbox, so the app works fully offline. A service worker caches the app shell. To enable cloud sync, implement a `SyncAdapter` (see `src/data/sync.ts`) against `supabase/schema.sql`.

**Design system.** Colours are CSS variables (`src/styles/index.css`) with separately tuned light and dark values. Chart series colours use a colour-blind-validated categorical order. Status colours (success/warning/danger) are reserved for state.

## How the numbers are calculated

All figures come from recorded bookings and transactions (`src/domain/finance.ts`, covered by `src/domain/finance.test.ts`):

| Figure | Definition |
|---|---|
| **Revenue** | Booking value net of tax, recognised **per night stayed** in the period (a stay spanning two months is split), plus retained cancellation fees and other income |
| **Cash received** | Guest payments + other income dated in the period, minus refunds |
| **Deposits** | Refundable security deposits. A liability, never revenue |
| **Tax collected** | Shown separately; not revenue |
| **Net profit** | Revenue − expenses |
| **Net cash flow** | Cash received − expenses paid |
| **Guest balances** | *Due now* once the guest has arrived, *overdue* once the stay has ended unpaid, *upcoming* for future stays |

Guard rails: amounts must be positive and have at most 2 decimals; refunds can't exceed what was paid; deposits can't be returned beyond what's held; bookings with payments can't be deleted (cancel them instead); issued documents keep an immutable snapshot and are voided rather than deleted.

## Roles

| | Owner | Manager | Accountant | Caretaker | Cleaner |
|---|---|---|---|---|---|
| Bookings | ✓ | ✓ | view | ✓ | – |
| Guest contact details | ✓ | ✓ | – | ✓ | – |
| Finances, receipts, reports | ✓ | ✓ | ✓ | – | – |
| Tasks | ✓ | ✓ | – | ✓ | own |
| Staff & data | ✓ | – | – | – | – |

Staff can be limited to specific properties. Owners can **preview the app as any team member** from the account menu.

## What's real vs. prepared

Working now: every screen, form, validation, calculation, PDF invoices and receipts, CSV/Excel/PDF report exports, iCal export per unit, WhatsApp/email sharing (via links and the native share sheet), in-app and browser push notifications, offline persistence, backups, role-based access, and native iOS/Android shells.

Prepared, but needing a backend or third-party accounts:
- **Accounts & cloud sync.** Auth, password reset and multi-device sync need the Supabase project (schema included but not yet run against a database) and a `SyncAdapter` implementation. Today, data lives on the device.
- **Channel managers.** Airbnb/Booking.com two-way sync. iCal export works; iCal import and API connections are next.
- **Payment gateway** (Razorpay/Stripe payment links) and **accounting sync** (Tally/Zoho/QuickBooks). Excel export works today.
- **Email delivery and scheduled summaries** need a server (e.g. Supabase Edge Functions).

PDFs use the standard Helvetica font, so ₹ renders as "INR". Embedding a Unicode font (e.g. Inter TTF) would allow the symbol.
