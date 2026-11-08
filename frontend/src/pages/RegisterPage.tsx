import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRegister, useResendVerification } from "../api/auth";
import { errorCode } from "../api/client";
import { AuthHeading, AuthLayout } from "../components/AuthLayout";
import { Button, Checkbox, Field, Notice, PasswordField } from "../components/ui";
import { t, type MessageKey } from "../i18n";

// Shown after registering when the address must be confirmed first.
function CheckEmail({ email }: { email: string }) {
  const resend = useResendVerification();
  return (
    <AuthLayout>
      <AuthHeading title={t("register.checkTitle")} intro={t("register.checkBody", { email })} />
      <p className="m-0 text-muted">{t("register.checkSpam")}</p>
      {resend.isSuccess ? (
        <Notice tone="success">{t("register.resent")}</Notice>
      ) : (
        <Button variant="secondary" disabled={resend.isPending} onClick={() => resend.mutate(email)}>
          {t("register.resend")}
        </Button>
      )}
      <p className="m-0 text-center">
        <Link to="/sign-in">{t("register.signIn")}</Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    organisation: "",
    accept_privacy: false,
    accept_terms: false,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    register.mutate(form, {
      onSuccess: (user) => (user.email_verified ? navigate("/onboarding", { replace: true }) : setSentTo(user.email)),
    });
  }

  if (sentTo) return <CheckEmail email={sentTo} />;

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        <AuthHeading title={t("register.title")} intro={t("register.intro")} />
        {register.isError && (
          <Notice tone="error">{t(`error.${errorCode(register.error)}` as MessageKey)}</Notice>
        )}
        <Field label={t("register.fullName")} autoComplete="name" required maxLength={200} value={form.full_name} onChange={set("full_name")} />
        <Field
          label={t("register.workEmail")}
          type="email"
          autoComplete="email"
          placeholder={t("form.emailPlaceholder")}
          required
          value={form.email}
          onChange={set("email")}
        />
        <PasswordField
          label={t("register.password")}
          autoComplete="new-password"
          hint={t("form.passwordHint")}
          required
          minLength={12}
          value={form.password}
          onChange={set("password")}
        />
        <Field
          label={t("register.organisation")}
          optional
          autoComplete="organization"
          maxLength={200}
          value={form.organisation}
          onChange={set("organisation")}
        />
        <Checkbox label={t("register.consentPrivacy")} required checked={form.accept_privacy} onChange={set("accept_privacy")} />
        <Checkbox
          label={
            <>
              {t("register.consentTermsBefore")}
              <Link to="/about">{t("register.consentTermsLink")}</Link>
              {t("register.consentTermsAfter")}
            </>
          }
          required
          checked={form.accept_terms}
          onChange={set("accept_terms")}
        />
        <Button type="submit" className="w-full text-[17px]" disabled={register.isPending}>
          {register.isPending ? t("form.submitting") : t("register.submit")}
        </Button>
        <p className="m-0 text-center">
          {t("register.haveAccount")} <Link to="/sign-in">{t("register.signIn")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
