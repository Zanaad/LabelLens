import { Navigate, useParams } from "react-router-dom";
import { useMe } from "../api/auth";
import { ApiError } from "../api/client";
import { useScan, useVerdict, type FieldKey, type Scan, type Verdict } from "../api/scans";
import { Brand } from "../components/Brand";
import { ArrowLeftIcon, PrinterIcon } from "../components/icons";
import { Button, ButtonLink, Steps } from "../components/ui";
import { VERDICT, groupSources, say } from "../components/verdict";
import { formatDateTime, t, type MessageKey } from "../i18n";
import { NotFoundPage } from "./StatusPages";

const IDENTITY: FieldKey[] = ["plant", "plant_part", "preparation_type", "extract_ratio", "solvent", "marker", "batch", "expiry"];
const heading = "m-0 mb-1.5 text-base font-semibold";

function Sheet({ scan, verdict, by }: { scan: Scan; verdict: Verdict; by: string }) {
  const v = VERDICT[verdict.verdict];
  const sources = groupSources(verdict.sources);
  return (
    <article className="mx-auto flex w-full max-w-sheet flex-col gap-4 rounded-control border border-border bg-surface p-10 text-body-sm print:max-w-none print:gap-3 print:border-0 print:p-0 print:text-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-text pb-3">
        <div>
          <Brand />
          <p className="m-0 text-sm text-muted">{t("summary.subtitle")}</p>
        </div>
        <div className="text-right font-mono text-eyebrow tracking-normal text-muted">
          <p className="m-0">{t("summary.generated", { date: formatDateTime(new Date().toISOString()) })}</p>
          <p className="m-0">{t("summary.rules", { version: verdict.rules_version })}</p>
          {verdict.sources.some((s) => !s.verified) && <p className="m-0">{t("summary.sample")}</p>}
          <p className="m-0">{t("summary.ref", { id: scan.id.slice(0, 8).toUpperCase() })}</p>
        </div>
      </header>
      <p className="m-0 rounded-control border border-cannot-bd bg-cannot-bg px-3 py-2 text-cannot-fg">{t("summary.disclaimer")}</p>
      <h1 className="m-0 text-h1 leading-tight font-semibold">{scan.product_name ?? scan.fields.plant?.value ?? t("result.unnamed")}</h1>

      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {IDENTITY.map((k) => {
          const value = scan.fields[k]?.value;
          return (
            <div key={k} className="flex gap-2 border-b border-border py-1">
              <dt className="w-[44%] flex-none text-muted">{t(`field.${k}` as MessageKey)}</dt>
              <dd className={`m-0 min-w-0 ${value ? "" : "text-missing-fg italic"}`}>{value ?? t("review.notStated")}</dd>
            </div>
          );
        })}
      </dl>

      <div className={`flex items-center gap-3 rounded-control border-2 px-4 py-3 ${v.cls}`}>
        <v.Icon size={28} />
        <div>
          <p className="m-0 text-eyebrow font-semibold uppercase">{t("result.verdict")}</p>
          <p className="m-0 text-lg font-semibold text-text">{t(v.title)}</p>
        </div>
      </div>

      <section>
        <h2 className={heading}>{t("summary.reasoning")}</h2>
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
          {verdict.reasons.map((r, i) => (
            <li key={i}>
              {say("reason", r)}
              {r.source && sources.number.has(r.source) && ` [${sources.number.get(r.source)}]`}
            </li>
          ))}
        </ol>
      </section>

      {verdict.missing.length > 0 && (
        <section>
          <h2 className={heading}>{t("summary.notStated")}</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {verdict.missing.map((m) => (
              <li key={m.code}>
                <strong>{t(`missing.${m.code}` as MessageKey)}.</strong> {m.ask && `${t(`result.ask.${m.ask}`)}: `}“
                {say("question", m)}”
              </li>
            ))}
          </ul>
        </section>
      )}

      {sources.docs.length > 0 && (
        <section>
          <h2 className={heading}>{t("summary.sources")}</h2>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
            {sources.docs.map((d, i) => (
              <li key={i}>
                {[d.title, d.section].filter(Boolean).join(". ")}.
                {d.url && <span className="block font-mono text-eyebrow tracking-normal break-all text-muted">{d.url}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="mt-2 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3 text-sm text-muted">
        <p className="m-0 max-w-[80ch]">
          {t("summary.footer")}
          <br />
          {t("summary.footerBy", { name: by })}
        </p>
        <p className="m-0">{t("summary.page")}</p>
      </footer>
    </article>
  );
}

export function SummaryPage() {
  const { id = "" } = useParams();
  const scan = useScan(id);
  const verdict = useVerdict(id);
  const me = useMe();
  if (scan.isError) return <NotFoundPage />;
  if (verdict.error instanceof ApiError && verdict.error.code === "no_verdict") {
    return <Navigate to={`/scans/${id}/review`} replace />;
  }
  if (verdict.isError) return <NotFoundPage />;
  if (scan.isPending || verdict.isPending) return <p role="status" className="text-muted">{t("app.loading")}</p>;
  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <Steps current={4} />
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/scans/${id}/result`} variant="secondary">
            <ArrowLeftIcon />
            {t("summary.back")}
          </ButtonLink>
          <Button onClick={() => window.print()}>
            <PrinterIcon />
            {t("summary.print")}
          </Button>
        </div>
      </div>
      <Sheet scan={scan.data} verdict={verdict.data} by={me.data?.full_name ?? ""} />
    </div>
  );
}
