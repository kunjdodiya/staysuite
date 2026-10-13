import { lazy, Suspense, useEffect, Component, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useStore } from './data/store';
import { AppShell } from './components/layout/AppShell';
import { ConfirmProvider } from './components/ui/overlay';
import { Overlays } from './features/overlays/Overlays';
import { Skeleton, Button } from './components/ui';
import { useCan } from './data/hooks';
import type { Capability } from './domain/permissions';
import { EmptyState } from './components/ui';
import { Lock } from 'lucide-react';
import { hideSplash } from './native';

const Dashboard = lazy(() => import('./features/dashboard/DashboardPage'));
const Bookings = lazy(() => import('./features/bookings/BookingsPage'));
const BookingDetail = lazy(() => import('./features/bookings/BookingDetailPage'));
const Properties = lazy(() => import('./features/properties/PropertiesPage'));
const PropertyDetail = lazy(() => import('./features/properties/PropertyDetailPage'));
const Guests = lazy(() => import('./features/guests/GuestsPage'));
const GuestDetail = lazy(() => import('./features/guests/GuestDetailPage'));
const Finances = lazy(() => import('./features/finance/FinancePage'));
const Documents = lazy(() => import('./features/documents/DocumentsPage'));
const Tasks = lazy(() => import('./features/tasks/TasksPage'));
const Reports = lazy(() => import('./features/reports/ReportsPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-72" />
    </div>
  );
}

function Guard({ cap, children }: { cap: Capability; children: ReactNode }) {
  const allowed = useCan(cap);
  if (!allowed) return <EmptyState icon={<Lock className="h-5 w-5" />} title="You don't have access to this section" body="Ask the property owner to update your role if you need it." />;
  return <>{children}</>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (this.state.error) return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <EmptyState title="Something went wrong" body={<>Your data is safe on this device. <span className="block mt-1 text-xs text-subtle">{this.state.error.message}</span></>}
          action={<Button variant="primary" onClick={() => { this.setState({ error: null }); location.reload(); }}>Reload</Button>} />
      </div>
    );
    return this.props.children;
  }
}

function Boot() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="h-12 w-12 rounded-2xl bg-accent grid place-items-center text-accent-fg animate-pulse">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M3 12 12 4l9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
        </div>
        <p className="text-sm text-muted">Loading your workspace…</p>
      </div>
    </div>
  );
}

export function App() {
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { if (hydrated) hideSplash(); }, [hydrated]);
  if (!hydrated) return <Boot />;
  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <ConfirmProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
              <Route path="bookings" element={<Suspense fallback={<PageFallback />}><Guard cap="bookings.view"><Bookings /></Guard></Suspense>} />
              <Route path="bookings/:id" element={<Suspense fallback={<PageFallback />}><Guard cap="bookings.view"><BookingDetail /></Guard></Suspense>} />
              <Route path="properties" element={<Suspense fallback={<PageFallback />}><Guard cap="properties.view"><Properties /></Guard></Suspense>} />
              <Route path="properties/:id" element={<Suspense fallback={<PageFallback />}><Guard cap="properties.view"><PropertyDetail /></Guard></Suspense>} />
              <Route path="guests" element={<Suspense fallback={<PageFallback />}><Guard cap="guests.view"><Guests /></Guard></Suspense>} />
              <Route path="guests/:id" element={<Suspense fallback={<PageFallback />}><Guard cap="guests.view"><GuestDetail /></Guard></Suspense>} />
              <Route path="finances" element={<Suspense fallback={<PageFallback />}><Guard cap="finance.view"><Finances /></Guard></Suspense>} />
              <Route path="documents" element={<Suspense fallback={<PageFallback />}><Guard cap="documents.view"><Documents /></Guard></Suspense>} />
              <Route path="tasks" element={<Suspense fallback={<PageFallback />}><Guard cap="tasks.view"><Tasks /></Guard></Suspense>} />
              <Route path="reports" element={<Suspense fallback={<PageFallback />}><Guard cap="reports.view"><Reports /></Guard></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <Overlays />
          <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
        </ConfirmProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
