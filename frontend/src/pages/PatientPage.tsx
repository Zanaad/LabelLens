import { useLocation } from "react-router-dom";
import { useSharedView, type SharedView, type VerdictCode } from "../api/scans";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/HeaderControls";
import { LockIcon, PrinterIcon } from "../components/icons";
import { Button, initials } from "../components/ui";
import { VERDICT } from "../components/verdict";
import { formatDate, t, type MessageKey } from "../i18n";

// Plain-language wording per verdict. TODO(expert): a pharmacist on the team should check it.
const cannotAsk: MessageKey[] = ["patient.cannot.ask1", "patient.cannot.ask2"];
const PATIENT: Record<VerdictCode, { head: MessageKey; body: MessageKey[]; ask: MessageKey[] }> = {
  matches: {
    head: "patient.matches.head",
    body: ["patient.matches.body1", "patient.matches.body2"],
    ask: ["patient.matches.ask1"],
  },
  partly_matches: {
    head: "patient.partly.head",
    body: ["patient.partly.body1", "patient.partly.body2"],
    ask: ["patient.partly.ask1", "patient.partly.ask2"],
  },
  cannot_say: { head: "patient.cannot.head", body: ["patient.cannot.body1", "patient.cannot.body2"], ask: cannotAsk },
  differs: { head: "patient.cannot.head", body: ["patient.differs.body1", "patient.differs.body2"], ask: cannotAsk },
  not_covered: { head: "patient.notCovered.head", body: ["patient.notCovered.body1"], ask: ["patient.cannot.ask1"] },
};

function SharedResult({ view }: { view: SharedView }) {
  const v = VERDICT[view.verdict];
  const text = PATIENT[view.verdict];
  const herb = view.plant ?? t("patient.thisHerb");
  const section = "flex flex-col gap-2";
  return (
    <>
      <section
        aria-label={t("patient.sharedBy")}
        className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-control border border-border bg-surface px-5 py-4"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-accent text-lg font-bold text-on-accent"
        >
          {initials(view.shared_by)}
        </span>
        <div className="min-w-0 flex-[1_1_260px]">
          <p className="m-0 text-lg font-semibold">{t("patient.sharedBy")}</p>
          <p className="m-0 text-base text-muted">
            {t("patient.meta", {
              who: [view.shared_by, view.organisation].filter(Boolean).join(", "),
              date: formatDate(view.shared_at),
              until: formatDate(view.expires_at),
            })}
          </p>
        </div>
      </section>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-lg text-muted">{t("patient.about")}</p>
        <h1 className="m-0 text-page leading-tight font-semibold">{view.product_name ?? t("patient.yourProduct")}</h1>
      </div>
      <section aria-labelledby="pv-head" className={`flex items-start gap-5 rounded-control border p-7 ${v.cls}`}>
        <v.Icon size={36} />
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-base font-semibold">{t(v.title)}</p>
          <h2 id="pv-head" className="m-0 text-2xl leading-snug font-semibold text-text">
            {t(text.head, { herb })}
          </h2>
        </div>
      </section>
      <section aria-labelledby="pv-why" className={section}>
        <h2 id="pv-why" className="m-0 text-2xl font-semibold">
          {t("patient.whatMeans")}
        </h2>
        {text.body.map((k) => (
          <p key={k} className="m-0">
            {t(k, { herb })}
          </p>
        ))}
      </section>
      <section aria-labelledby="pv-do" className={section}>
        <h2 id="pv-do" className="m-0 text-2xl font-semibold">
          {t("patient.whatDo")}
        </h2>
        {text.ask.map((k) => (
          <p key={k} className="m-0">
            {t(k)}
          </p>
        ))}
      </section>
      <section aria-labelledby="pv-not" className={section}>
        <h2 id="pv-not" className="m-0 text-2xl font-semibold">
          {t("patient.cannotTell")}
        </h2>
        <p className="m-0">{t("patient.cannotTellBody")}</p>
      </section>
      <p className="m-0 font-semibold">{t("app.disclaimer")}.</p>
      <div className="no-print">
        <Button onClick={() => window.print()}>
          <PrinterIcon />
          {t("patient.print")}
        </Button>
      </div>
    </>
  );
}

export function PatientPage() {
  const token = useLocation().hash.slice(1);
  const view = useSharedView(token);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-x-5 gap-y-2 px-6 py-2.5">
          <Brand />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-2 px-3 py-1.5 text-sm font-medium">
              <LockIcon />
              {t("patient.readOnly")}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-reading flex-[1_0_auto] flex-col gap-7 px-6 pt-10 pb-16 text-xl leading-relaxed">
        {view.isSuccess ? (
          <SharedResult view={view.data} />
        ) : view.isPending && token ? (
          <p role="status" className="text-muted">
            {t("app.loading")}
          </p>
        ) : (
          <section className="flex flex-col gap-2">
            <h1 className="m-0 text-page font-semibold">{t("patient.invalidTitle")}</h1>
            <p className="m-0">{t("patient.invalidBody")}</p>
          </section>
        )}
      </main>
      <footer className="no-print border-t border-border bg-surface">
        <div className="mx-auto flex max-w-reading flex-col gap-2 px-6 py-7 text-sm text-muted">
          <p className="m-0">
            <strong className="text-text">{t("app.disclaimer")}.</strong> {t("patient.footer")}
          </p>
          <p className="m-0">{t("patient.footerShared")}</p>
        </div>
      </footer>
    </div>
  );
}
