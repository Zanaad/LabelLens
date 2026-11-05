import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useForgotPassword } from "../api/auth";
import { errorCode } from "../api/client";
import { AuthHeading, AuthLayout } from "../components/AuthLayout";
import { Button, Field, Notice } from "../components/ui";
import { t, type MessageKey } from "../i18n";

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    forgot.mutate(email.trim());
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        <AuthHeading title={t("forgot.title")} intro={t("forgot.intro")} />
        {forgot.isSuccess ? (
          <Notice tone="info">{t("forgot.sent", { email: forgot.variables })}</Notice>
        ) : (
          <>
            {forgot.isError && <Notice tone="error">{t(`error.${errorCode(forgot.error)}` as MessageKey)}</Notice>}
            <Field
              label={t("forgot.email")}
              type="email"
              autoComplete="email"
              placeholder={t("form.emailPlaceholder")}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={forgot.isPending}>
              {forgot.isPending ? t("form.submitting") : t("forgot.submit")}
            </Button>
          </>
        )}
        <p className="m-0">
          <Link to="/sign-in">{t("forgot.back")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
