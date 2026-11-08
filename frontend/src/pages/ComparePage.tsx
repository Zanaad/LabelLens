import { Link, useSearchParams } from "react-router-dom";
import { FIELD_KEYS, useScan, useScans, useVerdict, type FieldKey, type Scan, type ScanListItem, type Verdict } from "../api/scans";
import { MatchIcon, MismatchIcon, NotStatedIcon } from "../components/icons";
import { ButtonLink, Eyebrow, inputClass } from "../components/ui";
import { VERDICT, VerdictChip } from "../components/verdict";
import { formatDate, t, type MessageKey } from "../i18n";
import { NotFoundPage } from "./StatusPages";

const card = "flex min-w-0 flex-col rounded-control border border-border bg-surface";
const MONO: FieldKey[] = ["extract_ratio", "batch", "expiry"];

const nameOf = (s: ScanListItem) => s.product_name ?? s.plant ?? t("result.unnamed");
const scanName = (s: Scan) => s.product_name ?? s.fields.plant?.value ?? t("result.unnamed");
const norm = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function Value({ value, mono }: { value: string | null | undefined; mono: boolean }) {
  if (!value) {
    return (
      <span className="inline-flex items-center gap-2 italic text-missing-fg">
        <NotStatedIcon />
        {t("review.notStated")}
      </span>
    );
  }
  return <span className={mono ? "font-mono" : ""}>{value}</span>;
}

function ProductCard({ scan, verdict }: { scan: Scan; verdict: Verdict }) {
  const v = VERDICT[verdict.verdict];
  return (
    <section className={`${card} flex-[1_1_320px] gap-3 p-6`} aria-label={scanName(scan)}>
      <h2 className="m-0 text-xl font-semibold">{scanName(scan)}</h2>
      <div className="flex flex-wrap items-center gap-2.5">
        <VerdictChip verdict={verdict.verdict} />
        <span className="font-semibold">{t(v.title)}</span>
      </div>
      <p className="m-0">{t(`result.short.${verdict.verdict}` as MessageKey)}</p>
      <p className="m-0 text-sm text-muted">
        {t("compare.leftOut")}: <strong>{verdict.missing.filter((m) => m.code !== "leaflet").length}</strong>
      </p>
      <ButtonLink to={`/scans/${scan.id}/result`} variant="secondary" className="self-start">
        {t("compare.openResult")}
      </ButtonLink>
    </section>
  );
}

function Comparison({ a, b }: { a: string; b: string }) {
  const scanA = useScan(a);
  const scanB = useScan(b);
  const verdictA = useVerdict(a);
  const verdictB = useVerdict(b);
  if (scanA.isError || scanB.isError || verdictA.isError || verdictB.isError) return <NotFoundPage />;
  if (!scanA.data || !scanB.data || !verdictA.data || !verdictB.data) {
    return <p role="status" className="text-muted">{t("app.loading")}</p>;
  }
  const [x, y] = [scanA.data, scanB.data];
  return (
    <>
      <div className="flex flex-wrap items-stretch gap-6">
        <ProductCard scan={x} verdict={verdictA.data} />
        <ProductCard scan={y} verdict={verdictB.data} />
      </div>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[720px] border-collapse text-body-sm">
          <caption className="sr-only">{t("compare.caption")}</caption>
          <thead>
            <tr className="bg-surface-2 text-left">
              <th scope="col" className="border-b border-border py-2.5 pr-3 pl-6 font-semibold">{t("compare.fieldCol")}</th>
              <th scope="col" className="border-b border-border px-3 py-2.5 font-semibold">{scanName(x)}</th>
              <th scope="col" className="border-b border-border px-3 py-2.5 font-semibold">{scanName(y)}</th>
              <th scope="col" className="border-b border-border py-2.5 pr-6 pl-3 font-semibold">{t("compare.diffCol")}</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_KEYS.map((key) => {
              const [va, vb] = [x.fields[key]?.value, y.fields[key]?.value];
              const state = !va && !vb ? "neither" : norm(va) === norm(vb) ? "same" : "differs";
              return (
                <tr key={key}>
                  <th scope="row" className="border-b border-border py-2.5 pr-3 pl-6 text-left font-semibold">
                    {t(`field.${key}` as MessageKey)}
                  </th>
                  <td className="border-b border-border px-3 py-2.5"><Value value={va} mono={MONO.includes(key)} /></td>
                  <td className="border-b border-border px-3 py-2.5"><Value value={vb} mono={MONO.includes(key)} /></td>
                  <td className="border-b border-border py-2.5 pr-6 pl-3">
                    {state === "differs" ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-mismatch-fg">
                        <MismatchIcon />
                        {t("compare.differs")}
                      </span>
                    ) : state === "same" ? (
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <MatchIcon />
                        {t("compare.same")}
                      </span>
                    ) : (
                      <span className="text-muted">{t("compare.neither")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="m-0 text-sm text-muted">{t("compare.doseNote")}</p>
    </>
  );
}

function ScanSelect({ label, value, scans, onChange }: { label: string; value: string; scans: ScanListItem[]; onChange: (id: string) => void }) {
  return (
    <label className="flex flex-[1_1_260px] flex-col gap-1.5 text-sm font-semibold">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} font-normal`}>
        <option value="">{t("compare.choose")}</option>
        {scans.map((s) => (
          <option key={s.id} value={s.id}>
            {nameOf(s)} · {formatDate(s.created_at)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ComparePage() {
  const [params, setParams] = useSearchParams();
  const scans = useScans();
  const [a, b] = [params.get("a") ?? "", params.get("b") ?? ""];
  const set = (key: "a" | "b") => (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set(key, id);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  // Only scans with a stored verdict can be compared.
  const checked = scans.data?.filter((s) => s.verdict !== null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t("detail.breadcrumb")}>
        <Link to="/scans">{t("nav.myScans")}</Link>
      </nav>
      <section className="flex flex-col gap-1.5">
        <Eyebrow>{t("compare.eyebrow")}</Eyebrow>
        <h1 className="m-0 text-page font-semibold">{t("compare.title")}</h1>
        <p className="m-0 max-w-[70ch] text-muted">{t("compare.intro")}</p>
      </section>

      {scans.isPending ? (
        <p role="status" className="text-muted">{t("app.loading")}</p>
      ) : scans.isError ? (
        <p role="alert">{t("error.generic")}</p>
      ) : checked.length < 2 ? (
        <p className="m-0 text-muted">{t("compare.tooFew")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <ScanSelect label={t("compare.first")} value={a} scans={checked} onChange={set("a")} />
            <ScanSelect label={t("compare.second")} value={b} scans={checked} onChange={set("b")} />
          </div>
          {!a || !b ? (
            <p role="status" className="m-0 text-muted">{t("compare.needTwo")}</p>
          ) : a === b ? (
            <p role="status" className="m-0 text-muted">{t("compare.sameScan")}</p>
          ) : (
            <Comparison key={`${a}|${b}`} a={a} b={b} />
          )}
        </>
      )}
    </div>
  );
}
