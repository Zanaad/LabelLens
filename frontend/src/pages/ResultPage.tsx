import { Fragment, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useScan, useVerdict, type Scan, type Verdict } from "../api/scans";
import { ComparisonTable } from "../components/ComparisonTable";
import {
  BookIcon,
  CloseIcon,
  CompareIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ExternalIcon,
  InfoIcon,
  RestartIcon,
  ShareIcon,
} from "../components/icons";
import { ShareDialog } from "../components/ShareDialog";
import { Button, ButtonLink, Eyebrow, Notice, Steps } from "../components/ui";
import { VERDICT, groupSources, say, type SourceDoc } from "../components/verdict";
import { t, type MessageKey } from "../i18n";
import { NotFoundPage } from "./StatusPages";

const card = "flex min-w-0 flex-col gap-3 rounded-control border border-border bg-surface p-6";

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

function SourcesDrawer({ docs, highlight, onClose }: { docs: SourceDoc[]; highlight: number | null; onClose: () => void }) {
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
        {docs.some((d) => !d.verified) && <p className="m-0 text-sm text-muted">{t("result.sourcesSample")}</p>}
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {docs.map((d, i) => (
            <li
              key={i}
              className={`flex gap-3 rounded-control px-4 py-3.5 ${
                highlight === i + 1 ? "border-2 border-accent bg-accent-weak" : "border border-border bg-surface"
              }`}
            >
              <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-inner border border-border-2 bg-surface-2 text-sm font-semibold">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="m-0 font-semibold">{d.title}</p>
                {d.section && <p className="m-0 text-sm text-muted">{d.section}</p>}
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 text-sm font-medium">
                    {t("result.openAt", { host: new URL(d.url).hostname.replace(/^www\./, "") })}
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
  const [asked, setAsked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [questionsCopied, setQuestionsCopied] = useState(false);
  const [showManufacturerMessage, setShowManufacturerMessage] = useState(false);
  const [drawer, setDrawer] = useState<{ highlight: number | null } | null>(null);
  const [sharing, setSharing] = useState(false);

  const style = VERDICT[verdict.verdict];
  const sources = groupSources(verdict.sources);
  const plant = scan.fields.plant?.value;
  const latin = verdict.plant_latin.length === 1 ? verdict.plant_latin[0] : null;
  const name = scan.product_name ?? plant ?? t("result.unnamed");
  const manufacturerQuestions = verdict.missing.filter((item) => item.ask === "manufacturer");
  const manufacturerMessage = t("result.manufacturerMessage", {
    product: name,
    questions: manufacturerQuestions.map((item, i) => `${i + 1}. ${say("question", item)}`).join("\n"),
  });
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
  const copyQuestions = async () => {
    try {
      await navigator.clipboard.writeText(manufacturerMessage);
      setQuestionsCopied(true);
    } catch {
      setQuestionsCopied(false);
    }
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
              {verdict.reasons.map((r, i) => {
                const n = r.source ? sources.number.get(r.source) : undefined;
                return (
                  <li key={i} className="pl-1">
                    {say("reason", r)}
                    {n && <SourceButton n={n} onOpen={() => setDrawer({ highlight: n })} />}
                  </li>
                );
              })}
            </ol>
          </section>

          <ComparisonTable comparisons={verdict.comparisons} />

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
            <Button variant="secondary" onClick={() => setSharing(true)} aria-haspopup="dialog" className="justify-start">
              <ShareIcon />
              {t("result.share")}
            </Button>
            <ButtonLink to={`/scans/${scan.id}/summary`} variant="secondary" className="justify-start">
              <DownloadIcon />
              {t("result.exportSummary")}
            </ButtonLink>
            <ButtonLink to={`/compare?a=${scan.id}`} variant="secondary" className="justify-start">
              <CompareIcon />
              {t("compare.link")}
            </ButtonLink>
            <Button variant="secondary" onClick={copy} className="justify-start">
              <CopyIcon />
              {copied ? t("result.copied") : t("result.copy")}
            </Button>
            <Button variant="secondary" onClick={copyQuestions} disabled={manufacturerQuestions.length === 0} className="justify-start">
              <CopyIcon />
              {t("result.copyManufacturerQuestions")}
            </Button>
            {manufacturerQuestions.length > 0 ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setShowManufacturerMessage((shown) => !shown)}
                  aria-expanded={showManufacturerMessage}
                  className="justify-start"
                >
                  {t(showManufacturerMessage ? "result.hideManufacturerMessage" : "result.showManufacturerMessage")}
                </Button>
                {showManufacturerMessage && (
                  <div className="rounded-control border border-border bg-surface-2 p-4">
                    <p className="m-0 mb-2 text-sm font-semibold">{t("result.manufacturerPreview")}</p>
                    <p className="m-0 whitespace-pre-line text-sm text-muted">{manufacturerMessage}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="m-0 text-sm text-muted">{t("result.noManufacturerQuestions")}</p>
            )}
            <ButtonLink to="/scan" variant="secondary" className="justify-start">
              <RestartIcon />
              {t("result.startOver")}
            </ButtonLink>
            <p aria-live="polite" className="m-0 min-h-[21px] text-sm text-match-fg">
              {questionsCopied ? t("result.manufacturerQuestionsCopied") : copied ? t("result.copiedNote") : ""}
            </p>
          </section>

          {sources.docs.length > 0 && (
            <section aria-labelledby="src-title" className={card}>
              <h2 id="src-title" className="m-0 text-lg font-semibold">
                {t("result.sourcesTitle")}
              </h2>
              <p className="m-0 text-body-sm text-muted">{t("result.sourcesCount", { n: sources.docs.length })}</p>
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

      {drawer && <SourcesDrawer docs={sources.docs} highlight={drawer.highlight} onClose={() => setDrawer(null)} />}
      {sharing && <ShareDialog scanId={scan.id} name={name} onClose={() => setSharing(false)} />}
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
