import { fmtDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { BusinessSettings, Booking, Guest, Property, Unit } from './types';

export const TEMPLATE_VARS = [
  'guest_first_name', 'guest_name', 'property_name', 'unit_name', 'check_in', 'check_out', 'check_in_time', 'check_out_time',
  'nights', 'booking_code', 'balance_due', 'total', 'check_in_instructions', 'house_rules', 'wifi_name', 'wifi_password', 'business_name', 'business_phone',
] as const;

export function renderTemplate(
  body: string,
  ctx: { guest?: Guest; booking?: Booking; property?: Property; unit?: Unit; business: BusinessSettings; balance?: number; total?: number },
) {
  const { guest, booking, property, unit, business } = ctx;
  const money = (v?: number) => (v == null ? '' : formatMoney(v, business));
  const map: Record<string, string> = {
    guest_first_name: guest?.firstName ?? '',
    guest_name: guest ? `${guest.firstName} ${guest.lastName}`.trim() : '',
    property_name: property?.name ?? '',
    unit_name: unit?.name ?? '',
    check_in: booking ? fmtDate(booking.checkIn, 'EEE, d MMM') : '',
    check_out: booking ? fmtDate(booking.checkOut, 'EEE, d MMM') : '',
    check_in_time: property?.checkInTime ?? '',
    check_out_time: property?.checkOutTime ?? '',
    nights: booking ? String(booking.nights.length) : '',
    booking_code: booking?.code ?? '',
    balance_due: money(ctx.balance),
    total: money(ctx.total),
    check_in_instructions: property?.checkInInstructions ?? '',
    house_rules: property?.houseRules ?? '',
    wifi_name: property?.wifiName ?? '',
    wifi_password: property?.wifiPassword ?? '',
    business_name: business.name,
    business_phone: business.phone,
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => map[k] ?? '');
}

export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
export function mailtoLink(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
