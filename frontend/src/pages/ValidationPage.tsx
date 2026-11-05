import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ErrorBar, Rectangle, Tooltip, XAxis, YAxis } from "recharts";
import { useMe } from "../api/auth";
import { errorCode } from "../api/client";
import { FIELD_KEYS, type FieldKey, type VerdictCode } from "../api/scans";
import { useRun, useRuns, useStartRun, type Confusion, type Metrics, type Rate, type Run } from "../api/validation";
import { Button, Checkbox, Eyebrow, Notice } from "../components/ui";
import { VERDICT_OPTIONS } from "../components/verdict";
import { formatDateTime, t, type MessageKey } from "../i18n";

const card = "flex min-w-0 flex-col gap-4 rounded-control border border-border bg-surface p-6";
const th = "border-b border-border px-3 py-2 text-left font-semibold first:pl-0";
const td = "border-b border-border px-3 py-2 text-left first:pl-0";
const SMALL_SAMPLE = 30;
const ROW_HEIGHT = 44;
const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 100));

type BarRow = { name: string; value: number; ci: [number, number]; rate: Rate; main: boolean };

const toRow = (name: string, rate: Rate, main: boolean): BarRow => {
  const value = pct(rate.accuracy) ?? 0;
  const [lo, hi] = rate.ci ?? [rate.accuracy ?? 0, rate.accuracy ?? 0];
  // ErrorBar takes distances from the bar end: [below, above].
  return { name, value, ci: [value - Math.round(lo * 100), Math.round(hi * 100) - value], rate, main };
};

function rateText(rate: Rate) {
  if (!rate.total) return t("val.na");
  return `${pct(rate.accuracy)}% · ${t("val.of", { correct: rate.correct, total: rate.total })}`;
}

function rangeText(rate: Rate, bare = false) {
  if (!rate.ci) return "–";
  const [low, high] = [pct(rate.ci[0])!, pct(rate.ci[1])!];
  return bare ? `${low}–${high}%` : t("val.ci", { low, high });
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) {
  const row = active ? (payload?.[0]?.payload as BarRow | undefined) : undefined;
  if (!row) return null;
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 text-sm">
      <p className="m-0 font-semibold">{row.name}</p>
      <p className="m-0">{rateText(row.rate)}</p>
      <p className="m-0 text-muted">{rangeText(row.rate)}</p>
    </div>
  );
}

// Horizontal bars of a share (0-100%) with 95% range whiskers; values sit in the axis labels.
function RateBars({ rows, label }: { rows: BarRow[]; label: string }) {
  return (
    <div role="img" aria-label={label}>
      <BarChart
        layout="vertical"
        data={rows}
        responsive
        style={{ width: "100%", height: rows.length * ROW_HEIGHT + 36 }}
        margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--ll-border)" />
        <XAxis
          type="number"
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          unit="%"
          stroke="var(--ll-border)"
          tick={{ fill: "var(--ll-muted)", fontSize: 13 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={300}
          stroke="var(--ll-border)"
          tickFormatter={(name: string) => {
            const row = rows.find((r) => r.name === name)!;
            return `${name}  ${row.rate.total ? `${row.value}%` : "–"}`;
          }}
          tick={{ fill: "var(--ll-text)", fontSize: 14 }}
        />
        <Tooltip content={BarTooltip} cursor={{ fill: "var(--ll-surface-2)" }} />
        <Bar
          dataKey="value"
          barSize={18}
          isAnimationActive={false}
          shape={(props) => (
            <Rectangle
              {...props}
              radius={[0, 4, 4, 0]}
              fill={(props.payload as BarRow).main ? "var(--ll-chart-main)" : "var(--ll-chart-context)"}
            />
          )}
        >
          <ErrorBar dataKey="ci" direction="x" width={8} stroke="var(--ll-muted)" strokeWidth={1.5} />
        </Bar>
      </BarChart>
    </div>
  );
}

function Tile({ label, rate, extra }: { label: string; rate: Rate; extra?: string }) {
  return (
    <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 rounded-control border border-border bg-surface p-5">
      <span className="text-body-sm text-muted">{label}</span>
      <span className="text-stat font-semibold">{rate.total ? `${pct(rate.accuracy)}%` : "–"}</span>
      <span className="text-sm text-muted">
        {rate.total ? `${t("val.of", { correct: rate.correct, total: rate.total })} · ${rangeText(rate)}` : t("val.na")}
      </span>
      {extra && <span className="text-sm text-muted">{extra}</span>}
    </div>
  );
}

const verdictLabel = (v: VerdictCode) => t(VERDICT_OPTIONS.find(([code]) => code === v)![1]);

// Rows: expected verdict. Columns: what LabelLens said. One-hue ramp by count; text stays in text tokens.
function ConfusionMatrix({ confusion }: { confusion: Confusion }) {
  const codes = VERDICT_OPTIONS.map(([v]) => v);
  const max = Math.max(1, ...codes.flatMap((e) => codes.map((p) => confusion[e]?.[p] ?? 0)));
  const shade = (n: number) => {
    if (n === 0) return "bg-surface text-muted";
    const step = Math.ceil((n / max) * 4);
    return ["bg-shade-1 text-text", "bg-shade-2 text-text", "bg-shade-3 text-on-accent", "bg-shade-4 text-on-accent"][step - 1];
  };
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] border-separate border-spacing-0.5 text-body-sm">
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-left text-sm font-semibold text-muted">
              {t("val.expectedAxis")} ↓ / {t("val.predictedAxis")} →
            </th>
            {codes.map((p) => (
              <th key={p} scope="col" className="w-[15%] px-2 py-1 text-left text-sm font-semibold">
                {verdictLabel(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {codes.map((e) => (
            <tr key={e}>
              <th scope="row" className="px-2 py-1 text-left text-sm font-semibold">
                {verdictLabel(e)}
              </th>
              {codes.map((p) => {
                const n = confusion[e]?.[p] ?? 0;
                return (
                  <td
                    key={p}
                    className={`h-11 rounded-inner px-2 text-center font-mono ${shade(n)} ${e === p ? "outline-2 -outline-offset-2 outline-text" : ""}`}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunView({ run }: { run: Run }) {
  const m: Metrics = run.metrics;
  const [mode, setMode] = useState<"end_to_end" | "rules_only">("end_to_end");
  const methods: [MessageKey, Rate, boolean][] = [
    ["val.method.end_to_end", m.verdicts.end_to_end, true],
    ["val.method.rules_only", m.verdicts.rules_only, true],
    ["val.method.plain_model", m.baselines.plain_model, false],
    ["val.method.keyword", m.baselines.keyword, false],
  ];
  const methodRows = methods.map(([k, rate, main]) => toRow(t(k), rate, main));
  const fieldRows = FIELD_KEYS.map((k) => toRow(t(`field.${k}` as MessageKey), m.fields[k], true));
  const expert = m.expert_ratings;
  const missing = (v: string | null) => v ?? t("val.nothing");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-xl font-semibold">{t("val.runOf", { date: formatDateTime(run.created_at) })}</h2>
        <p className="m-0 text-sm text-muted">
          {[t("val.versions", m.versions), run.started_by && t("val.by", { name: run.started_by })].filter(Boolean).join(" · ")}
        </p>
      </div>
      {m.dataset.include_drafts && <Notice tone="error">{t("val.draftsWarning")}</Notice>}
      {m.dataset.with_expected_verdict < SMALL_SAMPLE && <Notice>{t("val.smallSample", { n: m.dataset.with_expected_verdict })}</Notice>}
      {m.dataset.not_read.length > 0 && <Notice>{t("val.notRead", { n: m.dataset.not_read.length })}</Notice>}

      <div className="flex flex-wrap gap-4">
        <Tile label={t("val.tileVerdict")} rate={m.verdicts.end_to_end} />
        <Tile label={t("val.tileRules")} rate={m.verdicts.rules_only} />
        <Tile
          label={t("val.tileExpert")}
          rate={expert}
          extra={t("val.expertBody", { agree: expert.agree, disagree: expert.disagree, unsure: expert.unsure })}
        />
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 rounded-control border border-border bg-surface p-5">
          <span className="text-body-sm text-muted">{t("val.tileLabels")}</span>
          <span className="text-stat font-semibold">{m.dataset.labels}</span>
          <span className="text-sm text-muted">
            {t("val.labelsDetail", { expected: m.dataset.with_expected_verdict, read: m.dataset.read })}
          </span>
        </div>
      </div>

      <section aria-labelledby="methods-title" className={card}>
        <div className="flex flex-col gap-1">
          <h3 id="methods-title" className="m-0 text-lg font-semibold">
            {t("val.methodsTitle")}
          </h3>
          <p className="m-0 text-sm text-muted">{t("val.methodsIntro")}</p>
        </div>
        <RateBars rows={methodRows} label={t("val.methodsTitle")} />
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr>
              <th scope="col" className={th}>{t("val.colMethod")}</th>
              <th scope="col" className={th}>{t("val.colRight")}</th>
              <th scope="col" className={th}>{t("val.colRange")}</th>
            </tr>
          </thead>
          <tbody>
            {methodRows.map((r) => (
              <tr key={r.name}>
                <th scope="row" className={`${td} font-medium`}>{r.name}</th>
                <td className={td}>{rateText(r.rate)}</td>
                <td className={td}>{rangeText(r.rate, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="fields-title" className={card}>
        <div className="flex flex-col gap-1">
          <h3 id="fields-title" className="m-0 text-lg font-semibold">
            {t("val.fieldsTitle")}
          </h3>
          <p className="m-0 text-sm text-muted">{t("val.fieldsIntro")}</p>
        </div>
        <RateBars rows={fieldRows} label={t("val.fieldsTitle")} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-body-sm">
            <thead>
              <tr>
                {(["colField", "colRight", "colWrong", "colMissed", "colInvented"] as const).map((k) => (
                  <th key={k} scope="col" className={th}>
                    {t(`val.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELD_KEYS.map((k) => {
                const f = m.fields[k];
                return (
                  <tr key={k}>
                    <th scope="row" className={`${td} font-medium`}>{t(`field.${k}` as MessageKey)}</th>
                    <td className={td}>{rateText(f)}</td>
                    <td className={`${td} font-mono`}>{f.wrong}</td>
                    <td className={`${td} font-mono`}>{f.missed}</td>
                    <td className={`${td} font-mono ${f.invented ? "font-semibold text-partial-fg" : ""}`}>{f.invented}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-sm text-muted">{t("val.inventedHint")}</p>
      </section>

      <section aria-labelledby="confusion-title" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 id="confusion-title" className="m-0 text-lg font-semibold">
              {t("val.confusionTitle")}
            </h3>
            <p className="m-0 text-sm text-muted">{t("val.confusionIntro")}</p>
          </div>
          <div role="group" aria-label={t("val.confusionTitle")} className="flex flex-wrap gap-2">
            {(["end_to_end", "rules_only"] as const).map((k) => (
              <Button key={k} variant={mode === k ? "primary" : "secondary"} aria-pressed={mode === k} onClick={() => setMode(k)}>
                {t(`val.method.${k}`)}
              </Button>
            ))}
          </div>
        </div>
        <ConfusionMatrix confusion={m.verdicts[mode].confusion} />
      </section>

      <section aria-labelledby="failures-title" className={card}>
        <h3 id="failures-title" className="m-0 text-lg font-semibold">
          {t("val.failuresTitle")}
        </h3>
        {m.failures.length === 0 ? (
          <p className="m-0 text-muted">{t("val.failuresEmpty")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {m.failures.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 border-b border-border pb-3 text-body-sm">
                <strong>{f.title}</strong>
                {f.expected && (
                  <span>
                    {t("val.failExpected", { verdict: verdictLabel(f.expected) })} ·{" "}
                    {t("val.failGot", { method: t("val.method.rules_only"), verdict: verdictLabel(f.rules_only) })}
                    {f.end_to_end &&
                      ` · ${t("val.failGot", { method: t("val.method.end_to_end"), verdict: verdictLabel(f.end_to_end) })}`}
                  </span>
                )}
                {f.field_errors.map((e) => (
                  <span key={e.field} className="text-muted">
                    {t("val.fieldError", { field: t(`field.${e.field as FieldKey}` as MessageKey), read: missing(e.read), correct: missing(e.correct) })}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ValidationPage() {
  const runs = useRuns();
  const isAdmin = useMe().data?.role === "admin";
  const start = useStartRun();
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const current = selected ?? runs.data?.[0]?.id;
  const run = useRun(current);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[75ch] flex-col gap-1.5">
          <Eyebrow>{t("val.eyebrow")}</Eyebrow>
          <h1 className="m-0 text-page font-semibold">{t("val.title")}</h1>
          <p className="m-0 text-muted">{t("val.intro")}</p>
        </div>
        {isAdmin && (
          <div className="flex flex-col items-start gap-2">
            <Button disabled={start.isPending} onClick={() => start.mutate(includeDrafts, { onSuccess: (r) => setSelected(r.id) })}>
              {start.isPending ? t("val.running") : t("val.run")}
            </Button>
            <Checkbox label={t("val.includeDrafts")} checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />
          </div>
        )}
      </section>
      {start.isError && <Notice tone="error">{t(`error.${errorCode(start.error)}` as MessageKey)}</Notice>}

      {runs.isPending ? (
        <p role="status" className="text-muted">{t("app.loading")}</p>
      ) : !current ? (
        <Notice>{t("val.noRuns")}</Notice>
      ) : run.data ? (
        <RunView key={run.data.id} run={run.data} />
      ) : (
        <p role="status" className="text-muted">{t("app.loading")}</p>
      )}

      {runs.data && runs.data.length > 0 && (
        <section aria-labelledby="runs-title" className={card}>
          <h2 id="runs-title" className="m-0 text-lg font-semibold">
            {t("val.historyTitle")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body-sm">
              <thead>
                <tr>
                  {(["colDate", "colLabels", "colE2E", "colRules", "colRulesVersion"] as const).map((k) => (
                    <th key={k} scope="col" className={th}>
                      {t(`val.${k}`)}
                    </th>
                  ))}
                  <th scope="col" className={th}>
                    <span className="sr-only">{t("val.view")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className={`${td} font-medium whitespace-nowrap`}>
                      {formatDateTime(r.created_at)}
                    </th>
                    <td className={`${td} font-mono`}>{r.dataset_size}</td>
                    <td className={`${td} font-mono`}>{pct(r.end_to_end) ?? "–"}{r.end_to_end !== null && "%"}</td>
                    <td className={`${td} font-mono`}>{pct(r.rules_only) ?? "–"}{r.rules_only !== null && "%"}</td>
                    <td className={`${td} font-mono`}>{r.rules_version}</td>
                    <td className={td}>
                      {r.id === current ? (
                        <span className="text-sm text-muted">{t("val.viewing")}</span>
                      ) : (
                        <Button variant="secondary" className="min-h-10 px-3 py-1.5 text-body-sm" onClick={() => setSelected(r.id)}>
                          {t("val.view")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
