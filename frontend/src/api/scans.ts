import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

// A reviewer's rating as the pharmacist sees it (no name); advice only, the verdict never changes.
export type ReviewOpinion = {
  rating: "agree" | "disagree" | "unsure";
  correct_verdict: VerdictCode | null;
  reason: string | null;
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
  reviews: ReviewOpinion[];
  review_requested_at: string | null;
  review_question: string | null;
};

export type ScanListItem = {
  id: string;
  created_at: string;
  status: Scan["status"];
  product_name: string | null;
  plant: string | null;
  verdict: VerdictCode | null;
  missing: number | null;
  review: ReviewOpinion["rating"] | null;
};

export type Share = {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
};

export type ScanHistory = {
  corrections: { field: FieldKey; old: string | null; new: string | null; by: string | null; at: string }[];
  activity: { action: string; by: string | null; at: string; details: Record<string, string | number> | null }[];
  shares: Share[];
};

export type SharedView = {
  product_name: string | null;
  plant: string | null;
  verdict: VerdictCode;
  shared_by: string;
  organisation: string | null;
  shared_at: string;
  expires_at: string;
};

const listKey = ["scans"] as const;
const scanKey = (id: string) => ["scans", id] as const;
const verdictKey = (id: string) => ["scans", id, "verdict"] as const;
const verdictsKey = (id: string) => ["scans", id, "verdicts"] as const;
const historyKey = (id: string) => ["scans", id, "history"] as const;

// After a change to one scan, refetch the list and its history (only if they are on screen).
function refresh(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: listKey, exact: true });
  void qc.invalidateQueries({ queryKey: historyKey(id) });
}

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
    onSuccess: (scan) => {
      qc.setQueryData(scanKey(scan.id), scan);
      refresh(qc, scan.id);
    },
  });
}

export function useScans() {
  return useQuery({ queryKey: listKey, queryFn: () => api<ScanListItem[]>("/api/scans") });
}

export function useScanHistory(id: string) {
  return useQuery({ queryKey: historyKey(id), queryFn: () => api<ScanHistory>(`/api/scans/${id}/history`) });
}

export function useDeleteScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/api/scans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: scanKey(id) });
      refresh(qc, id);
    },
  });
}

export function useDeleteAllScans() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/api/scans", { method: "DELETE" }),
    onSuccess: () => qc.removeQueries({ queryKey: listKey }), // every scan query starts with "scans"
  });
}

export function useRevokeAllShares() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ revoked: number }>("/api/shares/revoke-all", { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: listKey }),
  });
}

export function useCreateShare(scanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: 1 | 7 | 30) =>
      api<Share & { token: string }>(`/api/scans/${scanId}/shares`, { method: "POST", json: { days } }),
    onSuccess: () => refresh(qc, scanId),
  });
}

export function useRevokeShare(scanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => api<void>(`/api/scans/${scanId}/shares/${shareId}`, { method: "DELETE" }),
    onSuccess: () => refresh(qc, scanId),
  });
}

// Public: the patient's browser sends the token from the link's fragment.
export function useSharedView(token: string) {
  return useQuery({
    queryKey: ["shared", token],
    queryFn: () => api<SharedView>("/api/shared", { method: "POST", json: { token } }),
    enabled: token.length > 0,
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
    onSuccess: (scan) => {
      qc.setQueryData(scanKey(id), scan);
      refresh(qc, id);
    },
  });
}

export function useVerdict(id: string) {
  return useQuery({ queryKey: verdictKey(id), queryFn: () => api<Verdict>(`/api/scans/${id}/verdict`) });
}

export function useVerdictHistory(id: string) {
  return useQuery({ queryKey: verdictsKey(id), queryFn: () => api<Verdict[]>(`/api/scans/${id}/verdicts`) });
}

// Asks an expert to look at the latest result; the expert queue lists these first.
export function useAskExpert(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string | null) =>
      api<Verdict>(`/api/scans/${id}/review-request`, { method: "POST", json: { question } }),
    onSuccess: (verdict) => {
      qc.setQueryData(verdictKey(id), verdict);
      void qc.invalidateQueries({ queryKey: historyKey(id) });
    },
  });
}

// Compares the reviewed fields with the reference table and stores the verdict.
export function useCheckScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Verdict>(`/api/scans/${id}/verdict`, { method: "POST" }),
    onSuccess: (verdict) => {
      qc.setQueryData(verdictKey(id), verdict);
      void qc.invalidateQueries({ queryKey: verdictsKey(id) });
      void qc.invalidateQueries({ queryKey: scanKey(id), exact: true }); // status is now "checked"
      refresh(qc, id);
    },
  });
}
