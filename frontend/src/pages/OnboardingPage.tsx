import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUpdateProfile } from "../api/auth";
import { useCurrentUser } from "../app/guards";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CannotSayIcon,
  CapsuleIcon,
  MatchIcon,
  PartialIcon,
} from "../components/icons";
import { Button, Checkbox, Eyebrow, Field } from "../components/ui";
import { t } from "../i18n";

const VERDICTS = [
  { Icon: MatchIcon, cls: "text-match-fg", label: t("verdict.matches") },
  { Icon: PartialIcon, cls: "text-partial-fg", label: t("verdict.partly") },
  { Icon: CannotSayIcon, cls: "text-cannot-fg", label: t("verdict.cannotSay") },
];

export function OnboardingPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const update = useUpdateProfile();
  const [step, setStep] = useState(1);
  const [ack, setAck] = useState(false);
  const [organisation, setOrganisation] = useState(user.organisation ?? "");

  const finish = () =>
    update.mutate(
      { organisation: organisation || null, onboarded: true },
      { onSuccess: () => navigate("/scan", { replace: true }) },
    );

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 pt-4">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("onboarding.progress", { name: user.full_name.split(" ")[0]!, step })}</Eyebrow>
        <div
          role="progressbar"
          aria-label={t("onboarding.progressLabel")}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step}
          className="flex gap-1.5"
        >
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-border"}`} />
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-[18px] rounded-control border border-border bg-surface p-8">
        {step === 1 && (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-h1 font-semibold">{t("onboarding.s1Title")}</h1>
              <span className="inline-flex items-center gap-[5px] rounded-full border border-accent bg-accent-weak px-2 py-0.5 text-sm font-semibold whitespace-nowrap">
                <CapsuleIcon />
                {t("role.pharmacist")}
              </span>
            </div>
            <p className="m-0">{t("onboarding.s1Body")}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {VERDICTS.map(({ Icon, cls, label }) => (
                <li key={label} className={`flex items-center gap-2.5 font-semibold ${cls}`}>
                  <Icon />
                  <span className="text-text">{label}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-muted">{t("onboarding.s1Never")}</p>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3.5">
            <h1 className="m-0 text-h1 font-semibold">{t("onboarding.s2Title")}</h1>
            <p className="m-0">{t("onboarding.s2Body")}</p>
            <div className="flex items-start gap-2.5 rounded-control border border-partial-bd bg-partial-bg p-4 font-medium text-partial-fg">
              <AlertIcon />
              {t("onboarding.s2Warning")}
            </div>
            <Checkbox label={t("onboarding.s2Ack")} checked={ack} onChange={(e) => setAck(e.target.checked)} />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3.5">
            <h1 className="m-0 text-h1 font-semibold">{t("onboarding.s3Title")}</h1>
            <p className="m-0 text-muted">{t("onboarding.s3Body")}</p>
            <Field
              label={t("onboarding.s3Org")}
              autoComplete="organization"
              maxLength={200}
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
            />
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-[18px]">
          {step === 1 ? (
            <Button variant="secondary" className="border-transparent bg-transparent text-link underline" onClick={finish}>
              {t("onboarding.skip")}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeftIcon />
              {t("onboarding.back")}
            </Button>
          )}
          {step < 3 ? (
            <Button disabled={step === 2 && !ack} onClick={() => setStep(step + 1)}>
              {t("onboarding.continue")}
              <ArrowRightIcon />
            </Button>
          ) : (
            <Button disabled={update.isPending} onClick={finish}>
              {t("onboarding.finish")}
              <ArrowRightIcon />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
