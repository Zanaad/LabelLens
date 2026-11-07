import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ExtractedField, FieldKey, Verdict, VerdictCode } from "./scans";

export type RatingValue = "agree" | "disagree" | "unsure";

export type ReviewItem = {
  verdict_id: string;
  scan_id: string;
  product_name: string | null;
  plant: string | null;
  verdict: VerdictCode;
  checked_at: string;
  my_rating: RatingValue | null;
  ratings: number;
  requested: boolean; // the pharmacist asked an expert to look at it
};

export type MyRating = {
  rating: RatingValue;
  correct_verdict: VerdictCode | null;
  reason: string | null;
  created_at: string;
};

// No pharmacist name, email or file name: reviewers see the label and the result only.
export type ReviewDetail = {
  verdict: Verdict;
  product_name: string | null;
  label_text: string | null;
  has_image: boolean;
  fields: Partial<Record<FieldKey, ExtractedField>>;
  my_rating: MyRating | null;
};

const queueKey = ["reviews"] as const;

export function useReviewQueue() {
  return useQuery({ queryKey: queueKey, queryFn: () => api<ReviewItem[]>("/api/reviews") });
}

export function useReview(verdictId: string) {
  return useQuery({ queryKey: [...queueKey, verdictId], queryFn: () => api<ReviewDetail>(`/api/reviews/${verdictId}`) });
}

export function useRateVerdict(verdictId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: RatingValue; correct_verdict: VerdictCode | null; reason: string | null }) =>
      api<MyRating>(`/api/reviews/${verdictId}`, { method: "PUT", json: body }),
    onSuccess: (rating) => {
      qc.setQueryData<ReviewDetail>([...queueKey, verdictId], (d) => d && { ...d, my_rating: rating });
      qc.setQueryData<ReviewItem[]>(queueKey, (all) =>
        all?.map((r) => (r.verdict_id === verdictId ? { ...r, my_rating: rating.rating } : r)),
      );
    },
  });
}
