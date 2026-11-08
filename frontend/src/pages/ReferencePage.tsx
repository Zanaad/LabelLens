import { useState, type FormEvent } from "react";
import { useMe } from "../api/auth";
import { errorCode } from "../api/client";
import {
  usePreparationHistory,
  useReference,
  useSaveReference,
  type PlantName,
  type PlantNameInput,
  type Preparation,
  type PreparationInput,
} from "../api/reference";
import { ExternalIcon, InfoIcon, MatchIcon } from "../components/icons";
import { Button, Dialog, Eyebrow, Notice, inputClass } from "../components/ui";
import { formatDateTime, t, type MessageKey } from "../i18n";

const panel = "flex min-w-0 flex-col gap-4 rounded-control border border-border bg-surface"; // tables run edge to edge
const th = "border-b border-border px-3 py-2.5 text-left font-semibold first:pl-6 last:pr-6";
const td = "border-b border-border px-3 py-2.5 text-left align-top first:pl-6 last:pr-6";
const small = "min-h-10 px-3 py-1.5 text-body-sm";
// Unchecked rows must say what still needs checking; new rows start with the marker.
const TODO = "TODO(expert): ";

const TEXT_FIELDS = [
  "herb_latin",
  "plant_part",
  "preparation_type",
  "solvent_type",
  "solvent_strength",
  "evidence_level",
  "source_doc",
  "source_section",
  "source_url",
] as const;
const REQUIRED = new Set(["herb_latin", "plant_part", "preparation_type"]);

const ratio = (p: Preparation) =>
  p.extract_ratio_min === null
    ? "–"
    : p.extract_ratio_min === p.extract_ratio_max
      ? `${p.extract_ratio_min}:1`
      : `${p.extract_ratio_min}–${p.extract_ratio_max}:1`;

function CheckedStatus({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-match-fg">
      <MatchIcon size={18} />
      {t("ref.checked")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cannot-bd bg-cannot-bg px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap text-cannot-fg">
      <InfoIcon size={16} />
      {t("ref.sample")}
    </span>
  );
}

// Ticked only after comparing every value with the source; unticked rows need a TODO(expert) note.
function CheckedBox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-body-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-semibold">{t("ref.f.verified")}</span>
        <span className="block text-sm text-muted">{t("ref.verifiedHint")}</span>
      </span>
    </label>
  );
}

function History({ id }: { id: string }) {
  const history = usePreparationHistory(id);
  if (!history.data?.length) return null;
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="m-0 text-base font-semibold">{t("ref.historyTitle")}</h3>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
        {history.data.map((h, i) => {
          const changed = Object.keys(h.after ?? {}).filter(
            (k) => (h.before ?? {})[k as keyof PreparationInput] !== (h.after ?? {})[k as keyof PreparationInput],
          );
          const fields = changed.map((k) => t(`ref.f.${k}` as MessageKey)).join(", ");
          return (
            <li key={i}>
              <strong>{h.by ?? "–"}</strong> {t(`ref.history.${h.action}` as MessageKey, { fields })}
              <span className="block font-mono text-eyebrow tracking-normal text-muted">{formatDateTime(h.at)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PreparationDialog({ row, onClose }: { row: Preparation | null; onClose: () => void }) {
  const save = useSaveReference();
  const [verified, setVerified] = useState(row?.verified ?? false);
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, row?.[k] ?? ""])),
    extract_ratio_min: row?.extract_ratio_min?.toString() ?? "",
    extract_ratio_max: row?.extract_ratio_max?.toString() ?? "",
    notes: row ? (row.notes ?? "") : TODO,
  }) as Record<(typeof TEXT_FIELDS)[number] | "extract_ratio_min" | "extract_ratio_max" | "notes", string>);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const num = (v: string) => (v.trim() ? Number(v) : null);
    const body = {
      ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, form[k].trim() || null])),
      extract_ratio_min: num(form.extract_ratio_min),
      extract_ratio_max: num(form.extract_ratio_max),
      verified,
      notes: form.notes.trim() || null,
    } as PreparationInput;
    save.mutate({ table: "preparations", id: row?.id ?? null, body }, { onSuccess: onClose });
  };
  const input = (k: keyof typeof form, type = "text") => (
    <label key={k} className="flex flex-col gap-1.5 font-semibold">
      {t(`ref.f.${k}` as MessageKey)}
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        min={type === "number" ? 0 : undefined}
        required={REQUIRED.has(k)}
        value={form[k] as string}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className={`${inputClass} font-normal`}
      />
    </label>
  );

  return (
    <Dialog title={t(row ? "ref.editPrep" : "ref.newPrep")} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {save.isError && <Notice tone="error">{t(`error.${errorCode(save.error)}` as MessageKey)}</Notice>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.slice(0, 3).map((k) => input(k))}
          <div className="grid grid-cols-2 gap-3">
            {input("extract_ratio_min", "number")}
            {input("extract_ratio_max", "number")}
          </div>
          {TEXT_FIELDS.slice(3).map((k) => input(k))}
        </div>
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("ref.f.notes")}
          <textarea
            rows={3}
            maxLength={2000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={`${inputClass} font-normal`}
          />
          <span className="text-sm font-normal text-muted">{t("ref.notesHint")}</span>
        </label>
        <CheckedBox checked={verified} onChange={setVerified} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("ref.cancel")}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t("ref.save")}
          </Button>
        </div>
        {row && <History id={row.id} />}
      </form>
    </Dialog>
  );
}

function NameDialog({ row, onClose }: { row: PlantName | null; onClose: () => void }) {
  const save = useSaveReference();
  const [form, setForm] = useState<PlantNameInput>({
    name: row?.name ?? "",
    language: row?.language ?? "en",
    latin_name: row?.latin_name ?? "",
    verified: row?.verified ?? false,
    notes: row ? row.notes : TODO,
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, notes: form.notes?.trim() || null };
    save.mutate({ table: "plant-names", id: row?.id ?? null, body }, { onSuccess: onClose });
  };
  const text = (k: "name" | "language" | "latin_name") => (
    <label className="flex flex-col gap-1.5 font-semibold">
      {t(`ref.f.${k}`)}
      <input
        required
        maxLength={k === "language" ? 8 : 200}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className={`${inputClass} font-normal`}
      />
    </label>
  );

  return (
    <Dialog title={t(row ? "ref.editName" : "ref.newName")} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {save.isError && <Notice tone="error">{t(`error.${errorCode(save.error)}` as MessageKey)}</Notice>}
        {text("name")}
        {text("language")}
        {text("latin_name")}
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("ref.f.notes")}
          <textarea
            rows={2}
            maxLength={2000}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={`${inputClass} font-normal`}
          />
          <span className="text-sm font-normal text-muted">{t("ref.notesHint")}</span>
        </label>
        <CheckedBox checked={form.verified} onChange={(verified) => setForm({ ...form, verified })} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("ref.cancel")}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t("ref.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Editing =
  | { kind: "prep"; row: Preparation | null }
  | { kind: "name"; row: PlantName | null }
  | null;

// Everyone reads the table; only experts change it, since every value comes from a monograph.
export function ReferencePage() {
  const reference = useReference();
  const canEdit = useMe().data?.role === "expert";
  const remove = useSaveReference();
  const [editing, setEditing] = useState<Editing>(null);

  const del = (table: "preparations" | "plant-names", id: string) => {
    if (window.confirm(t("ref.deleteConfirm"))) remove.mutate({ table, id, body: null });
  };
  const preps = reference.data?.preparations ?? [];
  const names = reference.data?.plant_names ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1.5">
        <Eyebrow>{t("ref.eyebrow")}</Eyebrow>
        <h1 className="m-0 text-page font-semibold">{t("nav.reference")}</h1>
        <p className="m-0 max-w-[75ch] text-muted">{t("ref.intro")}</p>
      </section>
      {remove.isError && <Notice tone="error">{t(`error.${errorCode(remove.error)}` as MessageKey)}</Notice>}

      <section aria-labelledby="preps-title" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <h2 id="preps-title" className="m-0 text-xl font-semibold">
            {t("ref.prepsTitle")}
          </h2>
          {canEdit && <Button onClick={() => setEditing({ kind: "prep", row: null })}>{t("ref.add")}</Button>}
        </div>
        {reference.isSuccess && preps.length === 0 ? (
          <p className="m-0 px-6 pb-6 text-muted">{t("ref.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-2">
                  {(["colHerb", "colPart", "colPrep", "colRatio", "colSolvent", "colEvidence", "colSource", "colStatus"] as const).map(
                    (k) => (
                      <th key={k} scope="col" className={th}>
                        {t(`ref.${k}`)}
                      </th>
                    ),
                  )}
                  {canEdit && (
                    <th scope="col" className={th}>
                      {t("ref.colActions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preps.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className={`${td} font-medium italic`}>
                      {p.herb_latin}
                    </th>
                    <td className={td}>{p.plant_part}</td>
                    <td className={td}>{p.preparation_type}</td>
                    <td className={`${td} font-mono whitespace-nowrap`}>{ratio(p)}</td>
                    <td className={td}>{[p.solvent_type, p.solvent_strength].filter(Boolean).join(" ") || "–"}</td>
                    <td className={td}>{p.evidence_level ?? "–"}</td>
                    <td className={td}>
                      {p.source_url ? (
                        <a href={p.source_url} target="_blank" rel="noreferrer" title={p.source_doc ?? undefined} className="inline-flex items-center gap-1">
                          {t("ref.openSource")}
                          <ExternalIcon />
                        </a>
                      ) : (
                        (p.source_doc ?? "–")
                      )}
                    </td>
                    <td className={td}>
                      <CheckedStatus verified={p.verified} />
                    </td>
                    {canEdit && (
                      <td className={td}>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            className={small}
                            aria-label={t("ref.editFor", { name: p.preparation_type })}
                            onClick={() => setEditing({ kind: "prep", row: p })}
                          >
                            {t("ref.edit")}
                          </Button>
                          <Button
                            variant="secondary"
                            className={small}
                            aria-label={t("ref.deleteFor", { name: p.preparation_type })}
                            onClick={() => del("preparations", p.id)}
                          >
                            {t("ref.delete")}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="names-title" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <h2 id="names-title" className="m-0 text-xl font-semibold">
            {t("ref.namesTitle")}
          </h2>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditing({ kind: "name", row: null })}>
              {t("ref.addName")}
            </Button>
          )}
        </div>
        {reference.isSuccess && names.length === 0 ? (
          <p className="m-0 px-6 pb-6 text-muted">{t("ref.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-2">
                  {(["colName", "colLanguage", "colLatin", "colStatus"] as const).map((k) => (
                    <th key={k} scope="col" className={th}>
                      {t(`ref.${k}`)}
                    </th>
                  ))}
                  {canEdit && (
                    <th scope="col" className={th}>
                      {t("ref.colActions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {names.map((n) => (
                  <tr key={n.id}>
                    <th scope="row" className={`${td} font-medium`}>
                      {n.name}
                    </th>
                    <td className={`${td} font-mono`}>{n.language}</td>
                    <td className={`${td} italic`}>{n.latin_name}</td>
                    <td className={td}>
                      <CheckedStatus verified={n.verified} />
                    </td>
                    {canEdit && (
                      <td className={td}>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            className={small}
                            aria-label={t("ref.editFor", { name: n.name })}
                            onClick={() => setEditing({ kind: "name", row: n })}
                          >
                            {t("ref.edit")}
                          </Button>
                          <Button
                            variant="secondary"
                            className={small}
                            aria-label={t("ref.deleteFor", { name: n.name })}
                            onClick={() => del("plant-names", n.id)}
                          >
                            {t("ref.delete")}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing?.kind === "prep" && <PreparationDialog row={editing.row} onClose={() => setEditing(null)} />}
      {editing?.kind === "name" && <NameDialog row={editing.row} onClose={() => setEditing(null)} />}
    </div>
  );
}
