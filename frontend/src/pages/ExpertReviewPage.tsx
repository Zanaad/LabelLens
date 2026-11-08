import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorCode } from "../api/client";
import { useRateVerdict, useReview, useReviewQueue, type RatingValue, type ReviewDetail } from "../api/reviews";
import { FIELD_KEYS, type VerdictCode } from "../api/scans";
import { ComparisonTable } from "../components/ComparisonTable";
import { ArrowLeftIcon, ArrowRightIcon, ReviewIcon } from "../components/icons";
import { Button, ButtonLink, Eyebrow, Notice, inputClass } from "../components/ui";
import { VERDICT_OPTIONS, VerdictChip, say } from "../components/verdict";
import { formatDate, t, type MessageKey } from "../i18n";
import { NotFoundPage } from "./StatusPages";

type Filter = "pending" | "mine";
const panel = "flex min-w-0 flex-col gap-3 rounded-control border border-border bg-surface"; // tables run edge to edge
const card = `${panel} p-6`;
const RATINGS: RatingValue[] = ["agree", "disagree", "unsure"];

export function ReviewQueuePage() {
  const queue = useReviewQueue();
  const [filter, setFilter] = useState<Filter>("pending");
  const all = queue.data ?? [];
  // Every result is in exactly one list; asked-about ones sit first in "To review", tagged.
  const shown = all.filter((r) => (filter === "pending" ? !r.my_rating : !!r.my_rating));
  const filters: [Filter, MessageKey][] = [
    ["pending", "queue.toReview"],
    ["mine", "queue.reviewed"],
  ];
  const th = "border-b border-border px-3 py-2.5 text-left font-semibold first:pl-6 last:pr-6";
  const td = "border-b border-border px-3 py-2.5 text-left first:pl-6 last:pr-6";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1.5">
        <Eyebrow>{t("queue.eyebrow")}</Eyebrow>
        <h1 className="m-0 text-page font-semibold">{t("queue.title")}</h1>
        <p className="m-0 max-w-[75ch] text-muted">{t("queue.intro")}</p>
      </section>
      <section aria-label={t("queue.title")} className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <div role="group" aria-label={t("queue.filter")} className="flex flex-wrap gap-2">
            {filters.map(([f, label]) => (
              <Button key={f} variant={filter === f ? "primary" : "secondary"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(label)}
              </Button>
            ))}
          </div>
          <span aria-live="polite" className="text-sm text-muted">
            {t("queue.count", { n: shown.length, total: all.length })}
          </span>
        </div>
        {queue.isPending ? (
          <p role="status" className="m-0 px-6 pb-6 text-muted">
            {t("app.loading")}
          </p>
        ) : shown.length === 0 ? (
          <p className="m-0 px-6 pb-6 text-muted">{t("queue.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-2">
                  {(["colProduct", "colHerb", "colVerdict", "colChecked", "colRating", "colRatings"] as const).map((k) => (
                    <th key={k} scope="col" className={th}>
                      {t(`queue.${k}`)}
                    </th>
                  ))}
                  <th scope="col" className={th}>
                    <span className="sr-only">{t("queue.open")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.verdict_id} className="hover:bg-surface-2">
                    <th scope="row" className={`${td} font-semibold`}>
                      {r.product_name ?? t("result.unnamed")}
                      <span className="block font-mono text-xs font-normal text-muted">{r.scan_id.slice(0, 8).toUpperCase()}</span>
                      {r.requested && (
                        <span className="mt-1 flex items-center gap-1.5 text-sm font-normal">
                          <ReviewIcon size={16} />
                          {t("queue.askedTag")}
                        </span>
                      )}
                    </th>
                    <td className={td}>{r.plant ?? "–"}</td>
                    <td className={td}>
                      <VerdictChip verdict={r.verdict} internal />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(r.checked_at)}</td>
                    <td className={td}>{r.my_rating ? t(`rating.${r.my_rating}`) : <span className="text-muted">–</span>}</td>
                    <td className={`${td} font-mono`}>{r.ratings}</td>
                    <td className={td}>
                      <ButtonLink to={`/review/${r.verdict_id}`} variant="secondary" className="min-h-10 px-3 py-1.5 text-body-sm">
                        {t("queue.open")}
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function RatingForm({ verdictId, review, nextId }: { verdictId: string; review: ReviewDetail; nextId: string | undefined }) {
  const navigate = useNavigate();
  const rate = useRateVerdict(verdictId);
  const mine = review.my_rating;
  const [rating, setRating] = useState<RatingValue | null>(mine?.rating ?? null);
  const [correct, setCorrect] = useState<VerdictCode | "">(mine?.correct_verdict ?? "");
  const [reason, setReason] = useState(mine?.reason ?? "");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    rate.mutate({
      rating,
      correct_verdict: rating === "disagree" ? correct || null : null,
      reason: reason.trim() || null,
    });
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="rate-title" className={card}>
      <h2 id="rate-title" className="m-0 text-xl font-semibold">
        {t("queue.yourReview")}
      </h2>
      {rate.isError && <Notice tone="error">{t(`error.${errorCode(rate.error)}` as MessageKey)}</Notice>}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 p-0 font-semibold">{t("queue.question")}</legend>
        <div className="flex flex-wrap gap-3">
          {RATINGS.map((r) => (
            <label key={r} className="inline-flex min-h-control items-center gap-2 rounded-control border border-border-2 px-3">
              <input type="radio" name="rating" value={r} checked={rating === r} onChange={() => setRating(r)} className="h-5 w-5 accent-accent" />
              {t(`rating.${r}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {rating === "disagree" && (
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("queue.correct")}
          <select required value={correct} onChange={(e) => setCorrect(e.target.value as VerdictCode)} className={`${inputClass} font-normal`}>
            <option value="" />
            {VERDICT_OPTIONS.filter(([v]) => v !== review.verdict.verdict).map(([v, label]) => (
              <option key={v} value={v}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1.5 font-semibold">
        <span>
          {t("queue.reason")} <span className="font-normal text-muted">{t("form.optional")}</span>
        </span>
        <textarea rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} font-normal`} />
        <span className="text-sm font-normal text-muted">{t("queue.reasonHint")}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!rating || rate.isPending}>
          {t("queue.save")}
        </Button>
        <span aria-live="polite" className="text-sm text-match-fg">
          {rate.isSuccess ? t("queue.saved") : ""}
        </span>
        {rate.isSuccess && nextId && (
          <Button variant="secondary" onClick={() => navigate(`/review/${nextId}`)}>
            {t("queue.toReview")}
            <ArrowRightIcon />
          </Button>
        )}
      </div>
    </form>
  );
}

export function ReviewDetailPage() {
  const { id = "" } = useParams();
  const review = useReview(id);
  const queue = useReviewQueue();
  if (review.isError) return <NotFoundPage />;
  if (review.isPending) return <p role="status" className="text-muted">{t("app.loading")}</p>;
  const r = review.data;
  const nextId = queue.data?.find((item) => !item.my_rating && item.verdict_id !== id)?.verdict_id;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/review" className="inline-flex min-h-control items-center gap-2 self-start font-medium">
        <ArrowLeftIcon />
        {t("queue.back")}
      </Link>
      <section className="flex flex-col gap-1.5">
        <Eyebrow>{t("queue.eyebrow")}</Eyebrow>
        <h1 className="m-0 text-page font-semibold">{r.product_name ?? t("result.unnamed")}</h1>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="label-title" className={`${card} flex-[1_1_380px]`}>
          <h2 id="label-title" className="m-0 text-xl font-semibold">
            {t("queue.labelTitle")}
          </h2>
          <div className="flex justify-center rounded-control bg-photo p-4">
            {r.has_image ? (
              <img src={`/api/reviews/${id}/image`} alt={t("review.imageAlt")} className="max-h-[520px] max-w-full rounded-inner object-contain" />
            ) : (
              <pre className="m-0 w-full rounded-inner bg-surface p-5 font-mono text-sm whitespace-pre-wrap">{r.label_text}</pre>
            )}
          </div>
          <h3 className="m-0 mt-2 text-lg font-semibold">{t("queue.fieldsTitle")}</h3>
          <dl className="m-0 grid grid-cols-[minmax(140px,40%)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-sm">
            {FIELD_KEYS.map((k) => {
              const value = r.fields[k]?.status === "stated" ? r.fields[k]?.value : null;
              return (
                <div key={k} className="contents">
                  <dt className="text-muted">{t(`field.${k}` as MessageKey)}</dt>
                  <dd className={`m-0 ${value ? "" : "text-missing-fg italic"}`}>{value ?? t("review.notStated")}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <div className="flex min-w-0 flex-[1.3_1_480px] flex-col gap-6">
          <section aria-labelledby="verdict-title" className={card}>
            <h2 id="verdict-title" className="m-0 text-xl font-semibold">
              {t("queue.verdictTitle")}
            </h2>
            <div className="flex flex-wrap items-center gap-2.5">
              <VerdictChip verdict={r.verdict.verdict} internal />
            </div>
            <p className="m-0">{t(`result.short.${r.verdict.verdict}` as MessageKey)}</p>
            <ol className="m-0 flex list-decimal flex-col gap-2 pl-[22px]">
              {r.verdict.reasons.map((reason, i) => (
                <li key={i} className="pl-1">
                  {say("reason", reason)}
                </li>
              ))}
            </ol>
            {r.verdict.review_requested_at && (
              <div className="rounded-control border border-border bg-surface-2 p-4">
                <p className="m-0 inline-flex items-center gap-2 font-semibold">
                  <ReviewIcon size={18} />
                  {t("queue.pharmacistQuestion")}
                </p>
                <p className="m-0 mt-1">{r.verdict.review_question ? `“${r.verdict.review_question}”` : t("queue.askedTag")}</p>
              </div>
            )}
          </section>
          <RatingForm key={id} verdictId={id} review={r} nextId={nextId} />
        </div>
      </div>
      <ComparisonTable comparisons={r.verdict.comparisons} />
    </div>
  );
}
