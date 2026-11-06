import type { ReactNode } from "react";
import { useMe } from "../api/auth";
import { PublicLayout } from "../components/AuthLayout";
import { DisclaimerPill } from "../components/HeaderControls";
import { ArrowRightIcon, BookIcon, EditIcon, LockIcon, UploadIcon } from "../components/icons";
import { ButtonLink, Eyebrow } from "../components/ui";
import { VERDICT } from "../components/verdict";
import { t, type MessageKey } from "../i18n";

const th = "border-b border-border px-3 py-2.5 text-left font-semibold first:pl-6 last:pr-6";
const td = "border-b border-border px-3 py-2.5 text-left align-top first:pl-6 last:pr-6";

const STEPS = [
  [UploadIcon, "about.step1", "about.what1"],
  [EditIcon, "about.step2", "about.what2"],
  [BookIcon, "about.step3", "about.what3"],
] as const;
const ANSWERS = [
  ["matches", "about.ansMatches"],
  ["partly_matches", "about.ansPartly"],
  ["cannot_say", "about.ansCannot"],
] as const;
const SOURCES = ["Ema", "Labels", "Code", "Fonts"] as const;

function Heading({ id, title, icon }: { id: string; title: MessageKey; icon?: ReactNode }) {
  return (
    <h2 id={id} className="m-0 flex items-center gap-2 text-xl font-semibold">
      {icon}
      {t(title)}
    </h2>
  );
}

function Bullets({ items }: { items: MessageKey[] }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-2.5 pl-5 text-body-sm marker:text-accent">
      {items.map((k) => (
        <li key={k}>{t(k)}</li>
      ))}
    </ul>
  );
}

// Public page; the register and invitation forms link here for the terms of use.
export function AboutPage() {
  const signedIn = Boolean(useMe().data);
  return (
    <PublicLayout>
      <main className="mx-auto flex w-full max-w-auth flex-[1_0_auto] flex-col gap-14 px-6 pt-12 pb-16">
        <div className="grid items-center gap-10 md:grid-cols-[3fr_2fr]">
          <header className="flex flex-col items-start gap-4">
            <Eyebrow>{t("about.eyebrow")}</Eyebrow>
            <h1 className="m-0 text-page font-semibold">{t("about.title")}</h1>
            <p className="m-0 text-lg">{t("about.why1")}</p>
            <p className="m-0 text-lg text-muted">{t("about.why2")}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <DisclaimerPill />
              <span className="text-sm text-muted">{t("about.built")}</span>
            </div>
          </header>
          <section aria-labelledby="about-answers" className="flex flex-col gap-3 rounded-control border border-border bg-surface p-6">
            <Heading id="about-answers" title="about.answersTitle" />
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {ANSWERS.map(([code, body]) => {
                const v = VERDICT[code];
                return (
                  <li key={code} className={`flex flex-col gap-1 rounded-inner border px-3.5 py-3 ${v.cls}`}>
                    <span className="flex items-center gap-2 font-semibold">
                      <v.Icon size={18} />
                      {t(v.title)}
                    </span>
                    <span className="text-body-sm text-text">{t(body)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section aria-labelledby="about-how" className="flex flex-col gap-6">
          <Heading id="about-how" title="about.howTitle" />
          <ol className="m-0 grid list-none gap-8 p-0 md:grid-cols-3">
            {STEPS.map(([Icon, title, body], i) => (
              <li key={title} className="flex flex-col gap-3 border-t-2 border-accent pt-5">
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-weak text-accent">
                    <Icon />
                  </span>
                  <span className="text-sm font-semibold text-muted">{t("about.stepOf", { n: i + 1 })}</span>
                </span>
                <h3 className="m-0 text-lg font-semibold">{t(title)}</h3>
                <p className="m-0 text-body-sm text-muted">{t(body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
          <section aria-labelledby="about-sources" className="flex min-w-0 flex-col gap-4 rounded-control border border-border bg-surface pt-6">
            <div className="px-6">
              <Heading id="about-sources" title="about.sourcesTitle" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-body-sm">
                <thead>
                  <tr className="bg-surface-2">
                    {(["about.colSource", "about.colUse", "about.colLicence"] as const).map((k) => (
                      <th key={k} scope="col" className={th}>
                        {t(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SOURCES.map((s) => (
                    <tr key={s} className="last:[&>*]:border-b-0">
                      <th scope="row" className={`${td} font-medium`}>
                        {t(`about.src${s}`)}
                      </th>
                      <td className={`${td} text-muted`}>{t(`about.src${s}Use`)}</td>
                      <td className={`${td} text-muted`}>{t(`about.src${s}Licence`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-labelledby="about-responsible" className="flex flex-col gap-4 rounded-control bg-surface-2 p-6">
            <Heading id="about-responsible" title="about.responsibleTitle" />
            <Bullets items={["about.resp1", "about.resp2", "about.never1", "about.never2", "about.never3"]} />
          </section>
        </div>

        <div className="grid gap-10 border-t border-border pt-10 md:grid-cols-2">
          <section aria-labelledby="about-terms" className="flex flex-col gap-4">
            <Heading id="about-terms" title="about.termsTitle" />
            <Bullets items={["about.terms1", "about.terms2", "about.terms3", "about.terms4", "about.terms5"]} />
          </section>
          <section aria-labelledby="about-data" className="flex flex-col gap-4">
            <Heading id="about-data" title="about.dataTitle" icon={<LockIcon size={18} />} />
            <Bullets items={["about.data1", "about.data2", "about.data3", "about.data4", "about.data5"]} />
          </section>
        </div>

        <section
          aria-labelledby="about-cta"
          className="flex flex-wrap items-center justify-between gap-6 rounded-control border border-accent bg-accent-weak p-8"
        >
          <div className="flex max-w-[56ch] flex-col gap-2">
            <h2 id="about-cta" className="m-0 text-xl font-semibold">
              {t(signedIn ? "about.ctaSignedInTitle" : "about.ctaTitle")}
            </h2>
            <p className="m-0 text-body-sm">{t(signedIn ? "about.ctaSignedInBody" : "about.ctaBody")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {signedIn ? (
              <ButtonLink to="/methods">
                {t("about.methods")}
                <ArrowRightIcon size={16} />
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/register">{t("about.register")}</ButtonLink>
                <ButtonLink to="/sign-in" variant="secondary">
                  {t("about.signIn")}
                </ButtonLink>
              </>
            )}
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
