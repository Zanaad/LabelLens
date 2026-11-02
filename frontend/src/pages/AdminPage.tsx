import { useState, type FormEvent } from "react";
import { useCreateInvitation } from "../api/auth";
import { errorCode } from "../api/client";
import { Button, Field, inputClass, Notice } from "../components/ui";
import { t, type MessageKey } from "../i18n";

export function AdminPage() {
  const create = useCreateInvitation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"expert" | "admin">("expert");
  const [copied, setCopied] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCopied(false);
    create.mutate({ email, role });
  }

  const link = create.data ? `${window.location.origin}${create.data.accept_path}` : "";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 text-page font-semibold">{t("admin.title")}</h1>
      <section className="flex max-w-[640px] flex-col gap-[18px] rounded-control border border-border bg-surface p-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-xl font-semibold">{t("admin.inviteTitle")}</h2>
          <p className="m-0 text-sm text-muted">{t("admin.inviteIntro")}</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
          {create.isError && <Notice tone="error">{t(`error.${errorCode(create.error)}` as MessageKey)}</Notice>}
          <Field label={t("admin.inviteEmail")} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-role" className="font-semibold">
              {t("admin.inviteRole")}
            </label>
            <select id="invite-role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value as "expert" | "admin")}>
              <option value="expert">{t("role.expert")}</option>
              <option value="admin">{t("role.admin")}</option>
            </select>
          </div>
          <Button type="submit" className="self-start" disabled={create.isPending}>
            {t("admin.inviteSubmit")}
          </Button>
        </form>
        {create.data && (
          <div className="flex flex-col gap-2">
            <Notice tone="info">
              {t("admin.inviteCreated", {
                email: create.data.email,
                date: new Date(create.data.expires_at).toLocaleString("en-GB"),
              })}
            </Notice>
            <Field label={t("admin.inviteLink")} readOnly value={link} className={`${inputClass} font-mono text-sm`} onFocus={(e) => e.target.select()} />
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
            >
              {copied ? t("admin.copied") : t("admin.copy")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
