import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AS_OF,
  DOMAINS,
  MIN_START,
  aggregateDomain,
  bucketsFor,
  clampRange,
  dayLookup,
  daysInclusive,
  groupRows,
  listDates,
  presetRange,
  previousRange,
  totalsOf,
} from "./data.js";
import {
  formatCount,
  formatDate,
  formatMonth,
  formatPct,
  formatPp,
  formatShortDate,
  formatSignedCount,
  windowLabel,
} from "./format.js";

const IDEAS = [
  {
    id: "ledger",
    index: "01",
    title: "Domain ledger",
    text: "One row per domain for the window you pick. Start with three columns, then add the rest.",
    points: [
      "Custom start date, up to one year",
      "Choose which columns are visible",
      "Thirds, average, or top and bottom 10% / 20%",
    ],
  },
  {
    id: "bands",
    index: "02",
    title: "Band board",
    text: "The same groups as a board. The headline is the reply rate if only the top group had sent.",
    points: [
      "Top, middle, and bottom side by side",
      "Switch the grouping rule",
      "Open a domain to see the window in days, weeks, or months",
    ],
  },
  {
    id: "grid",
    index: "03",
    title: "Day grid",
    text: "Domains down the side, days across. Color is reply rate, so a warmup window is easy to scan.",
    points: [
      "3, 5, 7, 14, or 30 day windows",
      "Click a cell for leads, replies, and bounces",
      "Filter by account type or mailbox provider",
    ],
  },
  {
    id: "desk",
    index: "04",
    title: "Provider desk",
    text: "Cut the same window by Google, Microsoft, or SMTP, and by MilkBox or ScaledMail.",
    points: [
      "Account type tiles with reply rate",
      "Current window beside the previous one",
      "Percentage points written out, not a raw subtraction",
    ],
  },
];

const COLUMNS = [
  { id: "contacted", label: "Leads contacted" },
  { id: "replies", label: "Replies" },
  { id: "bounces", label: "Bounces" },
  { id: "replyRate", label: "Reply rate" },
  { id: "bounceRate", label: "Bounce rate" },
  { id: "provider", label: "Account type" },
  { id: "source", label: "Provider" },
  { id: "mailboxes", label: "Mailboxes" },
  { id: "prevReplyRate", label: "Previous reply rate" },
];

const GROUPS = [
  ["none", "No grouping"],
  ["thirds", "Thirds"],
  ["average", "Above / below average"],
  ["top10", "Top / bottom 10%"],
  ["top20", "Top / bottom 20%"],
];

const PRESETS = [3, 5, 7, 14, 30, 90];

function useHash() {
  const read = () => window.location.hash.replace(/^#/, "");
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const onChange = () => setHash(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function go(id) {
  window.location.hash = id;
}

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function heatColor(rate) {
  if (rate == null) return "#f3f0e8";
  const t = Math.max(0, Math.min(1, rate / 0.08));
  const r = Math.round(244 - t * (244 - 12));
  const g = Math.round(228 - t * (228 - 107));
  const b = Math.round(212 - t * (212 - 77));
  return `rgb(${r}, ${g}, ${b})`;
}

function Summary({ current, previous }) {
  const cards = [
    ["Leads contacted", current.contacted, previous.contacted, false],
    ["Replies", current.replies, previous.replies, false],
    ["Reply rate", current.replyRate, previous.replyRate, true],
  ];
  return (
    <section className="summary" aria-label="Window summary">
      {cards.map(([label, now, before, isRate]) => {
        const delta = isRate ? (now ?? 0) - (before ?? 0) : now - before;
        return (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{isRate ? formatPct(now) : formatCount(now)}</strong>
            <em>
              {isRate ? formatPct(before) : formatCount(before)} previous period{" "}
              <span className={tone(delta)}>
                {isRate ? formatPp(delta) : formatSignedCount(delta)}
              </span>
            </em>
          </div>
        );
      })}
    </section>
  );
}

function RangeControls({ range, onChange, presets = PRESETS }) {
  const active = presets.find((days) => {
    const preset = presetRange(days);
    return preset.start === range.start && preset.end === range.end;
  });
  return (
    <div className="toolbar">
      <div className="row">
        {presets.map((days) => (
          <button
            key={days}
            className="preset"
            type="button"
            aria-pressed={active === days}
            onClick={() => onChange(presetRange(days))}
          >
            {days} days
          </button>
        ))}
      </div>
      <div className="row">
        <label className="field">
          Start
          <input
            type="date"
            min={MIN_START}
            max={AS_OF}
            value={range.start}
            onChange={(event) =>
              onChange(clampRange(event.target.value || range.start, range.end))
            }
          />
        </label>
        <label className="field">
          End
          <input
            type="date"
            min={MIN_START}
            max={AS_OF}
            value={range.end}
            onChange={(event) =>
              onChange(clampRange(range.start, event.target.value || range.end))
            }
          />
        </label>
        <span className="window-note">{windowLabel(range.start, range.end)}</span>
      </div>
    </div>
  );
}

function cellValue(row, column, previous) {
  if (column === "contacted" || column === "replies" || column === "bounces" || column === "mailboxes") {
    return formatCount(row[column]);
  }
  if (column === "replyRate" || column === "bounceRate") return formatPct(row[column]);
  if (column === "prevReplyRate") return formatPct(previous?.replyRate);
  return row[column];
}

function DomainDetail({ domain, range, granularity, onGranularity }) {
  const buckets = bucketsFor(domain, range.start, range.end, granularity);
  return (
    <section className="detail">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2>{domain.domain}</h2>
          <p className="muted">
            {domain.provider} · {domain.source} · {formatCount(domain.mailboxes)} mailboxes
          </p>
        </div>
        <div className="row" role="group" aria-label="Granularity">
          {[
            ["day", "Day"],
            ["week", "Week"],
            ["biweek", "2 weeks"],
            ["month", "Month"],
          ].map(([id, label]) => (
            <button
              key={id}
              className="chip"
              type="button"
              aria-pressed={granularity === id}
              onClick={() => onGranularity(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th className="num">Leads contacted</th>
              <th className="num">Replies</th>
              <th className="num">Bounces</th>
              <th className="num">Reply rate</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.start}>
                <td>
                  {granularity === "month"
                    ? formatMonth(bucket.start)
                    : formatShortDate(bucket.start)}
                </td>
                <td className="num">{formatCount(bucket.contacted)}</td>
                <td className="num">{formatCount(bucket.replies)}</td>
                <td className="num">{formatCount(bucket.bounces)}</td>
                <td className="num">{formatPct(bucket.replyRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Ledger({ rows, previousById, range, onRange }) {
  const [group, setGroup] = useState("thirds");
  const [visible, setVisible] = useState(8);
  const [columns, setColumns] = useState(["contacted", "replies", "bounces"]);
  const [openColumns, setOpenColumns] = useState(false);
  const [selected, setSelected] = useState(null);
  const [granularity, setGranularity] = useState("week");
  const grouped = useMemo(() => groupRows(rows, group), [rows, group]);
  const shown = [];
  let remaining = visible;
  grouped.sections.forEach((section) => {
    const take = section.rows.slice(0, remaining);
    remaining -= take.length;
    if (take.length) shown.push({ ...section, rows: take, total: section.rows.length });
  });
  const hidden = rows.length - Math.min(visible, rows.length);
  const top = grouped.sections[0];
  const selectedRow = rows.find((row) => row.id === selected);

  return (
    <>
      <RangeControls range={range} onChange={onRange} />
      <Summary current={grouped.overall} previous={totalsOf([...previousById.values()])} />
      {grouped.topLabel && (
        <p className="callout">
          If only the {grouped.topLabel} had sent, reply rate would be{" "}
          <strong>{formatPct(top.replyRate)}</strong> instead of{" "}
          <strong>{formatPct(grouped.overall.replyRate)}</strong> (
          {formatPp((top.replyRate ?? 0) - (grouped.overall.replyRate ?? 0))}).
        </p>
      )}
      <div className="toolbar">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="field">
            Grouping
            <select value={group} onChange={(event) => { setGroup(event.target.value); setVisible(8); }}>
              {GROUPS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <div className="popover">
            <button className="ghost" type="button" aria-expanded={openColumns} onClick={() => setOpenColumns((open) => !open)}>
              Columns
            </button>
            {openColumns && (
              <div className="menu">
                {COLUMNS.map((column) => (
                  <label key={column.id}>
                    <input
                      type="checkbox"
                      checked={columns.includes(column.id)}
                      onChange={() =>
                        setColumns((current) =>
                          current.includes(column.id)
                            ? current.filter((id) => id !== column.id)
                            : [...current, column.id],
                        )
                      }
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              {COLUMNS.filter((column) => columns.includes(column.id)).map((column) => (
                <th key={column.id} className={column.id === "provider" || column.id === "source" ? "" : "num"}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((section) => (
              <Fragment key={section.id}>
                {group !== "none" && (
                  <tr className="group">
                    <td colSpan={columns.length + 1}>
                      {section.label} · {formatPct(section.replyRate)} reply rate · {formatCount(section.total)} domains
                    </td>
                  </tr>
                )}
                {section.rows.map((row) => (
                  <tr
                    className="domain"
                    key={row.id}
                    aria-selected={selected === row.id}
                    onClick={() => setSelected(row.id)}
                  >
                    <td>{row.domain}</td>
                    {COLUMNS.filter((column) => columns.includes(column.id)).map((column) => (
                      <td key={column.id} className={column.id === "provider" || column.id === "source" ? "" : "num"}>
                        {cellValue(row, column.id, previousById.get(row.id))}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="footer-row">
          <span>
            Showing {formatCount(Math.min(visible, rows.length))} of {formatCount(rows.length)} domains. Rates above use every domain in the window.
          </span>
          {hidden > 0 && (
            <button className="load" type="button" onClick={() => setVisible((count) => count + 8)}>
              Load 8 more
            </button>
          )}
        </div>
      </div>
      {selectedRow && (
        <DomainDetail
          domain={selectedRow}
          range={range}
          granularity={granularity}
          onGranularity={setGranularity}
        />
      )}
    </>
  );
}

function Bands({ rows, range, onRange }) {
  const [group, setGroup] = useState("thirds");
  const [selected, setSelected] = useState(null);
  const [granularity, setGranularity] = useState("week");
  const grouped = useMemo(() => groupRows(rows, group === "none" ? "thirds" : group), [rows, group]);
  const top = grouped.sections[0];
  const selectedRow = rows.find((row) => row.id === selected);
  return (
    <>
      <RangeControls range={range} onChange={onRange} />
      <div className="toolbar">
        <label className="field">
          Grouping
          <select value={group === "none" ? "thirds" : group} onChange={(event) => setGroup(event.target.value)}>
            {GROUPS.filter(([id]) => id !== "none").map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="callout">
        If only the {grouped.topLabel} had sent, reply rate would be{" "}
        <strong>{formatPct(top.replyRate)}</strong> instead of{" "}
        <strong>{formatPct(grouped.overall.replyRate)}</strong> (
        {formatPp((top.replyRate ?? 0) - (grouped.overall.replyRate ?? 0))}).
      </p>
      <div className="bands">
        {grouped.sections.map((section) => (
          <section className="band" key={section.id}>
            <header>
              <h2>{section.label}</h2>
              <strong>{formatPct(section.replyRate)}</strong>
            </header>
            <p className="muted">
              {formatCount(section.contacted)} contacted · {formatCount(section.replies)} replies
            </p>
            <div className="cards">
              {section.rows.map((row) => (
                <button
                  className="domain-card"
                  type="button"
                  key={row.id}
                  aria-pressed={selected === row.id}
                  onClick={() => setSelected(row.id)}
                >
                  <b>{row.domain}</b>
                  <span>{row.provider} · {row.source}</span>
                  <span>{formatPct(row.replyRate)} reply rate · {formatCount(row.contacted)} contacted</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {selectedRow && (
        <DomainDetail domain={selectedRow} range={range} granularity={granularity} onGranularity={setGranularity} />
      )}
    </>
  );
}

function Grid({ domains, range, onRange }) {
  const [provider, setProvider] = useState("All");
  const [source, setSource] = useState("All");
  const [picked, setPicked] = useState(null);
  const dates = listDates(range.start, range.end);
  const visible = domains.filter((domain) =>
    (provider === "All" || domain.provider === provider) &&
    (source === "All" || domain.source === source),
  );
  const lookups = useMemo(() => new Map(visible.map((domain) => [domain.id, dayLookup(domain)])), [visible]);
  return (
    <>
      <RangeControls range={range} onChange={onRange} presets={[3, 5, 7, 14, 30]} />
      <div className="toolbar">
        <div className="row">
          {["All", "Google", "Microsoft", "SMTP"].map((item) => (
            <button key={item} className="chip" type="button" aria-pressed={provider === item} onClick={() => setProvider(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="row">
          {["All", "MilkBox", "ScaledMail"].map((item) => (
            <button key={item} className="chip" type="button" aria-pressed={source === item} onClick={() => setSource(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap grid-scroll">
        <table className="heat">
          <thead>
            <tr>
              <th className="domain-label">Domain</th>
              {dates.map((date) => <th key={date}>{formatShortDate(date).replace(",", "")}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((domain) => (
              <tr key={domain.id}>
                <th className="domain-label">{domain.domain}</th>
                {dates.map((date) => {
                  const day = lookups.get(domain.id).get(date);
                  const rate = day?.contacted ? day.replies / day.contacted : null;
                  const active = picked?.id === domain.id && picked?.date === date;
                  return (
                    <td key={date}>
                      <button
                        className="cell"
                        type="button"
                        aria-label={`${domain.domain} ${formatShortDate(date)} ${formatPct(rate)}`}
                        aria-pressed={active}
                        style={{ background: heatColor(rate) }}
                        onClick={() => setPicked({ id: domain.id, domain: domain.domain, date, day })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="detail">
        {picked?.day ? (
          <>
            <h2>{picked.domain}</h2>
            <p>
              {formatDate(picked.date)} · {formatCount(picked.day.contacted)} leads contacted · {formatCount(picked.day.replies)} replies · {formatCount(picked.day.bounces)} bounces · {formatPct(picked.day.contacted ? picked.day.replies / picked.day.contacted : null)} reply rate
            </p>
          </>
        ) : (
          <p className="muted">Click a cell. Darker green is a higher reply rate. Empty days stay pale.</p>
        )}
      </section>
    </>
  );
}

function Desk({ rows, previousRows, range, onRange }) {
  const [provider, setProvider] = useState("All");
  const [source, setSource] = useState("All");
  const filter = (list) => list.filter((row) =>
    (provider === "All" || row.provider === provider) &&
    (source === "All" || row.source === source),
  );
  const current = filter(rows);
  const previous = filter(previousRows);
  const tiles = ["Google", "Microsoft", "SMTP"].map((name) => {
    const now = totalsOf(rows.filter((row) => row.provider === name && (source === "All" || row.source === source)));
    const before = totalsOf(previousRows.filter((row) => row.provider === name && (source === "All" || row.source === source)));
    return { name, now, before };
  });
  return (
    <>
      <RangeControls range={range} onChange={onRange} />
      <div className="toolbar">
        <div className="row">
          {["All", "MilkBox", "ScaledMail"].map((item) => (
            <button key={item} className="chip" type="button" aria-pressed={source === item} onClick={() => setSource(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="tiles">
        {tiles.map((tile) => (
          <button
            className="tile"
            type="button"
            key={tile.name}
            aria-pressed={provider === tile.name}
            onClick={() => setProvider((currentProvider) => currentProvider === tile.name ? "All" : tile.name)}
          >
            <span>{tile.name}</span>
            <strong>{formatPct(tile.now.replyRate)}</strong>
            <em>
              {formatPct(tile.before.replyRate)} previous period{" "}
              <span className={tone((tile.now.replyRate ?? 0) - (tile.before.replyRate ?? 0))}>
                {formatPp((tile.now.replyRate ?? 0) - (tile.before.replyRate ?? 0))}
              </span>
            </em>
          </button>
        ))}
      </div>
      <Summary current={totalsOf(current)} previous={totalsOf(previous)} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Account type</th>
              <th>Provider</th>
              <th className="num">Leads contacted</th>
              <th className="num">Replies</th>
              <th className="num">Bounces</th>
              <th className="num">Reply rate</th>
            </tr>
          </thead>
          <tbody>
            {current
              .slice()
              .sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))
              .map((row) => (
                <tr key={row.id}>
                  <td>{row.domain}</td>
                  <td>{row.provider}</td>
                  <td>{row.source}</td>
                  <td className="num">{formatCount(row.contacted)}</td>
                  <td className="num">{formatCount(row.replies)}</td>
                  <td className="num">{formatCount(row.bounces)}</td>
                  <td className="num">{formatPct(row.replyRate)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Shell({ title, children }) {
  return (
    <>
      <header className="topbar">
        <div>
          <button className="back" type="button" onClick={() => go("")}>All ideas</button>
          <h1>{title}</h1>
        </div>
        <span className="badge">Sample data · as of {formatDate(AS_OF)}</span>
      </header>
      {children}
    </>
  );
}

export default function App() {
  const hash = useHash();
  const [range, setRange] = useState(() => presetRange(14));
  const idea = IDEAS.find((item) => item.id === hash);
  const rows = useMemo(
    () => DOMAINS.map((domain) => aggregateDomain(domain, range.start, range.end)),
    [range],
  );
  const previous = previousRange(range.start, range.end);
  const previousRows = useMemo(
    () => DOMAINS.map((domain) => aggregateDomain(domain, previous.start, previous.end)),
    [previous.start, previous.end],
  );
  const previousById = useMemo(
    () => new Map(previousRows.map((row) => [row.id, row])),
    [previousRows],
  );

  return (
    <main className="app">
      {!idea && (
        <>
          <header className="home-head">
            <p className="eyebrow">October 14 walkthrough</p>
            <h1>Performance Tracker</h1>
            <p className="lede">
              Pick an idea and use it. Every number is sample data for a 24-domain workspace, through {formatDate(AS_OF)}. Nothing here is a live customer account.
            </p>
          </header>
          <section className="idea-grid">
            {IDEAS.map((item) => (
              <article className="idea" key={item.id}>
                <span className="idea-index">{item.index}</span>
                <h2>{item.title}</h2>
                <p>{item.text}</p>
                <ul>
                  {item.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
                <button className="idea-open" type="button" onClick={() => go(item.id)}>
                  Open {item.title}
                </button>
              </article>
            ))}
          </section>
        </>
      )}
      {idea?.id === "ledger" && (
        <Shell title="Domain ledger">
          <Ledger rows={rows} previousById={previousById} range={range} onRange={setRange} />
        </Shell>
      )}
      {idea?.id === "bands" && (
        <Shell title="Band board">
          <Bands rows={rows} range={range} onRange={setRange} />
        </Shell>
      )}
      {idea?.id === "grid" && (
        <Shell title="Day grid">
          <Grid domains={DOMAINS} range={range} onRange={setRange} />
        </Shell>
      )}
      {idea?.id === "desk" && (
        <Shell title="Provider desk">
          <Desk rows={rows} previousRows={previousRows} range={range} onRange={setRange} />
        </Shell>
      )}
      {idea && <p className="window-note" style={{ marginTop: 18 }}>{daysInclusive(range.start, range.end)} day window in this idea. The date range stays when you go back and open another one.</p>}
    </main>
  );
}
