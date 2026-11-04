import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useScans, type ScanListItem, type VerdictCode } from "../api/scans";
import { DownloadIcon, InboxIcon, NotStatedIcon, SearchIcon, ShareIcon, SortIcon, UploadIcon } from "../components/icons";
import { ShareDialog } from "../components/ShareDialog";
import { ButtonLink, Eyebrow, inputClass } from "../components/ui";
import { VERDICT, VerdictChip } from "../components/verdict";
import { formatDate, t, type MessageKey } from "../i18n";

type SortKey = "name" | "herb" | "date" | "verdict" | "missing";
type Group = "matches" | "partly_matches" | "cannot_say" | "not_covered";

const GROUPS: Group[] = ["matches", "partly_matches", "cannot_say", "not_covered"];
const BAR: Record<Group, string> = {
  matches: "bg-match-bd",
  partly_matches: "bg-partial-bd",
  cannot_say: "bg-cannot-bd",
  not_covered: "bg-border-2",
};
const DAY_MS = 86_400_000;

const group = (v: VerdictCode): Group => (v === "differs" ? "cannot_say" : v);
const nameOf = (s: ScanListItem) => s.product_name ?? s.plant ?? t("result.unnamed");
const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const sortValue = (s: ScanListItem, key: SortKey): string | number =>
  key === "name"
    ? nameOf(s).toLowerCase()
    : key === "herb"
      ? (s.plant ?? "").toLowerCase()
      : key === "date"
        ? s.created_at
        : key === "verdict"
          ? s.verdict
            ? GROUPS.indexOf(group(s.verdict))
            : GROUPS.length
          : (s.missing ?? -1);

const tile = "flex min-w-0 flex-col gap-1 rounded-control border border-border bg-surface p-5";
const iconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-control border border-border-2 bg-surface text-text hover:bg-surface-2 hover:text-text";

function Stats({ scans }: { scans: ScanListItem[] }) {
  const [since] = useState(() => Date.now() - 30 * DAY_MS);
  const recent = scans.filter((s) => new Date(s.created_at).getTime() >= since);
  const counts = Object.fromEntries(GROUPS.map((g) => [g, recent.filter((s) => s.verdict && group(s.verdict) === g).length]));
  const checked = GROUPS.reduce((n, g) => n + counts[g]!, 0) || 1;
  return (
    <div className="flex flex-wrap gap-4">
      <div className={`${tile} flex-[1_1_220px]`}>
        <span className="text-body-sm text-muted">{t("myScans.month")}</span>
        <span className="font-mono text-stat font-semibold">{recent.length}</span>
        <span className="text-sm text-muted">{t("myScans.total", { n: scans.length })}</span>
      </div>
      <div className={`${tile} flex-[2_1_380px] gap-2.5`}>
        <span className="text-body-sm text-muted">{t("myScans.breakdown")}</span>
        <div aria-hidden="true" className="flex h-3.5 gap-[3px] overflow-hidden rounded bg-surface-2">
          {GROUPS.map((g) => (
            <span key={g} className={BAR[g]} style={{ width: `${(counts[g]! / checked) * 100}%` }} />
          ))}
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-1.5 p-0 text-body-sm">
          {GROUPS.filter((g) => g !== "not_covered" || counts[g]).map((g) => {
            const v = VERDICT[g];
            return (
              <li key={g} className={`inline-flex items-center gap-1.5 ${v.fg}`}>
                <v.Icon size={18} />
                <span className="text-text">
                  {t(v.short)} <strong>{counts[g]}</strong>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={`${tile} flex-[1_1_220px]`}>
        <span className="text-body-sm text-muted">{t("myScans.missingTile")}</span>
        <span className="font-mono text-stat font-semibold">{scans.filter((s) => (s.missing ?? 0) > 0).length}</span>
        <span className="text-sm text-muted">{t("myScans.missingHint")}</span>
      </div>
    </div>
  );
}

function ScanTable({ scans, onShare }: { scans: ScanListItem[]; onShare: (s: ScanListItem) => void }) {
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<"all" | Group>("all");
  const [herb, setHerb] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });

  const herbs = useMemo(() => [...new Set(scans.flatMap((s) => (s.plant ? [s.plant] : [])))].sort(), [scans]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scans
      .filter((s) => {
        const day = localDay(s.created_at);
        return (
          (!needle || `${nameOf(s)} ${s.plant ?? ""}`.toLowerCase().includes(needle)) &&
          (verdict === "all" || (s.verdict !== null && group(s.verdict) === verdict)) &&
          (herb === "all" || s.plant === herb) &&
          (!from || day >= from) &&
          (!to || day <= to) &&
          (!onlyMissing || (s.missing ?? 0) > 0)
        );
      })
      .sort((a, b) => {
        const x = sortValue(a, sort.key);
        const y = sortValue(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [scans, q, verdict, herb, from, to, onlyMissing, sort]);

  const clear = () => {
    setQ("");
    setVerdict("all");
    setHerb("all");
    setFrom("");
    setTo("");
    setOnlyMissing(false);
  };
  const heads: [SortKey, MessageKey][] = [
    ["name", "myScans.colProduct"],
    ["herb", "myScans.colHerb"],
    ["date", "myScans.colDate"],
    ["verdict", "myScans.verdict"],
    ["missing", "myScans.colMissing"],
  ];
  const field = "flex flex-col gap-1.5 text-sm font-semibold";

  return (
    <section aria-labelledby="tbl-title" className="flex min-w-0 flex-col rounded-control border border-border bg-surface">
      <div className="flex flex-col gap-4 border-b border-border px-6 pt-6 pb-4">
        <h2 id="tbl-title" className="m-0 text-xl font-semibold">
          {t("myScans.tableTitle")}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${field} flex-[2_1_220px]`}>
            {t("myScans.search")}
            <span className="relative flex items-center">
              <span className="pointer-events-none absolute left-3 text-muted">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("myScans.searchPlaceholder")}
                className={`${inputClass} pl-10 font-normal`}
              />
            </span>
          </label>
          <label className={`${field} flex-[1_1_160px]`}>
            {t("myScans.verdict")}
            <select value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)} className={`${inputClass} font-normal`}>
              <option value="all">{t("myScans.allVerdicts")}</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {t(VERDICT[g].short)}
                </option>
              ))}
            </select>
          </label>
          <label className={`${field} flex-[1_1_160px]`}>
            {t("myScans.herb")}
            <select value={herb} onChange={(e) => setHerb(e.target.value)} className={`${inputClass} font-normal`}>
              <option value="all">{t("myScans.allHerbs")}</option>
              {herbs.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0 text-sm font-semibold">{t("myScans.dates")}</legend>
            <div className="flex items-center gap-2">
              <input type="date" aria-label={t("myScans.from")} value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              <span aria-hidden="true">–</span>
              <input type="date" aria-label={t("myScans.to")} value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
          </fieldset>
          <label className="flex min-h-control items-center gap-2">
            <input type="checkbox" checked={onlyMissing} onChange={() => setOnlyMissing(!onlyMissing)} className="h-5 w-5 accent-accent" />
            {t("myScans.onlyMissing")}
          </label>
        </div>
        <p aria-live="polite" className="m-0 text-sm text-muted">
          {t("myScans.count", { n: rows.length, total: scans.length })}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-body-sm">
          <caption className="sr-only">{t("myScans.caption")}</caption>
          <thead>
            <tr className="bg-surface-2">
              {heads.map(([key, label], i) => {
                const active = sort.key === key;
                return (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                    className={`border-b border-border py-1 text-left font-semibold ${i === 0 ? "pr-3 pl-6" : "px-3"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSort({ key, dir: active ? (-sort.dir as 1 | -1) : key === "date" ? -1 : 1 })}
                      className="inline-flex min-h-control items-center gap-1.5 border-0 bg-transparent p-0 font-semibold text-text"
                    >
                      {t(label)}
                      <span className={active ? "text-accent" : "text-muted"}>
                        <SortIcon />
                      </span>
                      <span aria-hidden="true">{active ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="border-b border-border py-2.5 pr-6 pl-3 text-left font-semibold">
                {t("myScans.colActions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const name = nameOf(s);
              return (
                <tr key={s.id} className="hover:bg-surface-2">
                  <th scope="row" className="border-b border-border py-2.5 pr-3 pl-6 text-left font-semibold">
                    <Link to={`/scans/${s.id}`} className="text-text">
                      {name}
                    </Link>
                    <span className="block font-mono text-xs font-normal text-muted">{shortId(s.id)}</span>
                  </th>
                  <td className="border-b border-border px-3 py-2.5">{s.plant ?? "–"}</td>
                  <td className="border-b border-border px-3 py-2.5 font-mono text-sm whitespace-nowrap">{formatDate(s.created_at)}</td>
                  <td className="border-b border-border px-3 py-2.5">
                    {s.verdict ? (
                      <VerdictChip verdict={s.verdict} />
                    ) : (
                      <span className="text-muted">{t(s.status === "out_of_scope" ? "myScans.outOfScope" : "myScans.notChecked")}</span>
                    )}
                  </td>
                  <td className="border-b border-border px-3 py-2.5">
                    {s.missing !== null && (
                      <span className={`inline-flex items-center gap-1.5 ${s.missing ? "text-text" : "text-muted"}`}>
                        <NotStatedIcon />
                        {s.missing === 0
                          ? t("myScans.none")
                          : s.missing === 1
                            ? t("myScans.oneDetail")
                            : t("myScans.details", { n: s.missing })}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-border py-1.5 pr-6 pl-3">
                    <div className="flex items-center gap-1">
                      <ButtonLink to={`/scans/${s.id}`} variant="secondary" className="min-h-10 px-3 py-1.5 text-body-sm">
                        {t("myScans.open")}
                      </ButtonLink>
                      {s.verdict && (
                        <>
                          <button type="button" aria-label={t("myScans.shareFor", { name })} onClick={() => onShare(s)} className={iconButton}>
                            <ShareIcon />
                          </button>
                          <Link to={`/scans/${s.id}/summary`} aria-label={t("myScans.summaryFor", { name })} className={iconButton}>
                            <DownloadIcon />
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="m-0 px-6 py-5 text-muted">
            {t("myScans.noRows")}{" "}
            <button type="button" onClick={clear} className="border-0 bg-transparent p-0 font-medium text-link underline">
              {t("myScans.clear")}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

export function MyScansPage() {
  const scans = useScans();
  const [sharing, setSharing] = useState<ScanListItem | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>{t("myScans.eyebrow")}</Eyebrow>
          <h1 className="m-0 text-page font-semibold">{t("nav.myScans")}</h1>
          <p className="m-0 text-muted">{t("myScans.intro")}</p>
        </div>
        <ButtonLink to="/scan">
          <UploadIcon />
          {t("myScans.new")}
        </ButtonLink>
      </section>

      {scans.isPending ? (
        <p role="status" className="text-muted">
          {t("app.loading")}
        </p>
      ) : scans.isError ? (
        <p role="alert">{t("error.generic")}</p>
      ) : scans.data.length === 0 ? (
        <section
          aria-labelledby="empty-title"
          className="flex flex-col items-center gap-3 rounded-control border border-dashed border-border-2 bg-surface px-6 py-12 text-center"
        >
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent-weak text-accent">
            <InboxIcon />
          </span>
          <h2 id="empty-title" className="m-0 text-xl font-semibold">
            {t("myScans.emptyTitle")}
          </h2>
          <p className="m-0 max-w-[56ch] text-muted">{t("myScans.emptyBody")}</p>
          <ButtonLink to="/scan">
            <UploadIcon />
            {t("myScans.emptyCta")}
          </ButtonLink>
        </section>
      ) : (
        <>
          <Stats scans={scans.data} />
          <ScanTable scans={scans.data} onShare={setSharing} />
        </>
      )}
      {sharing && <ShareDialog scanId={sharing.id} name={nameOf(sharing)} onClose={() => setSharing(null)} />}
    </div>
  );
}
