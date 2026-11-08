import type { ResultItem, ReviewOpinion, Source, VerdictCode } from "../api/scans";
import { t, type MessageKey } from "../i18n";
import { CannotSayIcon, MatchIcon, PartialIcon, ReviewIcon } from "./icons";

type VerdictStyle = {
  Icon: typeof MatchIcon;
  cls: string;
  bd: string;
  fg: string;
  title: MessageKey;
  short: MessageKey;
};

const cannot = {
  Icon: CannotSayIcon,
  cls: "border-cannot-bd bg-cannot-bg text-cannot-fg",
  bd: "border-cannot-bd",
  fg: "text-cannot-fg",
  title: "verdict.cannotSay",
  short: "verdictShort.cannotSay",
} as const;

// Status colour always comes with an icon and text, never alone.
export const VERDICT: Record<VerdictCode, VerdictStyle> = {
  matches: {
    Icon: MatchIcon,
    cls: "border-match-bd bg-match-bg text-match-fg",
    bd: "border-match-bd",
    fg: "text-match-fg",
    title: "verdict.matches",
    short: "verdictShort.matches",
  },
  partly_matches: {
    Icon: PartialIcon,
    cls: "border-partial-bd bg-partial-bg text-partial-fg",
    bd: "border-partial-bd",
    fg: "text-partial-fg",
    title: "verdict.partly",
    short: "verdictShort.partly",
  },
  cannot_say: cannot,
  // TODO(expert): "differs" is shown as "cannot say" until the team decides how to present it.
  differs: cannot,
  not_covered: { ...cannot, title: "verdict.notCovered", short: "verdict.notCovered" },
};

// For expert and admin forms: every verdict the engine can give, including the internal "differs".
export const VERDICT_OPTIONS: [VerdictCode, MessageKey][] = [
  ["matches", "verdict.matches"],
  ["partly_matches", "verdict.partly"],
  ["cannot_say", "verdict.cannotSay"],
  ["not_covered", "verdict.notCovered"],
  ["differs", "verdict.differs"],
];

// The engine returns codes; field lists become field labels, other lists are joined with "or".
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

export const say = (prefix: "reason" | "question", item: ResultItem) =>
  t(`${prefix}.${item.code}` as MessageKey, vars(item.params));

export type SourceDoc = { title: string; section: string | null; url: string | null; verified: boolean };

// Several studied preparations often cite the same monograph: list each document once.
export function groupSources(sources: Source[]) {
  const docs: (SourceDoc & { key: string })[] = [];
  const number = new Map<string, number>(); // reference id -> source number
  for (const s of sources) {
    const title = s.source_doc ?? s.herb_latin;
    const key = [title, s.source_section, s.source_url].join("|");
    let doc = docs.find((d) => d.key === key);
    if (!doc) docs.push((doc = { key, title, section: s.source_section, url: s.source_url, verified: true }));
    doc.verified &&= s.verified;
    number.set(s.id, docs.indexOf(doc) + 1);
  }
  return { docs, number };
}

// `internal`: expert and admin screens name "differs" instead of showing it as "cannot say".
export function VerdictChip({ verdict, internal = false }: { verdict: VerdictCode; internal?: boolean }) {
  const v = VERDICT[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${v.cls}`}>
      <v.Icon size={16} />
      {internal && verdict === "differs" ? t("verdict.differs") : t(v.short)}
    </span>
  );
}

// Reviewer ratings shown next to the verdict; they advise the pharmacist and never replace it.
export function ReviewerOpinions({ reviews }: { reviews: ReviewOpinion[] }) {
  if (reviews.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-2 p-4">
      <h3 className="m-0 inline-flex items-center gap-2 text-base font-semibold">
        <ReviewIcon size={18} />
        {t("opinion.title")}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {reviews.map((r, i) => (
          <li key={i}>
            {t(`opinion.${r.rating}` as MessageKey)}
            {r.correct_verdict && ` ${t("opinion.suggests", { verdict: t(VERDICT[r.correct_verdict].title) })}`}
            {r.reason && <span className="block text-sm text-muted">“{r.reason}”</span>}
          </li>
        ))}
      </ul>
      <p className="m-0 text-sm text-muted">{t("opinion.note")}</p>
    </div>
  );
}
