export const naira = (n: number) =>
  '₦' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const shortId = () =>
  'AR' + Math.floor(100000 + Math.random() * 900000).toString();

export const timeLabel = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const km = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)} km`;
