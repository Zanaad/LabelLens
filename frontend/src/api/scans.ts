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

const scanKey = (id: string) => ["scans", id] as const;

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
