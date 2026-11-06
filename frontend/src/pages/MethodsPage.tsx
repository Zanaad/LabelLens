import { Link } from "react-router-dom";
import { Eyebrow } from "../components/ui";
import { t } from "../i18n";

export function MethodsPage() {
  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-12 pb-8">
      <header className="grid gap-8 border-b border-border pb-10 md:grid-cols-[2fr_1fr] md:items-end">
        <div className="flex flex-col items-start gap-4">
          <Eyebrow>{t("methods.kicker")}</Eyebrow>
          <h1 className="m-0 max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">{t("methods.title")}</h1>
          <p className="m-0 max-w-xl text-lg leading-relaxed text-muted">{t("methods.intro")}</p>
        </div>
        <div className="flex flex-col items-start gap-3 border-l-2 border-accent pl-5">
          <span className="text-sm font-semibold text-muted">{t("methods.current")}</span>
          <p className="m-0 font-semibold">{t("methods.current.title")}</p>
          <Link to="/reference" className="text-sm underline underline-offset-4">{t("methods.reference")} <span aria-hidden="true">↗</span></Link>
        </div>
      </header>
      <section aria-labelledby="methods-flow">
        <h2 id="methods-flow" className="mb-6 mt-0 text-xl font-semibold">{t("methods.flow")}</h2>
        <ol className="m-0 grid list-none gap-8 p-0 md:grid-cols-3">
          {(["read", "review", "compare"] as const).map((step, i) => (
            <li key={step} className="border-t border-border pt-4">
              <span aria-hidden="true" className="font-mono text-sm text-muted">0{i + 1}</span>
              <h3 className="mb-2 mt-4 text-lg font-semibold">{t(`methods.${step}.title`)}</h3>
              <p className="m-0 leading-relaxed text-muted">{t(`methods.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>
      <aside className="grid gap-6 rounded-control border border-border bg-surface p-6 sm:p-8 md:grid-cols-2">
        <div>
          <Eyebrow>{t("methods.example")}</Eyebrow>
          <h2 className="mb-6 mt-3 text-2xl font-semibold">{t("methods.example.title")}</h2>
          <div className="border-l-2 border-accent pl-4">
            <p className="mb-2 mt-0 text-sm text-muted">{t("methods.example.label")}</p>
            <p className="m-0 font-mono text-sm">{t("methods.example.value")}</p>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-4">
          <p className="m-0 leading-relaxed text-muted">{t("methods.example.body")}</p>
          <p className="m-0 font-semibold">{t("methods.example.question")}</p>
        </div>
      </aside>
      <div className="grid gap-10 md:grid-cols-[3fr_2fr]">
        <section aria-labelledby="methods-verdicts">
          <h2 id="methods-verdicts" className="mb-5 mt-0 text-xl font-semibold">{t("methods.verdicts")}</h2>
          <dl className="m-0 divide-y divide-border">
            {(["match", "partial", "unknown"] as const).map((verdict) => (
              <div key={verdict} className="py-4 first:pt-0">
                <dt className="font-semibold">{t(`methods.${verdict}.title`)}</dt>
                <dd className="ml-0 mt-2 leading-relaxed text-muted">{t(`methods.${verdict}.body`)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <aside className="self-start rounded-control bg-surface-2 p-6">
          <h2 className="mb-3 mt-0 text-xl font-semibold">{t("methods.scope")}</h2>
          <p className="m-0 leading-relaxed text-muted">{t("methods.scope.body")}</p>
          <p className="mb-0 mt-5 border-t border-border pt-4 text-sm font-semibold">{t("methods.disclaimer")}</p>
        </aside>
      </div>
      <section className="border-t border-border pt-8" aria-labelledby="methods-release">
        <h2 id="methods-release" className="mb-3 mt-0 text-xl font-semibold">{t("methods.current.title")}</h2>
        <p className="mb-6 mt-0 max-w-3xl leading-relaxed text-muted">{t("methods.current.body")}</p>
        {(["demo", "evidence", "validation"] as const).map((item) => (
          <details key={item} className="group border-t border-border py-4">
            <summary className="cursor-pointer py-1 font-semibold">{t(`methods.${item}.title`)}</summary>
            <p className="mb-1 mt-3 max-w-3xl leading-relaxed text-muted">{t(`methods.${item}.body`)}</p>
          </details>
        ))}
      </section>
    </article>
  );
}
