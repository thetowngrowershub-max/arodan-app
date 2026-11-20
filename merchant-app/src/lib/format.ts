export const naira = (n: number) =>
  '₦' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** ₦1.2m / ₦45k for chart labels. */
export const nairaShort = (n: number) =>
  n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1).replace('.0', '')}m` : n >= 1000 ? `₦${Math.round(n / 1000)}k` : naira(n);

export const timeLabel = (d: Date | number) =>
  new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "just now", "4 min ago", "2 h ago", or the date. */
export function ago(t: number, now = Date.now()) {
  const m = Math.floor((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ago`;
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
