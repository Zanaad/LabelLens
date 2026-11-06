import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useChangePassword, useSignOutEverywhere, useUpdateProfile } from "../api/auth";
import { errorCode } from "../api/client";
import { useDeleteAllScans, useRevokeAllShares, useScans, type ScanListItem } from "../api/scans";
import { useCurrentUser } from "../app/guards";
import { DownloadIcon, LinkIcon, SignOutIcon } from "../components/icons";
import { Button, Dialog, Eyebrow, Field, Notice, PasswordField } from "../components/ui";
import { VERDICT } from "../components/verdict";
import { t, type MessageKey } from "../i18n";

const panel = "flex min-w-0 flex-col gap-[18px] rounded-control border border-border bg-surface p-6";

// One settings row: title and explanation on the left, the controls on the right.
function Section({ id, title, intro, children }: { id: string; title: MessageKey; intro: MessageKey; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-t border-border py-8 first:border-t-0 first:pt-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id={id} className="m-0 text-lg font-semibold">
          {t(title)}
        </h2>
        <p className="m-0 text-body-sm text-muted">{t(intro)}</p>
      </div>
      <div className={panel}>{children}</div>
    </section>
  );
}

const errorNotice = (err: unknown) => <Notice tone="error">{t(`error.${errorCode(err)}` as MessageKey)}</Notice>;

export function SettingsPage() {
  const user = useCurrentUser();
  return (
    <div className="mx-auto flex w-full max-w-auth flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("settings.eyebrow")}</Eyebrow>
        <h1 className="m-0 text-page font-semibold">{t("account.settings")}</h1>
      </div>
      <div className="flex flex-col">
        <ProfileSection />
        <PasswordSection />
        <SessionsSection />
        {user.role === "pharmacist" && <DataSection />}
      </div>
    </div>
  );
}

function ProfileSection() {
  const user = useCurrentUser();
  const update = useUpdateProfile();
  const [name, setName] = useState(user.full_name);
  const [organisation, setOrganisation] = useState(user.organisation ?? "");
  const changed = name.trim() !== user.full_name || organisation.trim() !== (user.organisation ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (changed) update.mutate({ full_name: name, organisation: organisation.trim() || null, onboarded: false });
  }
  const edit = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    update.reset();
  };

  return (
    <Section id="settings-profile" title="settings.profile" intro="settings.profileIntro">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        {update.isSuccess && <Notice tone="success">{t("settings.saved")}</Notice>}
        {update.isError && errorNotice(update.error)}
        <div className="grid gap-[18px] sm:grid-cols-2">
          <Field label={t("settings.name")} autoComplete="name" required maxLength={200} value={name} onChange={edit(setName)} />
          <Field
            label={t("settings.organisation")}
            optional
            autoComplete="organization"
            maxLength={200}
            value={organisation}
            onChange={edit(setOrganisation)}
          />
        </div>
        <Field label={t("settings.email")} value={user.email} readOnly hint={t("settings.emailHint")} />
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold">{t("settings.role")}</span>
          <span className="inline-flex self-start rounded-full border border-accent bg-accent-weak px-2.5 py-0.5 text-sm font-semibold">
            {t(`role.${user.role}`)}
          </span>
        </div>
        <div className="flex justify-end border-t border-border pt-[18px]">
          <Button type="submit" disabled={!changed || !name.trim() || update.isPending}>
            {update.isPending ? t("form.submitting") : t("settings.saveProfile")}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMismatch(password !== confirm);
    if (password !== confirm) return;
    change.mutate({ current_password: current, new_password: password });
  }

  return (
    <Section id="settings-password" title="settings.password" intro="settings.passwordIntro">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        {mismatch && <Notice tone="error">{t("reset.mismatch")}</Notice>}
        {change.isError && errorNotice(change.error)}
        <PasswordField
          label={t("settings.currentPassword")}
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <div className="grid gap-[18px] sm:grid-cols-2">
          <PasswordField
            label={t("settings.newPassword")}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordField
            label={t("settings.confirmPassword")}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <p className="m-0 -mt-2 text-sm text-muted">{t("form.passwordHint")}</p>
        <div className="flex justify-end border-t border-border pt-[18px]">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? t("form.submitting") : t("settings.submitPassword")}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function SessionsSection() {
  const signOut = useSignOutEverywhere();
  return (
    <Section id="settings-sessions" title="settings.sessions" intro="settings.sessionsIntro">
      {signOut.isError && errorNotice(signOut.error)}
      <ActionRow title="settings.signOutAll" body="settings.signOutAllBody">
        <Button variant="secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          <SignOutIcon />
          {t("settings.signOutAllButton")}
        </Button>
      </ActionRow>
    </Section>
  );
}

function ActionRow({ title, body, children }: { title: MessageKey; body: MessageKey; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
        <span className="font-semibold">{t(title)}</span>
        <span className="text-body-sm text-muted">{t(body)}</span>
      </div>
      {children}
    </div>
  );
}

// Quote every cell, and neutralise values a spreadsheet would run as a formula.
const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

function downloadCsv(scans: ScanListItem[]) {
  const head = (
    ["settings.csvDate", "settings.csvProduct", "settings.csvHerb", "settings.csvVerdict", "settings.csvMissing"] as const
  ).map((k) => t(k));
  const rows = scans.map((s) => [
    s.created_at,
    s.product_name ?? "",
    s.plant ?? "",
    s.verdict ? t(VERDICT[s.verdict].short) : t("settings.csvNotChecked"),
    s.missing == null ? "" : String(s.missing),
  ]);
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `labellens-scans-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DataSection() {
  const scans = useScans();
  const revokeAll = useRevokeAllShares();
  const deleteAll = useDeleteAllScans();
  const [confirm, setConfirm] = useState<"revoke" | "delete" | null>(null);
  const [done, setDone] = useState<string | null>(null); // only the latest outcome is shown
  const count = scans.data?.length ?? 0;
  const busy = revokeAll.isPending || deleteAll.isPending;
  const failed = revokeAll.error ?? deleteAll.error;

  function onConfirm() {
    setDone(null);
    if (confirm === "revoke")
      revokeAll.mutate(undefined, {
        onSuccess: (r) => setDone(t("settings.revokedAll", { n: r.revoked })),
        onSettled: () => setConfirm(null),
      });
    if (confirm === "delete")
      deleteAll.mutate(undefined, { onSuccess: () => setDone(t("settings.deletedAll")), onSettled: () => setConfirm(null) });
  }

  return (
    <Section id="settings-data" title="settings.data" intro="settings.dataIntro">
      <p className="m-0 flex items-baseline justify-between gap-3 border-b border-border pb-[18px]">
        <span className="text-muted">{t("settings.dataCount")}</span>
        <span className="text-h1 font-semibold">{scans.isSuccess ? count : "…"}</span>
      </p>
      {done && <Notice tone="success">{done}</Notice>}
      {failed && errorNotice(failed)}
      <ActionRow title="settings.downloadCsv" body="settings.downloadCsvBody">
        <Button variant="secondary" disabled={!count} onClick={() => scans.data && downloadCsv(scans.data)}>
          <DownloadIcon />
          {t("settings.downloadButton")}
        </Button>
      </ActionRow>
      <ActionRow title="settings.revokeAll" body="settings.revokeAllBody">
        <Button variant="secondary" onClick={() => setConfirm("revoke")}>
          <LinkIcon />
          {t("settings.revokeButton")}
        </Button>
      </ActionRow>
      <div className="border-t border-border pt-[18px]">
        <ActionRow title="settings.deleteAll" body="settings.deleteAllBody">
          <Button variant="secondary" disabled={!count} onClick={() => setConfirm("delete")}>
            {t("settings.deleteButton")}
          </Button>
        </ActionRow>
      </div>
      {confirm && (
        <Dialog title={t(confirm === "revoke" ? "settings.revokeAll" : "settings.deleteAll")} onClose={() => setConfirm(null)}>
          <p className="m-0">{t(confirm === "revoke" ? "settings.revokeConfirm" : "settings.deleteConfirm", { n: count })}</p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {t("settings.cancel")}
            </Button>
            <Button disabled={busy} onClick={onConfirm}>
              {busy ? t("form.submitting") : t(confirm === "revoke" ? "settings.revokeYes" : "settings.deleteYes")}
            </Button>
          </div>
        </Dialog>
      )}
    </Section>
  );
}
