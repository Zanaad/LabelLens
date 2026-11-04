import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorCode } from "../api/client";
import {
  FIELD_KEYS,
  useCheckScan,
  useScan,
  useUpdateFields,
  type ExtractedField,
  type FieldKey,
  type Scan,
} from "../api/scans";
import { NotFoundPage } from "./StatusPages";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ConfidenceIcon,
  EditIcon,
  InfoIcon,
  LockIcon,
  NotStatedIcon,
} from "../components/icons";
import { Button, Eyebrow, Notice, Steps, inputClass } from "../components/ui";
import { t, type MessageKey } from "../i18n";

const MONO: FieldKey[] = ["extract_ratio", "batch", "expiry"];
const chip = "rounded-full px-3 py-1.5 text-sm";

function ConfidenceBadge({ field }: { field: ExtractedField }) {
  const level =
    field.status === "unreadable" || field.confidence < 0.5 ? "low" : field.confidence < 0.85 ? "medium" : "high";
  const styles = {
    high: { cls: "border-match-bd bg-match-bg text-match-fg", bars: 3 as const, label: "review.high", tip: "review.highTip" },
    medium: { cls: "border-border-2 bg-surface-2 text-text", bars: 2 as const, label: "review.medium", tip: "review.mediumTip" },
    low: { cls: "border-partial-bd bg-partial-bg text-partial-fg", bars: 1 as const, label: "review.low", tip: "review.lowTip" },
  }[level];
  return (
    <span
      title={t(styles.tip as MessageKey)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-eyebrow font-semibold ${styles.cls}`}
    >
      <ConfidenceIcon filled={styles.bars} />
      {t(styles.label as MessageKey)}
    </span>
  );
}

function ReviewForm({ scan }: { scan: Scan }) {
  const navigate = useNavigate();
  const update = useUpdateFields(scan.id);
  const check = useCheckScan(scan.id);
  const initial = Object.fromEntries(FIELD_KEYS.map((k) => [k, scan.fields[k]?.value ?? ""])) as Record<FieldKey, string>;
  const [values, setValues] = useState(initial);
  const [adding, setAdding] = useState<Set<FieldKey>>(new Set());

  const changed = FIELD_KEYS.filter((k) => values[k].trim() !== initial[k]);
  const isEdited = (k: FieldKey) => changed.includes(k) || !!scan.fields[k]?.edited;
  const counts = {
    read: FIELD_KEYS.filter((k) => values[k].trim()).length,
    missing: FIELD_KEYS.filter((k) => !values[k].trim()).length,
    check: FIELD_KEYS.filter((k) => {
      const f = scan.fields[k];
      return f && f.status !== "not_stated" && f.confidence < 0.85 && !isEdited(k);
    }).length,
    edited: FIELD_KEYS.filter(isEdited).length,
  };

  // Save corrections first, then check the evidence with the corrected fields.
  const next = () => {
    const fields = Object.fromEntries(changed.map((k) => [k, values[k].trim() || null]));
    const saved = changed.length ? update.mutateAsync(fields) : Promise.resolve();
    saved
      .then(() => check.mutateAsync())
      .then(() => navigate(`/scans/${scan.id}/result`))
      .catch(() => {}); // shown below from update.error / check.error
  };
  const error = update.error ?? check.error;
  const busy = update.isPending || check.isPending;

  return (
    <div className="flex flex-col gap-6">
      <Steps current={2} />
      <section className="flex flex-col gap-3">
        <Eyebrow>{t("review.step")}</Eyebrow>
        <h1 className="m-0 text-page font-semibold">{t("review.title")}</h1>
        <p className="m-0 max-w-[66ch] text-muted">{t("review.intro")}</p>
        <ul aria-label={t("review.summaryLabel")} className="m-0 flex list-none flex-wrap gap-2 p-0">
          <li className={`${chip} border border-border-2`}>
            <strong>{counts.read}</strong> {t("review.countRead")}
          </li>
          <li className={`${chip} border border-dashed border-border-2 bg-missing-bg text-missing-fg`}>
            <strong>{counts.missing}</strong> {t("review.countMissing")}
          </li>
          <li className={`${chip} border border-partial-bd bg-partial-bg text-partial-fg`}>
            <strong>{counts.check}</strong> {t("review.countCheck")}
          </li>
          <li className={`${chip} border border-match-bd bg-match-bg text-match-fg`}>
            <strong>{counts.edited}</strong> {t("review.countEdited")}
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section
          aria-labelledby="img-title"
          className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-control border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="img-title" className="m-0 text-lg font-semibold">
              {t("review.imageTitle")}
            </h2>
            <span className="font-mono text-sm text-muted">{scan.original_filename ?? t("scan.pastedText")}</span>
          </div>
          <div className="flex justify-center rounded-control bg-photo p-4">
            {scan.has_image ? (
              <img
                src={`/api/scans/${scan.id}/image`}
                alt={t("review.imageAlt")}
                className="max-h-[560px] max-w-full rounded-inner object-contain"
              />
            ) : (
              <pre className="m-0 w-full max-w-[380px] rounded-inner bg-surface p-5 font-mono text-sm whitespace-pre-wrap">
                {scan.label_text}
              </pre>
            )}
          </div>
          <p className="m-0 flex items-start gap-2 text-sm text-muted">
            <InfoIcon />
            {t("review.evidenceHint")}
          </p>
          <p className="m-0 flex items-start gap-2 text-sm text-muted">
            <LockIcon />
            {t("app.privacyNote")}
          </p>
        </section>

        <section
          aria-labelledby="fields-title"
          className="flex min-w-0 flex-[1.3_1_520px] flex-col rounded-control border border-border bg-surface"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-6 py-5">
            <h2 id="fields-title" className="m-0 text-lg font-semibold">
              {t("review.identityTitle")}
            </h2>
            <span className="text-sm text-muted">{t("review.confidenceHint")}</span>
          </div>

          {FIELD_KEYS.map((key) => {
            const field = scan.fields[key];
            if (!field) return null;
            const id = `field-${key}`;
            const notStated = field.status === "not_stated" && !initial[key] && !adding.has(key) && !values[key];
            return (
              <div key={key} className="flex flex-col gap-2 border-b border-border px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={id} className="font-semibold">
                    {t(`field.${key}` as MessageKey)}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {isEdited(key) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-match-bd bg-match-bg px-2 py-0.5 text-eyebrow text-match-fg">
                        <EditIcon />
                        {t("review.edited")}
                      </span>
                    )}
                    {field.status !== "not_stated" && !isEdited(key) && <ConfidenceBadge field={field} />}
                  </div>
                </div>
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
                    placeholder={field.status === "unreadable" ? t("review.unreadable") : undefined}
                    className={`${inputClass} ${MONO.includes(key) ? "font-mono" : ""}`}
                  />
                )}
                {field.evidence && (
                  <p className="m-0 text-sm text-muted">{t("review.readFrom", { evidence: field.evidence })}</p>
                )}
                {key === "dose" && field.status === "stated" && (
                  <p className="m-0 text-sm text-muted">{t("review.doseNote")}</p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <Link to="/scan" className="inline-flex min-h-control items-center gap-2 font-medium">
              <ArrowLeftIcon />
              {t("review.back")}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted">{t("review.missingHint")}</span>
              <Button disabled={busy} onClick={next}>
                {t("review.next")}
                <ArrowRightIcon />
              </Button>
            </div>
          </div>
          {error && (
            <div className="px-6 pb-5">
              <Notice tone="error">{t(`error.${errorCode(error)}` as MessageKey)}</Notice>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function ReviewPage() {
  const { id = "" } = useParams();
  const scan = useScan(id);
  if (scan.isPending) return <p role="status" className="text-muted">{t("app.loading")}</p>;
  if (scan.isError) return <NotFoundPage />;
  return <ReviewForm scan={scan.data} />;
}
