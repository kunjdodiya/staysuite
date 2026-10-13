import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus, Users, Star } from 'lucide-react';
import { PageHeader, Button, Card, SearchInput, EmptyState, LoadMore, Avatar, Badge, Segmented, Stat } from '@/components/ui';
import { useCan, useData, useLedgers, useMoney, useToday } from '@/data/hooks';
import { openOverlay } from '@/data/ui';
import { fmtDate } from '@/lib/dates';
import { downloadCSV } from '@/lib/download';
import { toMajor } from '@/lib/money';

type Sort = 'recent' | 'spend' | 'stays' | 'name';

export default function GuestsPage() {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const ledgers = useLedgers();
  const navigate = useNavigate();
  const canEdit = useCan('guests.edit');
  const canPII = useCan('guests.pii');
  const showMoney = useCan('finance.view');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [segment, setSegment] = useState<'all' | 'repeat' | 'vip' | 'upcoming'>('all');
  const [limit, setLimit] = useState(40);

  const stats = useMemo(() => {
    const m = new Map<string, { stays: number; nights: number; spend: number; last: string | null; next: string | null; balance: number; rating: number[] }>();
    for (const g of data.guests) m.set(g.id, { stays: 0, nights: 0, spend: 0, last: null, next: null, balance: 0, rating: [] });
    for (const b of data.bookings) {
      const s = m.get(b.guestId);
      if (!s) continue;
      const l = ledgers.get(b.id)!;
      s.spend += l.paid;
      if (l.balance > 0) s.balance += l.balance;
      if (b.status === 'checked_out' || b.status === 'checked_in') { s.stays += 1; s.nights += b.nights.length; if (!s.last || b.checkIn > s.last) s.last = b.checkIn; }
      if (['confirmed', 'tentative'].includes(b.status) && b.checkIn >= today && (!s.next || b.checkIn < s.next)) s.next = b.checkIn;
      if (b.review) s.rating.push(b.review.rating);
    }
    return m;
  }, [data.guests, data.bookings, ledgers, today]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.guests
      .filter((g) => !s || `${g.firstName} ${g.lastName} ${g.email} ${g.phone} ${g.city} ${g.tags.join(' ')}`.toLowerCase().includes(s))
      .filter((g) => segment === 'all' || (segment === 'vip' ? g.vip : segment === 'repeat' ? stats.get(g.id)!.stays > 1 : !!stats.get(g.id)!.next))
      .sort((a, b) => {
        const A = stats.get(a.id)!, B = stats.get(b.id)!;
        if (sort === 'spend') return B.spend - A.spend;
        if (sort === 'stays') return B.stays - A.stays;
        if (sort === 'name') return a.firstName.localeCompare(b.firstName);
        return (B.next ?? B.last ?? '').localeCompare(A.next ?? A.last ?? '');
      });
  }, [data.guests, q, sort, segment, stats]);

  const repeat = data.guests.filter((g) => stats.get(g.id)!.stays > 1).length;
  const ratings = [...stats.values()].flatMap((s) => s.rating);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  return (
    <div>
      <PageHeader title="Guests" subtitle="Profiles, stay history and preferences"
        actions={<>
          {canPII && <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCSV(rows.map((g) => {
            const s = stats.get(g.id)!;
            return { 'First name': g.firstName, 'Last name': g.lastName, Email: g.email, Phone: g.phone, City: g.city, Country: g.country, Stays: s.stays, Nights: s.nights, ...(showMoney ? { 'Total paid': toMajor(s.spend, data.business.currency) } : {}), 'Last stay': s.last ?? '', Tags: g.tags.join('; '), 'Marketing consent': g.marketingConsent ? 'Yes' : 'No' };
          }), `guests-${today}.csv`)}>Export</Button>}
          {canEdit && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'guest', onCreated: (id) => navigate(`/guests/${id}`) })}>New guest</Button>}
        </>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <Stat label="Guests" value={String(data.guests.length)} />
        <Stat label="Repeat guests" value={String(repeat)} sub={data.guests.length ? `${Math.round((repeat / data.guests.length) * 100)}% come back` : undefined} />
        <Stat label="Average rating" value={<span className="flex items-center gap-1.5">{avg ? avg.toFixed(1) : '—'}<Star className="h-5 w-5 fill-s4 text-s4" /></span>} sub={`${ratings.length} reviews`} />
        <Stat label="Arriving soon" value={String([...stats.values()].filter((s) => s.next).length)} sub="with upcoming stays" />
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          <SearchInput className="flex-1 min-w-[200px]" value={q} onChange={setQ} placeholder="Name, phone, email, city, tag…" />
          <Segmented size="sm" value={segment} onChange={setSegment} options={[{ value: 'all', label: 'All' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'repeat', label: 'Repeat' }, { value: 'vip', label: 'VIP' }]} />
          <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recent' }, ...(showMoney ? [{ value: 'spend' as Sort, label: 'Top spend' }] : []), { value: 'stays', label: 'Most stays' }, { value: 'name', label: 'A–Z' }]} />
        </div>
        {rows.length === 0 ? <EmptyState icon={<Users className="h-5 w-5" />} title={data.guests.length ? 'No guests match' : 'No guests yet'} body="Guests are added when you create bookings, or add them here." /> : (
          <div className="divide-y divide-border border-t border-border">
            {rows.slice(0, limit).map((g) => {
              const s = stats.get(g.id)!;
              return (
                <button key={g.id} onClick={() => navigate(`/guests/${g.id}`)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-surface-2/40">
                  <Avatar name={`${g.firstName} ${g.lastName}`} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-medium truncate">{g.firstName} {g.lastName}{g.vip && <Badge tone="accent">VIP</Badge>}{g.tags.filter((t) => t !== 'VIP').slice(0, 2).map((t) => <Badge key={t} className="hidden sm:inline-flex">{t}</Badge>)}</div>
                    <div className="text-[12px] text-muted truncate">{canPII ? [g.phone, g.city].filter(Boolean).join(' · ') : g.city || g.country}</div>
                  </div>
                  <div className="hidden md:block text-right w-28"><div className="text-[13px] num">{s.stays} stay{s.stays !== 1 && 's'}</div><div className="text-[11.5px] text-subtle">{s.nights} nights</div></div>
                  {showMoney && <div className="hidden sm:block text-right w-28"><div className="text-[13px] num font-medium">{money(s.spend)}</div>{s.balance > 0 ? <div className="text-[11.5px] text-warning num">{money(s.balance)} due</div> : <div className="text-[11.5px] text-subtle">paid</div>}</div>}
                  <div className="text-right w-24 text-[12px]">{s.next ? <Badge tone="info">{fmtDate(s.next, 'd MMM')}</Badge> : <span className="text-subtle">{s.last ? fmtDate(s.last, 'MMM yyyy') : 'No stays'}</span>}</div>
                </button>
              );
            })}
          </div>
        )}
        <LoadMore shown={Math.min(limit, rows.length)} total={rows.length} onMore={() => setLimit((n) => n + 40)} />
      </Card>
    </div>
  );
}
