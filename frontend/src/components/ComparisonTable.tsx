import { useState } from "react";
import type { Comparison, RowStatus } from "../api/scans";
import { t, type MessageKey } from "../i18n";
import { MatchIcon, MismatchIcon, NotApplicableIcon, NotStatedIcon, PartialIcon } from "./icons";

const ROW_STATUS: Record<RowStatus, { Icon: typeof MatchIcon; cls: string }> = {
  match: { Icon: MatchIcon, cls: "font-semibold text-match-fg" },
  partial: { Icon: PartialIcon, cls: "font-semibold text-partial-fg" },
  mismatch: { Icon: MismatchIcon, cls: "font-semibold text-mismatch-fg" },
  missing: { Icon: NotStatedIcon, cls: "font-semibold text-missing-fg" },
  na: { Icon: NotApplicableIcon, cls: "text-muted" },
};

// The label next to each studied preparation; shared by the result page and expert review.
export function ComparisonTable({ comparisons }: { comparisons: Comparison[] }) {
  const [index, setIndex] = useState(0);
  const prep = comparisons[index];
  if (!prep) return null;
  return (
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
            {comparisons.map((c, i) => (
              <button
                key={c.reference_id}
                type="button"
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={`flex min-h-control min-w-0 flex-[1_1_220px] flex-col items-start gap-0.5 rounded-control px-3.5 py-2.5 text-left text-text ${
                  i === index ? "border-2 border-accent bg-accent-weak" : "border border-border-2 bg-surface"
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
                  <td className="border-b border-border px-4 py-3 align-top">{row.reference ?? t("result.notApplicable")}</td>
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
  );
}
