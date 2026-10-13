import type { IssuedDocument } from '@/domain/types';
import { methodLabel, purposeLabel } from '@/domain/labels';
import { fmtDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { docTitle } from './pdf';

/** On-screen rendering of a document. Always white "paper", regardless of theme. */
export function DocumentPreview({ doc }: { doc: IssuedDocument }) {
  const s = doc.snapshot;
  const money = (v: number) => formatMoney(v, { currency: s.currency, locale: s.locale }, { cents: true });
  const brand = s.business.brandColor || '#0f766e';
  const isReceipt = !!s.payment && doc.kind !== 'invoice';
  return (
    <div className="relative bg-white text-[#141816] rounded-2xl shadow-pop overflow-hidden text-[12px] leading-relaxed" style={{ colorScheme: 'light' }}>
      <div className="h-1.5" style={{ background: brand }} />
      {doc.void && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="text-[90px] font-bold text-red-600/15 rotate-[-25deg]">VOID</span></div>}
      <div className="p-6 sm:p-9">
        <div className="flex flex-wrap justify-between gap-6">
          <div className="flex gap-3 min-w-0">
            {s.business.logoDataUrl
              ? <img src={s.business.logoDataUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
              : <div className="h-11 w-11 rounded-lg grid place-items-center text-white text-lg font-bold" style={{ background: brand }}>{s.business.name.slice(0, 1)}</div>}
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{s.business.name}</div>
              <div className="text-[11px] text-[#6e7470] max-w-[260px]">
                {s.business.legalName && s.business.legalName !== s.business.name && <div>{s.business.legalName}</div>}
                <div>{s.business.address}</div>
                <div>{[s.business.phone, s.business.email].filter(Boolean).join(' · ')}</div>
                {s.business.taxRegistrationNo && <div>{s.business.taxLabel} No: {s.business.taxRegistrationNo}</div>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-bold tracking-tight uppercase" style={{ color: brand }}>{docTitle(doc)}</div>
            <div className="mt-1 grid grid-cols-[auto_auto] gap-x-4 text-[11.5px] justify-end">
              <span className="text-[#6e7470]">No.</span><span className="font-medium">{doc.number}</span>
              <span className="text-[#6e7470]">Date</span><span>{fmtDate(doc.issueDate)}</span>
              {doc.dueDate && doc.kind === 'invoice' && s.balanceDue > 0 && <><span className="text-[#6e7470]">Due</span><span>{fmtDate(doc.dueDate)}</span></>}
              {s.stay && <><span className="text-[#6e7470]">Booking</span><span>{s.stay.bookingCode}</span></>}
            </div>
          </div>
        </div>

        <div className="my-6 h-px bg-[#e4e4de]" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-[#6e7470]">{doc.kind === 'expense_voucher' ? 'PAID TO' : 'BILLED TO'}</div>
            <div className="mt-1 text-[13px] font-semibold">{s.billTo.name}</div>
            <div className="text-[11.5px] text-[#6e7470]">{[s.billTo.phone, s.billTo.email, s.billTo.address].filter(Boolean).map((l) => <div key={l}>{l}</div>)}</div>
          </div>
          {s.property && (
            <div>
              <div className="text-[10px] font-bold tracking-wider text-[#6e7470]">{s.stay ? 'STAY' : 'PROPERTY'}</div>
              <div className="mt-1 text-[13px] font-semibold">{s.property.name}{s.stay?.unit ? ` — ${s.stay.unit}` : ''}</div>
              {s.stay && <div className="text-[11.5px] text-[#6e7470]">{fmtDate(s.stay.checkIn, 'EEE d MMM yyyy')} → {fmtDate(s.stay.checkOut, 'EEE d MMM yyyy')}<br />{s.stay.nights} night{s.stay.nights > 1 ? 's' : ''} · {s.stay.guests} guest{s.stay.guests > 1 ? 's' : ''}</div>}
            </div>
          )}
        </div>

        {s.payment && (
          <div className="mt-6 rounded-xl p-4 flex flex-wrap items-end justify-between gap-3" style={{ background: `${brand}12` }}>
            <div>
              <div className="text-[10px] font-bold tracking-wider text-[#6e7470]">{doc.kind === 'refund_receipt' ? 'AMOUNT REFUNDED' : doc.kind === 'expense_voucher' ? 'AMOUNT PAID' : 'AMOUNT RECEIVED'}</div>
              <div className="text-[24px] font-semibold tabular-nums">{money(s.payment.amount)}</div>
            </div>
            <div className="text-[11.5px] text-[#6e7470] text-right">
              {methodLabel[s.payment.method]} · {fmtDate(s.payment.date)}{s.payment.purpose ? ` · ${purposeLabel[s.payment.purpose]}` : ''}
              {s.payment.reference && <div>Ref {s.payment.reference}</div>}
            </div>
          </div>
        )}

        <table className="mt-6 w-full">
          <thead>
            <tr className="text-[10px] font-bold tracking-wider text-[#6e7470] bg-[#f7f7f4]">
              <th className="text-left py-2 px-2 rounded-l-md">DESCRIPTION</th>
              <th className="py-2 px-2 w-12">QTY</th>
              <th className="text-right py-2 px-2 hidden sm:table-cell">RATE</th>
              <th className="text-right py-2 px-2 rounded-r-md">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i} className="border-b border-[#eeeee9]">
                <td className="py-2.5 px-2">{l.label}{l.detail && <div className="text-[11px] text-[#6e7470]">{l.detail}</div>}</td>
                <td className="py-2.5 px-2 text-center tabular-nums">{l.qty}</td>
                <td className="py-2.5 px-2 text-right tabular-nums hidden sm:table-cell">{money(l.unit)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-[280px] space-y-1.5 tabular-nums">
          {!isReceipt ? (
            <>
              <TRow l="Subtotal" v={money(s.subtotal)} />
              {s.discount > 0 && <TRow l="Discount" v={`− ${money(s.discount)}`} />}
              {s.taxAmount > 0 && <TRow l={`${s.taxLabel} @ ${s.taxRate}%`} v={money(s.taxAmount)} />}
              <div className="h-px bg-[#e4e4de] my-2" />
              <TRow l="Total" v={money(s.total)} strong />
              {s.paidToDate !== 0 && <TRow l="Paid to date" v={money(s.paidToDate)} color="#16803d" />}
              <TRow l="Balance due" v={money(s.balanceDue)} strong color={s.balanceDue > 0 ? '#c82d2d' : undefined} />
            </>
          ) : s.stay ? (
            <>
              <TRow l="Booking total" v={money(s.total)} />
              <TRow l="Paid to date" v={money(s.paidToDate)} color="#16803d" />
              <TRow l="Balance remaining" v={money(s.balanceDue)} strong color={s.balanceDue > 0 ? '#c82d2d' : undefined} />
            </>
          ) : null}
        </div>

        {(s.notes || (s.business.paymentInstructions && s.balanceDue > 0)) && (
          <div className="mt-6 space-y-3 max-w-md">
            {s.notes && <div><div className="text-[10px] font-bold tracking-wider text-[#6e7470]">NOTES</div><div className="whitespace-pre-line">{s.notes}</div></div>}
            {s.business.paymentInstructions && s.balanceDue > 0 && <div><div className="text-[10px] font-bold tracking-wider text-[#6e7470]">HOW TO PAY</div><div>{s.business.paymentInstructions}</div></div>}
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-[#e4e4de] flex flex-wrap justify-between gap-2 text-[11px] text-[#6e7470]">
          <span>{s.business.documentFooter}</span>
          <span>{s.business.website}</span>
        </div>
      </div>
    </div>
  );
}

function TRow({ l, v, strong, color }: { l: string; v: string; strong?: boolean; color?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#6e7470]">{l}</span>
      <span className={strong ? 'font-semibold text-[13.5px]' : ''} style={color ? { color } : undefined}>{v}</span>
    </div>
  );
}
