import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAcceptInvitation, useInvitationPreview } from "../api/auth";
import { errorCode } from "../api/client";
import { ROLE_HOME } from "../app/navigation";
import { AuthHeading, AuthLayout } from "../components/AuthLayout";
import { Button, Checkbox, Field, Notice, PasswordField } from "../components/ui";
import { t, type MessageKey } from "../i18n";

/** Invitation links look like /accept-invite#<token>; the fragment never reaches the server. */
export function AcceptInvitePage() {
  const { hash } = useLocation();
  const token = decodeURIComponent(hash.replace(/^#/, ""));
  const navigate = useNavigate();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const [form, setForm] = useState({ full_name: "", password: "", accept_privacy: false, accept_terms: false });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    accept.mutate(
      { ...form, token },
      { onSuccess: (user) => navigate(ROLE_HOME[user.role], { replace: true }) },
    );
  }

  let body;
  if (!token) body = <Notice tone="info">{t("invite.missing")}</Notice>;
  else if (preview.isPending) body = <p role="status" className="m-0 text-muted">{t("invite.checking")}</p>;
  else if (preview.isError) body = <Notice tone="error">{t(`error.${errorCode(preview.error)}` as MessageKey)}</Notice>;
  else
    body = (
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        {accept.isError && <Notice tone="error">{t(`error.${errorCode(accept.error)}` as MessageKey)}</Notice>}
        <Field label={t("invite.email")} type="email" value={preview.data.email} readOnly disabled />
        <Field label={t("register.fullName")} autoComplete="name" required maxLength={200} value={form.full_name} onChange={set("full_name")} />
        <PasswordField
          label={t("register.password")}
          autoComplete="new-password"
          hint={t("form.passwordHint")}
          required
          minLength={12}
          value={form.password}
          onChange={set("password")}
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
        <Button type="submit" className="w-full text-[17px]" disabled={accept.isPending}>
          {accept.isPending ? t("form.submitting") : t("invite.submit")}
        </Button>
      </form>
    );

  return (
    <AuthLayout>
      <AuthHeading
        title={t("invite.title")}
        intro={preview.data ? t("invite.intro", { role: t(`role.${preview.data.role}`) }) : ""}
      />
      {body}
    </AuthLayout>
  );
}
