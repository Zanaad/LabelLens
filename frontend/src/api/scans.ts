import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export const FIELD_KEYS = [
  "plant",
  "plant_part",
  "preparation_type",
  "extract_ratio",
  "solvent",
  "marker",
  "dose",
  "other_ingredients",
  "batch",
  "expiry",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type ExtractedField = {
  value: string | null;
  status: "stated" | "not_stated" | "unreadable";
  confidence: number;
  evidence: string | null;
  edited: boolean;
};

export type Scan = {
  id: string;
  status: "extracted" | "out_of_scope" | "checked";
  created_at: string;
  original_filename: string | null;
  has_image: boolean;
  label_text: string | null;
  product_name: string | null;
  fields: Partial<Record<FieldKey, ExtractedField>>;
};

export type VerdictCode = "matches" | "partly_matches" | "cannot_say" | "not_covered" | "differs";
export type RowStatus = "match" | "partial" | "mismatch" | "missing" | "na";

// Reasons and missing items arrive as codes; the UI words them from en.ts.
export type ResultItem = {
  code: string;
  params: Record<string, string | number | string[]>;
  source: string | null;
  ask: "manufacturer" | "patient" | null;
};

export type Comparison = {
  reference_id: string;
  name: string;
  evidence_level: string | null;
  rows: { field: FieldKey; label: string | null; reference: string | null; status: RowStatus }[];
};

export type Source = {
  id: string;
  herb_latin: string;
  evidence_level: string | null;
  source_doc: string | null;
  source_section: string | null;
  source_url: string | null;
  verified: boolean;
};

export type Verdict = {
  id: string;
  created_at: string;
  rules_version: string;
  verdict: VerdictCode;
  plant_latin: string[];
  reasons: ResultItem[];
  comparisons: Comparison[];
  missing: ResultItem[];
  sources: Source[];
};

const scanKey = (id: string) => ["scans", id] as const;
const verdictKey = (id: string) => ["scans", id, "verdict"] as const;

export function useCreateScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File } | { text: string }) => {
      if ("file" in input) {
        const body = new FormData();
        body.append("file", input.file);
        return api<Scan>("/api/scans/image", { method: "POST", body });
      }
      return api<Scan>("/api/scans/text", { method: "POST", json: { text: input.text } });
    },
    onSuccess: (scan) => qc.setQueryData(scanKey(scan.id), scan),
  });
}

export function useScan(id: string) {
  return useQuery({ queryKey: scanKey(id), queryFn: () => api<Scan>(`/api/scans/${id}`) });
}

export function useUpdateFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: Partial<Record<FieldKey, string | null>>) =>
      api<Scan>(`/api/scans/${id}/fields`, { method: "PATCH", json: { fields } }),
    onSuccess: (scan) => qc.setQueryData(scanKey(id), scan),
  });
}

export function useVerdict(id: string) {
  return useQuery({ queryKey: verdictKey(id), queryFn: () => api<Verdict>(`/api/scans/${id}/verdict`) });
}

// Compares the reviewed fields with the reference table and stores the verdict.
export function useCheckScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Verdict>(`/api/scans/${id}/verdict`, { method: "POST" }),
    onSuccess: (verdict) => qc.setQueryData(verdictKey(id), verdict),
  });
}
