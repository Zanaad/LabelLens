// Shared form/UI primitives matching the design's buttons, inputs and notices.
import { useId, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { t } from "../i18n";
import { AlertIcon, ClockIcon, EyeIcon, InfoIcon } from "./icons";

const base =
  "inline-flex items-center justify-center gap-2 min-h-control rounded-control border font-sans text-base text-center no-underline disabled:opacity-60 disabled:cursor-not-allowed";
const variants = {
  primary:
    "px-[18px] py-2.5 border-accent bg-accent text-on-accent font-semibold hover:bg-accent-hover hover:text-on-accent",
  secondary:
    "px-4 py-2.5 border-border-2 bg-surface text-text font-medium hover:bg-surface-2 hover:text-text",
};
type Variant = keyof typeof variants;

function buttonClass(variant: Variant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...rest
}: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}

export const inputClass =
  "w-full min-h-control px-3 py-2.5 rounded-control border border-border-2 bg-surface text-text text-base";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
};

export function Field({ label, hint, optional, id, ...input }: FieldProps) {
  const autoId = useId();
  const fid = id ?? autoId;
  const hintId = hint ? `${fid}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="font-semibold">
        {label}
        {optional && <span className="font-normal text-muted"> {t("form.optional")}</span>}
      </label>
      <input id={fid} aria-describedby={hintId} className={inputClass} {...input} />
      {hint && (
        <p id={hintId} className="m-0 text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  labelAside,
  id,
  ...input
}: Omit<FieldProps, "type" | "optional"> & { labelAside?: ReactNode }) {
  const autoId = useId();
  const fid = id ?? autoId;
  const hintId = hint ? `${fid}-hint` : undefined;
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={fid} className="font-semibold">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="flex gap-2">
        <input
          id={fid}
          type={visible ? "text" : "password"}
          aria-describedby={hintId}
          className={`${inputClass} flex-auto`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("form.hidePassword") : t("form.showPassword")}
          aria-pressed={visible}
          className="inline-flex w-12 flex-none items-center justify-center rounded-control border border-border-2 bg-surface text-text hover:bg-surface-2"
        >
          <EyeIcon />
        </button>
      </div>
      {hint && (
        <p id={hintId} className="m-0 text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  id,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={fid}
        type="checkbox"
        className="mt-0.5 h-[22px] w-[22px] flex-none accent-accent"
        {...input}
      />
      <label htmlFor={fid}>{label}</label>
    </div>
  );
}

const noticeTone = {
  info: { cls: "border-cannot-bd bg-cannot-bg text-cannot-fg", Icon: InfoIcon },
  expired: { cls: "border-cannot-bd bg-cannot-bg text-cannot-fg", Icon: ClockIcon },
  // Errors use the amber "partial" family: the design has no red, by rule.
  error: { cls: "border-partial-bd bg-partial-bg text-partial-fg", Icon: AlertIcon },
} as const;

export function Notice({
  tone = "info",
  children,
}: {
  tone?: keyof typeof noticeTone;
  children: ReactNode;
}) {
  const { cls, Icon } = noticeTone[tone];
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`m-0 flex items-start gap-2 rounded-control border px-3.5 py-3 ${cls}`}
    >
      <Icon size={18} />
      <span>{children}</span>
    </p>
  );
}

export function Steps({ current }: { current: number }) {
  const steps = ["steps.scan", "steps.review", "steps.result", "steps.summary"] as const;
  return (
    <nav aria-label={t("steps.label")} className="no-print">
      <ol className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {steps.map((key, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "todo";
          return (
            <li key={key} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${
                  state === "todo" ? "border-border-2 bg-surface text-muted" : "border-accent bg-accent text-on-accent"
                }`}
              >
                {n}
              </span>
              <span className={state === "current" ? "font-semibold" : "text-muted"}>{t(key)}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-eyebrow font-semibold uppercase tracking-[0.06em] text-muted">
      {children}
    </p>
  );
}
