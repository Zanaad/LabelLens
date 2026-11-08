import { useState, type FormEvent } from "react";
import {
  useInvitations,
  useRevokeInvitation,
  useSendPasswordReset,
  useSetUserActive,
  useUsers,
  type AdminUser,
  type Invitation,
} from "../api/admin";
import { useCreateInvitation, useMe } from "../api/auth";
import { errorCode } from "../api/client";
import { Button, Field, Notice, inputClass } from "../components/ui";
import { formatDate, formatDateTime, t, type MessageKey } from "../i18n";

const panel = "flex min-w-0 flex-col gap-4 rounded-control border border-border bg-surface"; // tables run edge to edge
const card = `${panel} p-6`;
const th = "border-b border-border px-3 py-2.5 text-left font-semibold first:pl-6 last:pr-6";
const td = "border-b border-border px-3 py-2.5 text-left align-top first:pl-6 last:pr-6";
const small = "min-h-10 px-3 py-1.5 text-body-sm";

function Users() {
  const users = useUsers();
  const me = useMe();
  const setActive = useSetUserActive();
  const reset = useSendPasswordReset();
  const error = setActive.error ?? reset.error;

  const toggle = (u: AdminUser) => {
    if (u.is_active && !window.confirm(t("admin.deactivateConfirm", { name: u.full_name }))) return;
    setActive.mutate({ id: u.id, is_active: !u.is_active });
  };

  return (
    <section aria-labelledby="users-title" className={panel}>
      <div className="flex flex-col gap-1.5 px-6 pt-6">
        <h2 id="users-title" className="m-0 text-xl font-semibold">
          {t("admin.usersTitle")}
        </h2>
        <p className="m-0 text-sm text-muted">{t("admin.usersIntro")}</p>
      </div>
      <div className="px-6" aria-live="polite">
        {error && <Notice tone="error">{t(`error.${errorCode(error)}` as MessageKey)}</Notice>}
        {reset.isSuccess && (
          <Notice>{t("admin.resetSent", { email: users.data?.find((u) => u.id === reset.variables)?.email ?? "" })}</Notice>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-body-sm">
          <thead>
            <tr className="bg-surface-2">
              {(["colName", "colEmail", "colRole", "colStatus", "colLastSignIn", "colActions"] as const).map((k) => (
                <th key={k} scope="col" className={th}>
                  {t(`admin.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => {
              const self = u.id === me.data?.id;
              return (
                <tr key={u.id}>
                  <th scope="row" className={`${td} font-semibold`}>
                    {u.full_name} {self && <span className="font-normal text-muted">{t("admin.you")}</span>}
                    {u.organisation && <span className="block font-normal text-muted">{u.organisation}</span>}
                  </th>
                  <td className={`${td} break-all`}>{u.email}</td>
                  <td className={td}>{t(`role.${u.role}`)}</td>
                  <td className={td}>
                    <span className={u.is_active ? "" : "font-semibold text-partial-fg"}>
                      {u.is_active ? t("admin.active") : t("admin.inactive")}
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {u.last_login_at ? formatDateTime(u.last_login_at) : t("admin.never")}
                  </td>
                  <td className={td}>
                    {!self && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          className={small}
                          disabled={!u.is_active || reset.isPending}
                          onClick={() => reset.mutate(u.id)}
                        >
                          {t("admin.sendReset")}
                        </Button>
                        <Button variant="secondary" className={small} disabled={setActive.isPending} onClick={() => toggle(u)}>
                          {u.is_active ? t("admin.deactivate") : t("admin.reactivate")}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function invitationState(inv: Invitation) {
  if (inv.accepted_at) return t("admin.invAccepted");
  if (inv.revoked_at) return t("admin.invRevoked");
  if (new Date(inv.expires_at) <= new Date()) return t("admin.invExpired");
  return t("admin.invPending", { date: formatDateTime(inv.expires_at) });
}

function Invitations() {
  const create = useCreateInvitation();
  const invitations = useInvitations();
  const revoke = useRevokeInvitation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"expert" | "admin">("expert");
  const [copied, setCopied] = useState(false);
  const link = create.data ? `${window.location.origin}${create.data.accept_path}` : "";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCopied(false);
    create.mutate({ email, role }, { onSuccess: () => void invitations.refetch() });
  }

  return (
    <section aria-labelledby="invite-title" className={card}>
      <div className="flex flex-col gap-1.5">
        <h2 id="invite-title" className="m-0 text-xl font-semibold">
          {t("admin.inviteTitle")}
        </h2>
        <p className="m-0 text-sm text-muted">{t("admin.inviteIntro")}</p>
      </div>
      <form onSubmit={onSubmit} className="flex max-w-[640px] flex-col gap-[18px]">
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
        <div className="flex max-w-[640px] flex-col gap-2">
          <Notice tone="info">
            {t("admin.inviteCreated", { email: create.data.email, date: formatDateTime(create.data.expires_at) })}
          </Notice>
          <Field
            label={t("admin.inviteLink")}
            readOnly
            value={link}
            className={`${inputClass} font-mono text-sm`}
            onFocus={(e) => e.target.select()}
          />
          <Button variant="secondary" className="self-start" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
            {copied ? t("admin.copied") : t("admin.copy")}
          </Button>
        </div>
      )}

      <h3 className="m-0 mt-2 text-lg font-semibold">{t("admin.invitationsTitle")}</h3>
      {invitations.data?.length === 0 && <p className="m-0 text-muted">{t("admin.noInvitations")}</p>}
      <ul className="m-0 flex list-none flex-col p-0">
        {invitations.data?.map((inv) => {
          const pending = !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at) > new Date();
          return (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-body-sm">
              <span>
                <strong className="break-all">{inv.email}</strong> · {t(`role.${inv.role}`)} · {invitationState(inv)}
                <span className="block text-sm text-muted">{formatDate(inv.created_at)}</span>
              </span>
              {pending && (
                <Button variant="secondary" className={small} disabled={revoke.isPending} onClick={() => revoke.mutate(inv.id)}>
                  {t("admin.revoke")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 text-page font-semibold">{t("admin.title")}</h1>
      <Users />
      <Invitations />
    </div>
  );
}
