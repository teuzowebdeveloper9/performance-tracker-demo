export const AS_OF = "2026-10-08";

const SPECS = [
  ["northlinehq.com", "Google", "MilkBox", 0.072, 0.012, 180, 28],
  ["cedarpath.io", "Google", "MilkBox", 0.064, 0.015, 140, 22],
  ["harborlane.co", "Microsoft", "MilkBox", 0.058, 0.018, 160, 19],
  ["brightkiln.com", "SMTP", "ScaledMail", 0.061, 0.021, 90, 11],
  ["oakmetric.io", "Google", "ScaledMail", 0.055, 0.014, 110, 16],
  ["lumenfield.co", "Microsoft", "ScaledMail", 0.049, 0.019, 130, 14],
  ["quietharbor.com", "Google", "MilkBox", 0.046, 0.016, 200, 31],
  ["mapleorbit.io", "SMTP", "MilkBox", 0.042, 0.028, 70, 8],
  ["silverroute.co", "Google", "MilkBox", 0.031, 0.022, 150, 18],
  ["pineledger.com", "Microsoft", "MilkBox", 0.028, 0.024, 120, 15],
  ["cobaltmail.io", "SMTP", "ScaledMail", 0.026, 0.031, 80, 9],
  ["amberpost.co", "Google", "ScaledMail", 0.024, 0.02, 170, 24],
  ["kindling.io", "Microsoft", "ScaledMail", 0.022, 0.027, 95, 12],
  ["westarchive.com", "Google", "MilkBox", 0.021, 0.023, 140, 17],
  ["lowridge.co", "SMTP", "MilkBox", 0.019, 0.034, 60, 7],
  ["paperwharf.com", "Microsoft", "MilkBox", 0.018, 0.025, 110, 13],
  ["dustlane.io", "Google", "ScaledMail", 0.009, 0.041, 100, 10],
  ["graymarket.co", "Microsoft", "ScaledMail", 0.008, 0.048, 85, 9],
  ["tinmailbox.com", "SMTP", "MilkBox", 0.007, 0.055, 50, 6],
  ["oldsignal.io", "Google", "MilkBox", 0.006, 0.038, 130, 14],
  ["rustbucket.co", "Microsoft", "MilkBox", 0.005, 0.062, 70, 8],
  ["faintpath.com", "SMTP", "ScaledMail", 0.004, 0.07, 40, 4],
  ["hollowsend.io", "Google", "ScaledMail", 0.004, 0.044, 90, 11],
  ["mirepost.co", "Microsoft", "ScaledMail", 0.003, 0.058, 55, 5],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatISO(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso, n) {
  return formatISO(parseISO(iso) + n * 86400000);
}

export function daysInclusive(start, end) {
  return Math.round((parseISO(end) - parseISO(start)) / 86400000) + 1;
}

export const MIN_START = addDays(AS_OF, -364);

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function buildDays(spec, index) {
  const rng = mulberry32(8100 + index * 97);
  const days = [];
  for (let i = 399; i >= 0; i -= 1) {
    const date = addDays(AS_OF, -i);
    const dow = new Date(parseISO(date)).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const wave = Math.sin((399 - i) / 11 + index) * 0.006;
    const replyP = clamp(spec[3] + wave + (rng() - 0.5) * 0.006, 0.001, 0.14);
    const bounceP = clamp(spec[4] + (rng() - 0.5) * 0.008, 0.002, 0.12);
    const contacted = Math.max(
      0,
      Math.round(spec[5] * (weekend ? 0.12 : 1) * (0.85 + rng() * 0.3)),
    );
    const replies = Math.min(contacted, Math.round(contacted * replyP));
    const bounces = Math.min(
      contacted - replies,
      Math.round(contacted * bounceP),
    );
    days.push({ date, contacted, replies, bounces });
  }
  return days;
}

export const DOMAINS = SPECS.map((spec, index) => ({
  id: spec[0],
  domain: spec[0],
  provider: spec[1],
  source: spec[2],
  mailboxes: spec[6],
  days: buildDays(spec, index),
}));

export const PROVIDERS = ["Google", "Microsoft", "SMTP"];
export const SOURCES = ["MilkBox", "ScaledMail"];

export function presetRange(days) {
  return { start: addDays(AS_OF, -(days - 1)), end: AS_OF };
}

export function clampRange(start, end) {
  let nextEnd = end > AS_OF ? AS_OF : end;
  let nextStart = start < MIN_START ? MIN_START : start;
  if (nextStart > nextEnd) nextStart = nextEnd;
  return { start: nextStart, end: nextEnd };
}

export function previousRange(start, end) {
  const len = daysInclusive(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return { start: prevStart, end: prevEnd };
}

export function sumDays(days) {
  return days.reduce(
    (acc, day) => {
      acc.contacted += day.contacted;
      acc.replies += day.replies;
      acc.bounces += day.bounces;
      return acc;
    },
    { contacted: 0, replies: 0, bounces: 0 },
  );
}

export function withRates(totals) {
  return {
    ...totals,
    replyRate: totals.contacted ? totals.replies / totals.contacted : null,
    bounceRate: totals.contacted ? totals.bounces / totals.contacted : null,
  };
}

export function sliceDays(domain, start, end) {
  return domain.days.filter((day) => day.date >= start && day.date <= end);
}

export function aggregateDomain(domain, start, end) {
  return {
    ...domain,
    ...withRates(sumDays(sliceDays(domain, start, end))),
  };
}

export function totalsOf(rows) {
  return withRates(
    rows.reduce(
      (acc, row) => {
        acc.contacted += row.contacted;
        acc.replies += row.replies;
        acc.bounces += row.bounces;
        return acc;
      },
      { contacted: 0, replies: 0, bounces: 0 },
    ),
  );
}

function byReplyRate(a, b) {
  return (b.replyRate ?? -1) - (a.replyRate ?? -1);
}

function section(id, label, rows) {
  const totals = totalsOf(rows);
  return { id, label, rows: [...rows].sort(byReplyRate), ...totals };
}

export function groupRows(rows, mode) {
  const sorted = [...rows].sort(byReplyRate);
  const overall = totalsOf(sorted);
  if (mode === "none" || sorted.length === 0) {
    return {
      mode,
      sections: [section("all", "All domains", sorted)],
      overall,
      topLabel: null,
    };
  }
  if (mode === "thirds") {
    const size = Math.ceil(sorted.length / 3);
    const top = sorted.slice(0, size);
    const middle = sorted.slice(size, size * 2);
    const bottom = sorted.slice(size * 2);
    return {
      mode,
      sections: [
        section("top", "Top third", top),
        section("middle", "Middle third", middle),
        section("bottom", "Bottom third", bottom),
      ].filter((item) => item.rows.length),
      overall,
      topLabel: "top third",
    };
  }
  if (mode === "average") {
    const avg = overall.replyRate ?? 0;
    const above = sorted.filter((row) => (row.replyRate ?? 0) >= avg);
    const below = sorted.filter((row) => (row.replyRate ?? 0) < avg);
    return {
      mode,
      sections: [
        section("above", "Above average", above),
        section("below", "Below average", below),
      ].filter((item) => item.rows.length),
      overall,
      topLabel: "above-average group",
    };
  }
  const pct = mode === "top20" ? 0.2 : 0.1;
  const label = mode === "top20" ? "20%" : "10%";
  const k = Math.max(1, Math.round(sorted.length * pct));
  const top = sorted.slice(0, k);
  const bottom = sorted.slice(Math.max(k, sorted.length - k));
  const middle = sorted.slice(k, Math.max(k, sorted.length - k));
  return {
    mode,
    sections: [
      section("top", `Top ${label}`, top),
      section("middle", "Middle", middle),
      section("bottom", `Bottom ${label}`, bottom),
    ].filter((item) => item.rows.length),
    overall,
    topLabel: `top ${label}`,
  };
}

export function listDates(start, end) {
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function bucketStart(date, granularity, rangeStart) {
  if (granularity === "day") return date;
  if (granularity === "month") return `${date.slice(0, 7)}-01`;
  const span = granularity === "biweek" ? 14 : 7;
  const offset = daysInclusive(rangeStart, date) - 1;
  const bucket = Math.floor(offset / span) * span;
  return addDays(rangeStart, bucket);
}

export function bucketsFor(domain, start, end, granularity) {
  const map = new Map();
  sliceDays(domain, start, end).forEach((day) => {
    const key = bucketStart(day.date, granularity, start);
    const current = map.get(key) ?? {
      start: key,
      contacted: 0,
      replies: 0,
      bounces: 0,
    };
    current.contacted += day.contacted;
    current.replies += day.replies;
    current.bounces += day.bounces;
    map.set(key, current);
  });
  return [...map.values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((row) => withRates(row));
}

export function dayLookup(domain) {
  return new Map(domain.days.map((day) => [day.date, day]));
}
