import { SalesSyncAlert, SalesSyncLogEntry } from '../../box-office.service';

/** Plain labels for what a log entry was (Sales system panel + Sales Sync Report). */
const KIND_LABEL: Record<string, string> = {
  'booking.paid': 'New booking',
  'booking.updated': 'Booking changed',
  'booking.cancelled': 'Booking cancelled',
  pull: 'Pull',
  check: 'Check all bookings',
  fetch: 'Fetch one booking'
};

export function syncKindLabel(l: Pick<SalesSyncLogEntry, 'via' | 'kind'>): string {
  return KIND_LABEL[l.kind || ''] || (l.via === 'pull' ? 'Pull' : 'Live update');
}

/** Where it came from: a live update from the sales system, or something staff ran. */
export function syncSourceLabel(l: Pick<SalesSyncLogEntry, 'via' | 'kind'>): string {
  if (l.via === 'webhook') return 'Live update';
  return l.kind === 'check' ? 'Check' : l.kind === 'fetch' ? 'Fetch' : 'Pull';
}

/** "3 new · 1 changed · 2 no change" — only the counts that are not zero. */
export function syncCountsText(c: SalesSyncLogEntry['counts']): string {
  const parts = [
    [c.created, 'new'], [c.updated, 'changed'], [c.cancelled, 'cancelled'],
    [c.skipped, 'no change'], [c.errors, 'not stored']
  ].filter(([n]) => (n as number) > 0).map(([n, l]) => `${n} ${l}`);
  return parts.length ? parts.join(' · ') : 'nothing to do';
}

/** The alert in words. Sent = how many people / phones; read is not known. */
export function syncAlertText(a: SalesSyncAlert | null | undefined): string {
  if (!a) return '';
  if (a.held) return 'Held (one alert per hour)';
  if (!a.devices) return a.users ? `No phones with alerts on (${a.users} ${a.users === 1 ? 'person' : 'people'})` : 'Nobody to alert';
  const failed = a.devices - a.delivered;
  return `Sent to ${a.users} ${a.users === 1 ? 'person' : 'people'} (${a.delivered} of ${a.devices} phones${failed ? `, ${failed} failed` : ''})`;
}
