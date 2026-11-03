import { Fragment, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  useScan,
  useVerdict,
  type ResultItem,
  type RowStatus,
  type Scan,
  type Source,
  type Verdict,
  type VerdictCode,
} from "../api/scans";
import {
  BookIcon,
  CannotSayIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  ExternalIcon,
  InfoIcon,
  MatchIcon,
  MismatchIcon,
  NotApplicableIcon,
  NotStatedIcon,
  PartialIcon,
  RestartIcon,
} from "../components/icons";
import { Button, ButtonLink, Eyebrow, Notice, Steps } from "../components/ui";
import { t, type MessageKey } from "../i18n";
import { NotFoundPage } from "./StatusPages";

const card = "flex min-w-0 flex-col gap-3 rounded-control border border-border bg-surface p-6";
const cannot = { Icon: CannotSayIcon, cls: "border-cannot-bd bg-cannot-bg text-cannot-fg", bd: "border-cannot-bd" };

const VERDICT: Record<VerdictCode, typeof cannot & { title: MessageKey }> = {
  matches: { Icon: MatchIcon, cls: "border-match-bd bg-match-bg text-match-fg", bd: "border-match-bd", title: "verdict.matches" },
  partly_matches: {
    Icon: PartialIcon,
    cls: "border-partial-bd bg-partial-bg text-partial-fg",
    bd: "border-partial-bd",
    title: "verdict.partly",
  },
  cannot_say: { ...cannot, title: "verdict.cannotSay" },
  // TODO(expert): "differs" is shown as "cannot say" until the team decides how to present it.
  differs: { ...cannot, title: "verdict.cannotSay" },
  not_covered: { ...cannot, title: "verdict.notCovered" },
};

const ROW_STATUS: Record<RowStatus, { Icon: typeof MatchIcon; cls: string }> = {
  match: { Icon: MatchIcon, cls: "font-semibold text-match-fg" },
  partial: { Icon: PartialIcon, cls: "font-semibold text-partial-fg" },
  mismatch: { Icon: MismatchIcon, cls: "font-semibold text-mismatch-fg" },
  missing: { Icon: NotStatedIcon, cls: "font-semibold text-missing-fg" },
  na: { Icon: NotApplicableIcon, cls: "text-muted" },
};

// Field lists become field labels, other lists ("chamomile" species) are joined with "or".
function vars(params: ResultItem["params"]) {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      !Array.isArray(v)
        ? v
        : k === "fields"
          ? v.map((f) => t(`field.${f}` as MessageKey)).join(", ")
          : v.join(t("result.or")),
    ]),
  );
}
const say = (prefix: string, item: ResultItem) => t(`${prefix}.${item.code}` as MessageKey, vars(item.params));

function SourceButton({ n, onOpen }: { n: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("result.openSource", { n })}
      className="ml-1 inline-flex min-h-7 items-center rounded-inner border border-border-2 bg-surface-2 px-2 align-[1px] text-eyebrow font-semibold tracking-normal text-link"
    >
      {t("result.source", { n })}
    </button>
  );
}

function SourcesDrawer({ sources, highlight, onClose }: { sources: Source[]; highlight: string | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button
        type="button"
        aria-label={t("result.closeSources")}
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-backdrop p-0"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="relative flex h-full w-full max-w-[460px] flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="drawer-title" className="m-0 text-xl font-semibold">
            {t("result.sourcesTitle")}
          </h2>
          <Button variant="secondary" autoFocus aria-label={t("result.closeSources")} onClick={onClose} className="w-11 px-0">
            <CloseIcon />
          </Button>
        </div>
        {sources.some((s) => !s.verified) && <p className="m-0 text-sm text-muted">{t("result.sourcesSample")}</p>}
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {sources.map((s, i) => (
            <li
              key={s.id}
              className={`flex gap-3 rounded-control px-4 py-3.5 ${
                highlight === s.id ? "border-2 border-accent bg-accent-weak" : "border border-border bg-surface"
              }`}
            >
              <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-inner border border-border-2 bg-surface-2 text-sm font-semibold">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="m-0 font-semibold">{s.source_doc ?? s.herb_latin}</p>
                <p className="m-0 text-sm text-muted">
                  {[s.source_section, s.evidence_level].filter(Boolean).join(" · ")}
                </p>
                {s.source_url && (
                  <a href={s.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 text-sm font-medium">
                    {t("result.openAt", { host: new URL(s.source_url).hostname.replace(/^www\./, "") })}
                    <ExternalIcon />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function ResultView({ scan, verdict }: { scan: Scan; verdict: Verdict }) {
  const [prepIndex, setPrepIndex] = useState(0);
  const [asked, setAsked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [drawer, setDrawer] = useState<{ highlight: string | null } | null>(null);

  const style = VERDICT[verdict.verdict];
  const sourceNo = new Map(verdict.sources.map((s, i) => [s.id, i + 1]));
  const plant = scan.fields.plant?.value;
  const latin = verdict.plant_latin.length === 1 ? verdict.plant_latin[0] : null;
  const name = scan.product_name ?? plant ?? t("result.unnamed");
  const prep = verdict.comparisons[prepIndex];
  const passport: ReactNode[] = [plant, latin && <span className="italic">{latin}</span>, scan.fields.preparation_type?.value].filter(
    Boolean,
  );

  const copy = () => {
    const text = t("result.summaryText", {
      product: [name, latin].filter(Boolean).join(" – "),
      verdict: t(style.title),
      short: t(`result.short.${verdict.verdict}` as MessageKey),
      missing: verdict.missing.map((m) => t(`missing.${m.code}` as MessageKey)).join(", ") || "–",
    });
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
  };
  const toggleAsked = (i: number) => {
    const next = new Set(asked);
    if (!next.delete(i)) next.add(i);
    setAsked(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <Steps current={3} />

      <section aria-label={t("result.passport")} className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Eyebrow>{t("result.passport")}</Eyebrow>
          <h1 className="m-0 text-page font-semibold">{name}</h1>
          <p className="m-0 text-muted">
            {passport.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                {part}
              </Fragment>
            ))}
          </p>
        </div>
        <ButtonLink to={`/scans/${scan.id}/review`} variant="secondary" className="no-print">
          <EditIcon size={18} />
          {t("result.editFields")}
        </ButtonLink>
      </section>

      <section aria-labelledby="verdict-title" aria-live="polite" className="flex flex-col gap-3">
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-4 rounded-control border px-7 py-6 ${style.cls}`}>
          <span className={`inline-flex h-16 w-16 flex-none items-center justify-center rounded-full border-2 bg-surface ${style.bd}`}>
            <style.Icon size={34} />
          </span>
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
            <p className="m-0 text-sm font-semibold tracking-[0.06em] uppercase">{t("result.verdict")}</p>
            <h2 id="verdict-title" className="m-0 text-verdict font-semibold text-text">
              {t(style.title)}
            </h2>
            <p className="m-0 max-w-[72ch] text-text">{t(`result.short.${verdict.verdict}` as MessageKey)}</p>
          </div>
        </div>
        <p className="m-0 flex items-start gap-2 text-sm text-muted">
          <InfoIcon />
          {t("result.disclaimer")}
        </p>
        {verdict.sources.some((s) => !s.verified) && <Notice>{t("result.sample")}</Notice>}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-6">
          <section aria-labelledby="why-title" className={card}>
            <h2 id="why-title" className="m-0 text-xl font-semibold">
              {t("result.whyTitle")}
            </h2>
            <ol className="m-0 flex max-w-[75ch] list-decimal flex-col gap-2.5 pl-[22px]">
              {verdict.reasons.map((r, i) => (
                <li key={i} className="pl-1">
                  {say("reason", r)}
                  {r.source && sourceNo.has(r.source) && (
                    <SourceButton n={sourceNo.get(r.source)!} onOpen={() => setDrawer({ highlight: r.source })} />
                  )}
                </li>
              ))}
            </ol>
          </section>

          {prep && (
            <section aria-labelledby="cmp-title" className="flex min-w-0 flex-col rounded-control border border-border bg-surface">
              <div className="flex flex-col gap-3.5 px-6 pt-6 pb-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="cmp-title" className="m-0 text-xl font-semibold">
                    {t("result.cmpTitle")}
                  </h2>
                  <span className="text-sm text-muted">{t("result.doseNotCompared")}</span>
                </div>
                <div role="group" aria-labelledby="sel-label" className="flex flex-col gap-2">
                  <span id="sel-label" className="text-sm font-semibold text-muted">
                    {t("result.closest")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {verdict.comparisons.map((c, i) => (
                      <button
                        key={c.reference_id}
                        type="button"
                        aria-pressed={i === prepIndex}
                        onClick={() => setPrepIndex(i)}
                        className={`flex min-h-control min-w-0 flex-[1_1_220px] flex-col items-start gap-0.5 rounded-control px-3.5 py-2.5 text-left text-text ${
                          i === prepIndex ? "border-2 border-accent bg-accent-weak" : "border border-border-2 bg-surface"
                        }`}
                      >
                        <span className="text-eyebrow tracking-normal text-muted">
                          {[i === 0 ? t("result.rankClosest") : t("result.rankAlt", { n: i }), c.evidence_level]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="text-body-sm leading-[1.35] font-semibold">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[640px] border-collapse text-body-sm">
                  <caption className="px-6 py-3 text-left text-sm text-muted">
                    {t("result.caption", { prep: [prep.name, prep.evidence_level].filter(Boolean).join(", ") })}
                  </caption>
                  <thead>
                    <tr className="bg-surface-2">
                      <th scope="col" className="w-[22%] border-b border-border px-6 py-2.5 text-left font-semibold">
                        {t("result.colField")}
                      </th>
                      <th scope="col" className="border-b border-border px-4 py-2.5 text-left font-semibold">
                        {t("result.colLabel")}
                      </th>
                      <th scope="col" className="border-b border-border px-4 py-2.5 text-left font-semibold">
                        {t("result.colRef")}
                      </th>
                      <th scope="col" className="w-[18%] border-b border-border py-2.5 pr-6 pl-4 text-left font-semibold">
                        {t("result.colStatus")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {prep.rows.map((row) => {
                      const s = ROW_STATUS[row.status];
                      const missing = row.status === "missing";
                      return (
                        <tr key={row.field} className={missing ? "bg-missing-bg" : undefined}>
                          <th scope="row" className="border-b border-border px-6 py-3 text-left align-top font-medium">
                            {t(`field.${row.field}` as MessageKey)}
                          </th>
                          <td className={`border-b border-border px-4 py-3 align-top ${missing ? "text-missing-fg italic" : ""}`}>
                            {row.label ?? (row.status === "na" ? t("result.notApplicable") : t("review.notStated"))}
                          </td>
                          <td className="border-b border-border px-4 py-3 align-top">
                            {row.reference ?? t("result.notApplicable")}
                          </td>
                          <td className="border-b border-border py-3 pr-6 pl-4 align-top">
                            <span className={`inline-flex items-center gap-1.5 ${s.cls}`}>
                              <s.Icon size={18} />
                              {t(`status.${row.status}`)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {verdict.missing.length > 0 && (
            <section aria-labelledby="miss-title" className={`${card} gap-3.5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="miss-title" className="m-0 text-xl font-semibold">
                  {t("result.missingTitle")}
                </h2>
                <span className="text-sm text-muted">
                  {t("result.asked", { n: asked.size, total: verdict.missing.length })}
                </span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {verdict.missing.map((m, i) => (
                  <li
                    key={m.code}
                    className="flex items-start gap-3.5 rounded-control border border-dashed border-border-2 bg-missing-bg px-4 py-3.5"
                  >
                    <input
                      type="checkbox"
                      id={`miss-${i}`}
                      checked={asked.has(i)}
                      onChange={() => toggleAsked(i)}
                      className="mt-0.5 h-[22px] w-[22px] flex-none accent-accent"
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <label htmlFor={`miss-${i}`} className="font-semibold">
                        {t(`missing.${m.code}` as MessageKey)}{" "}
                        <span className="font-normal text-muted">· {t("result.notStated")}</span>
                      </label>
                      <p className="m-0">
                        {m.ask && (
                          <span className="mr-1.5 rounded-full border border-border-2 px-2 py-px text-eyebrow font-semibold tracking-normal text-muted">
                            {t(`result.ask.${m.ask}`)}
                          </span>
                        )}
                        “{say("question", m)}”
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-sm text-muted">{t("result.tickHint")}</p>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <section aria-labelledby="act-title" className={`${card} no-print gap-2.5`}>
            <h2 id="act-title" className="m-0 text-lg font-semibold">
              {t("result.actions")}
            </h2>
            <Button variant="secondary" onClick={copy} className="justify-start">
              <CopyIcon />
              {copied ? t("result.copied") : t("result.copy")}
            </Button>
            <ButtonLink to="/scan" variant="secondary" className="justify-start">
              <RestartIcon />
              {t("result.startOver")}
            </ButtonLink>
            <p aria-live="polite" className="m-0 min-h-[21px] text-sm text-match-fg">
              {copied ? t("result.copiedNote") : ""}
            </p>
          </section>

          {verdict.sources.length > 0 && (
            <section aria-labelledby="src-title" className={card}>
              <h2 id="src-title" className="m-0 text-lg font-semibold">
                {t("result.sourcesTitle")}
              </h2>
              <p className="m-0 text-body-sm text-muted">{t("result.sourcesCount", { n: verdict.sources.length })}</p>
              <Button
                variant="secondary"
                aria-expanded={drawer !== null}
                onClick={() => setDrawer({ highlight: null })}
                className="no-print justify-start"
              >
                <BookIcon />
                {t("result.openSources")}
              </Button>
            </section>
          )}
        </aside>
      </div>

      {drawer && <SourcesDrawer sources={verdict.sources} highlight={drawer.highlight} onClose={() => setDrawer(null)} />}
    </div>
  );
}

export function ResultPage() {
  const { id = "" } = useParams();
  const scan = useScan(id);
  const verdict = useVerdict(id);
  if (scan.isError) return <NotFoundPage />;
  // Not checked yet (e.g. opened by URL): go back to the review step.
  if (verdict.error instanceof ApiError && verdict.error.code === "no_verdict") {
    return <Navigate to={`/scans/${id}/review`} replace />;
  }
  if (verdict.isError) return <NotFoundPage />;
  if (scan.isPending || verdict.isPending) return <p role="status" className="text-muted">{t("app.loading")}</p>;
  return <ResultView scan={scan.data} verdict={verdict.data} />;
}
