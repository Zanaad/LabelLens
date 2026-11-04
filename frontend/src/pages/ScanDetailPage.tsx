import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, errorCode } from "../api/client";
import {
  FIELD_KEYS,
  useCheckScan,
  useDeleteScan,
  useRevokeShare,
  useScan,
  useScanHistory,
  useUpdateFields,
  useVerdict,
  type FieldKey,
  type Scan,
  type ScanHistory,
  type Share,
  type Verdict,
} from "../api/scans";
import { ArrowRightIcon, DocumentIcon, DownloadIcon, HistoryIcon, NotStatedIcon, ShareIcon } from "../components/icons";
import { ShareDialog } from "../components/ShareDialog";
import { Button, ButtonLink, Eyebrow, Notice, initials, inputClass } from "../components/ui";
import { VERDICT, VerdictChip, say } from "../components/verdict";
import { en } from "../i18n/en";
import { formatDate, formatDateTime, t, type MessageKey } from "../i18n";
import { NotFoundPage } from "./StatusPages";

const card = "flex min-w-0 flex-col rounded-control border border-border bg-surface";
const MONO: FieldKey[] = ["extract_ratio", "batch", "expiry"];

function FieldsForm({ scan, history }: { scan: Scan; history: ScanHistory | undefined }) {
  const update = useUpdateFields(scan.id);
  const check = useCheckScan(scan.id);
  const initial = Object.fromEntries(FIELD_KEYS.map((k) => [k, scan.fields[k]?.value ?? ""])) as Record<FieldKey, string>;
  const [values, setValues] = useState(initial);
  const [adding, setAdding] = useState<Set<FieldKey>>(new Set());
  const changed = FIELD_KEYS.filter((k) => values[k].trim() !== initial[k]);
  const error = update.error ?? check.error;

  // Corrections are saved first, then the evidence is checked again with them.
  const save = () => {
    const fields = Object.fromEntries(changed.map((k) => [k, values[k].trim() || null]));
    update
      .mutateAsync(fields)
      .then(() => (scan.status === "out_of_scope" ? undefined : check.mutateAsync()))
      .catch(() => {});
  };

  return (
    <section aria-labelledby="dfields" className={`${card} flex-[1.4_1_520px]`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
        <h2 id="dfields" className="m-0 text-lg font-semibold">
          {t("detail.fieldsTitle")}
        </h2>
        <span className="text-sm text-muted">{t("detail.fieldsHint")}</span>
      </div>
      {FIELD_KEYS.map((key) => {
        const id = `detail-${key}`;
        const past = history?.corrections.filter((c) => c.field === key) ?? [];
        const notStated = !initial[key] && !values[key] && !adding.has(key);
        return (
          <div
            key={key}
            className="grid grid-cols-[minmax(150px,34%)_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 border-b border-border px-6 py-3"
          >
            <label htmlFor={id} className="pt-2.5 font-semibold">
              {t(`field.${key}` as MessageKey)}
            </label>
            <div className="flex min-w-0 flex-col gap-1.5">
              {notStated ? (
                <div
                  id={id}
                  className="flex min-h-control flex-wrap items-center justify-between gap-2 rounded-control border-[1.5px] border-dashed border-border-2 bg-missing-bg px-3 py-2 text-missing-fg"
                >
                  <span className="inline-flex items-center gap-2 italic">
                    <NotStatedIcon />
                    {t("review.notStated")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdding(new Set(adding).add(key))}
                    className="min-h-control rounded-control border-0 bg-transparent px-3 font-medium text-link underline"
                  >
                    {t("review.addValue")}
                  </button>
                </div>
              ) : (
                <input
                  id={id}
                  type="text"
                  maxLength={500}
                  autoFocus={adding.has(key) && !values[key]}
                  value={values[key]}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  className={`${inputClass} ${MONO.includes(key) ? "font-mono" : ""}`}
                />
              )}
              {past.length > 0 && (
                <details>
                  <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-sm text-link">
                    <HistoryIcon />
                    {past.length === 1 ? t("detail.oneCorrection") : t("detail.corrections", { n: past.length })}
                  </summary>
                  <ol className="mt-1.5 mb-0 flex list-none flex-col gap-1.5 border-l-2 border-border py-0 pr-0 pl-3 text-sm">
                    {past.map((c) => (
                      <li key={c.at}>
                        <span className="font-mono">{c.old ?? t("review.notStated")}</span> →{" "}
                        <span className="font-mono">{c.new ?? t("review.notStated")}</span>
                        <span className="block text-muted">
                          {[c.by, formatDateTime(c.at)].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <span aria-live="polite" className="text-body-sm text-muted">
          {changed.length === 0
            ? t("detail.noUnsaved")
            : changed.length === 1
              ? t("detail.oneUnsaved")
              : t("detail.unsaved", { n: changed.length })}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={changed.length === 0}
            onClick={() => {
              setValues(initial);
              setAdding(new Set());
            }}
          >
            {t("detail.discard")}
          </Button>
          <Button disabled={changed.length === 0 || update.isPending || check.isPending} onClick={save}>
            {t("detail.save")}
          </Button>
        </div>
      </div>
      {error && (
        <div className="px-6 pb-5">
          <Notice tone="error">{t(`error.${errorCode(error)}` as MessageKey)}</Notice>
        </div>
      )}
    </section>
  );
}

function VerdictSection({ scan, verdict }: { scan: Scan; verdict: Verdict | undefined }) {
  return (
    <section aria-labelledby="dverd" className={`${card} flex-[1.4_1_520px] gap-3 p-6`}>
      <h2 id="dverd" className="m-0 text-xl font-semibold">
        {t("detail.verdictTitle")}
      </h2>
      {verdict ? (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <VerdictChip verdict={verdict.verdict} />
            <span className="font-semibold">{t(VERDICT[verdict.verdict].title)}</span>
          </div>
          <p className="m-0">{t(`result.short.${verdict.verdict}` as MessageKey)}</p>
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-[22px]">
            {verdict.reasons.map((r, i) => (
              <li key={i} className="pl-1">
                {say("reason", r)}
              </li>
            ))}
          </ol>
          <Link to={`/scans/${scan.id}/result`} className="inline-flex min-h-control items-center gap-1.5 font-medium">
            {t("detail.seeResult")}
            <ArrowRightIcon />
          </Link>
        </>
      ) : scan.status === "out_of_scope" ? (
        <p className="m-0 text-muted">{t("detail.outOfScope")}</p>
      ) : (
        <>
          <p className="m-0 text-muted">{t("detail.notChecked")}</p>
          <Link to={`/scans/${scan.id}/review`} className="inline-flex min-h-control items-center gap-1.5 font-medium">
            {t("detail.checkNow")}
            <ArrowRightIcon />
          </Link>
        </>
      )}
    </section>
  );
}

function shareState(s: Share) {
  if (s.revoked_at) return t("detail.linkRevoked", { date: formatDate(s.revoked_at) });
  if (new Date(s.expires_at) <= new Date()) return t("detail.linkExpired", { date: formatDate(s.expires_at) });
  return t("detail.linkActive", { date: formatDateTime(s.expires_at) });
}

function ActivitySection({ scanId, history }: { scanId: string; history: ScanHistory }) {
  const revoke = useRevokeShare(scanId);
  // Newest first; actions without wording (e.g. future audit actions) are skipped.
  const log = history.activity.filter((a) => `activity.${a.action}` in en).reverse();
  return (
    <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
      <section aria-labelledby="dlinks" className={`${card} gap-3 p-6`}>
        <h2 id="dlinks" className="m-0 text-xl font-semibold">
          {t("detail.linksTitle")}
        </h2>
        {history.shares.length === 0 ? (
          <p className="m-0 text-muted">{t("detail.linksEmpty")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {history.shares.map((s) => {
              const active = !s.revoked_at && new Date(s.expires_at) > new Date();
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
                  <div className="text-body-sm">
                    <p className="m-0">{shareState(s)}</p>
                    <p className="m-0 font-mono text-eyebrow tracking-normal text-muted">
                      {[
                        t("detail.linkCreated", { date: formatDateTime(s.created_at) }),
                        s.last_viewed_at && t("detail.linkViewed", { date: formatDateTime(s.last_viewed_at) }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {active && (
                    <Button variant="secondary" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)} className="min-h-10 py-1.5">
                      {t("detail.revoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="dlog" className={`${card} gap-3 p-6`}>
        <h2 id="dlog" className="m-0 text-xl font-semibold">
          {t("detail.logTitle")}
        </h2>
        <ol className="m-0 flex list-none flex-col p-0">
          {log.map((a, i) => (
            <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 border-b border-border py-2">
              <span
                aria-hidden="true"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-weak text-xs font-bold text-accent"
              >
                {initials(a.by ?? "")}
              </span>
              <div>
                <p className="m-0 text-body-sm">
                  <strong>{a.by}</strong>{" "}
                  {t(`activity.${a.action}` as MessageKey, {
                    verdict: a.details?.verdict ? t(VERDICT[a.details.verdict as Verdict["verdict"]].short) : "",
                  })}
                </p>
                <p className="m-0 font-mono text-eyebrow tracking-normal text-muted">{formatDateTime(a.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function ScanDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const scan = useScan(id);
  const verdict = useVerdict(id);
  const history = useScanHistory(id);
  const remove = useDeleteScan(id);
  const [sharing, setSharing] = useState(false);

  if (scan.isError) return <NotFoundPage />;
  const noVerdict = verdict.error instanceof ApiError && verdict.error.code === "no_verdict";
  if (scan.isPending || (verdict.isPending && !noVerdict)) {
    return <p role="status" className="text-muted">{t("app.loading")}</p>;
  }
  const s = scan.data;
  const v = verdict.data;
  const name = s.product_name ?? s.fields.plant?.value ?? t("result.unnamed");
  const created = history.data?.activity.find((a) => a.action === "scan.create");
  // Re-mount the form after a save so it starts from the stored values.
  const fieldsKey = FIELD_KEYS.map((k) => s.fields[k]?.value ?? "").join("|");

  const del = () => {
    if (window.confirm(t("detail.deleteConfirm"))) remove.mutate(undefined, { onSuccess: () => navigate("/scans") });
  };

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t("detail.breadcrumb")} className="no-print">
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-body-sm">
          <li>
            <Link to="/scans">{t("nav.myScans")}</Link>
          </li>
          <li aria-hidden="true" className="text-muted">
            /
          </li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>

      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>
            {t("detail.eyebrow")} · <span className="font-mono">{s.id.slice(0, 8).toUpperCase()}</span>
          </Eyebrow>
          <h1 className="m-0 text-page font-semibold">{name}</h1>
          <div className="flex flex-wrap items-center gap-2.5 text-body-sm text-muted">
            {v && <VerdictChip verdict={v.verdict} />}
            {created?.by && <span>{t("detail.scanned", { date: formatDateTime(s.created_at), name: created.by })}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {v && (
            <>
              <ButtonLink to={`/scans/${s.id}/result`}>
                <DocumentIcon />
                {t("detail.openResult")}
              </ButtonLink>
              <Button variant="secondary" aria-haspopup="dialog" onClick={() => setSharing(true)}>
                <ShareIcon />
                {t("result.share")}
              </Button>
              <ButtonLink to={`/scans/${s.id}/summary`} variant="secondary">
                <DownloadIcon />
                {t("detail.summary")}
              </ButtonLink>
            </>
          )}
          <Button variant="secondary" disabled={remove.isPending} onClick={del}>
            {t("detail.delete")}
          </Button>
        </div>
      </section>
      {remove.isError && <Notice tone="error">{t(`error.${errorCode(remove.error)}` as MessageKey)}</Notice>}

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="dimg" className={`${card} flex-[1_1_380px] gap-3 p-6`}>
          <h2 id="dimg" className="m-0 text-xl font-semibold">
            {t("detail.imageTitle")}
          </h2>
          <div className="flex justify-center rounded-control bg-photo p-4">
            {s.has_image ? (
              <img src={`/api/scans/${s.id}/image`} alt={t("review.imageAlt")} className="max-h-[520px] max-w-full rounded-inner object-contain" />
            ) : (
              <pre className="m-0 w-full max-w-[380px] rounded-inner bg-surface p-5 font-mono text-sm whitespace-pre-wrap">{s.label_text}</pre>
            )}
          </div>
          <p className="m-0 text-sm text-muted">
            {t("detail.storedWith", { name: s.original_filename ?? t("scan.pastedText") })}
          </p>
        </section>
        <FieldsForm key={fieldsKey} scan={s} history={history.data} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <VerdictSection scan={s} verdict={v} />
        {history.data && <ActivitySection scanId={s.id} history={history.data} />}
      </div>
      {sharing && <ShareDialog scanId={s.id} name={name} onClose={() => setSharing(false)} />}
    </div>
  );
}
