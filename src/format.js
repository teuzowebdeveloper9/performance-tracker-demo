import { daysInclusive, parseISO } from "./data.js";

export function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function formatPct(rate) {
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}

export function formatPp(delta) {
  if (delta == null || Number.isNaN(delta)) return "—";
  const pp = delta * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(2)} pp`;
}

export function formatSignedCount(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCount(value)}`;
}

export function formatDate(iso) {
  return new Date(parseISO(iso)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatShortDate(iso) {
  return new Date(parseISO(iso)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonth(iso) {
  return new Date(parseISO(iso)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function windowLabel(start, end) {
  const days = daysInclusive(start, end);
  return `${formatDate(start)} – ${formatDate(end)} · ${formatCount(days)} days`;
}
