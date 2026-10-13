"use client";

import { getSupabaseClient } from "./supabaseClient";

export const REVIEW_TEXT_MIN_LENGTH = 10;
export const REVIEW_TEXT_MAX_LENGTH = 1000;
export const REVIEW_DISPLAY_NAME_MAX_LENGTH = 60;

export interface SpaceWiseReview {
  id: string;
  displayName: string;
  rating: number;
  reviewText: string;
  status: "published" | "hidden";
  createdAt: string;
  updatedAt: string;
}

export interface PublicReviewsSummary {
  averageRating: number | null;
  totalPublished: number;
  reviews: SpaceWiseReview[];
}

export interface ReviewsSnapshot {
  summary: PublicReviewsSummary;
  myReview: SpaceWiseReview | null;
}

const reviewColumns = "id,display_name,rating,review_text,status,created_at,updated_at";

function parseReview(value: unknown): SpaceWiseReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A review record had an invalid format.");
  const review = value as Record<string, unknown>;
  if (typeof review.id !== "string"
    || typeof review.displayName !== "string"
    || typeof review.rating !== "number"
    || typeof review.reviewText !== "string"
    || (review.status !== "published" && review.status !== "hidden")
    || typeof review.createdAt !== "string"
    || typeof review.updatedAt !== "string") {
    throw new Error("A review record was incomplete.");
  }
  return review as unknown as SpaceWiseReview;
}

function parseTableReview(value: unknown): SpaceWiseReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The saved review response was invalid.");
  const row = value as Record<string, unknown>;
  return parseReview({
    id: row.id,
    displayName: row.display_name,
    rating: typeof row.rating === "number" ? row.rating : Number(row.rating),
    reviewText: row.review_text,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function loadReviewsSnapshot(): Promise<ReviewsSnapshot> {
  const { data, error } = await getSupabaseClient().rpc("spacewise_reviews_snapshot");
  if (error) throw new Error("Reviews are unavailable. Verify that the SpaceWise Reviews migration has been applied.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The reviews response was invalid.");

  const snapshot = data as Record<string, unknown>;
  if (!(snapshot.averageRating === null || typeof snapshot.averageRating === "number")
    || typeof snapshot.totalPublished !== "number"
    || !Array.isArray(snapshot.reviews)
    || !(snapshot.myReview === null || (snapshot.myReview && typeof snapshot.myReview === "object"))) {
    throw new Error("The reviews response was incomplete.");
  }
  return {
    summary: {
      averageRating: snapshot.averageRating,
      totalPublished: snapshot.totalPublished,
      reviews: snapshot.reviews.map(parseReview),
    },
    myReview: snapshot.myReview === null ? null : parseReview(snapshot.myReview),
  };
}

export async function loadPublicReviews(): Promise<PublicReviewsSummary> {
  return (await loadReviewsSnapshot()).summary;
}

export async function loadMyReview(): Promise<SpaceWiseReview | null> {
  return (await loadReviewsSnapshot()).myReview;
}

export async function submitMyReview(input: { id?: string; displayName: string; rating: number; reviewText: string }): Promise<SpaceWiseReview> {
  const client = getSupabaseClient();
  const values = {
    display_name: input.displayName.trim(),
    rating: input.rating,
    review_text: input.reviewText.trim(),
  };
  const result = input.id
    ? await client.from("reviews").update(values).eq("id", input.id).select(reviewColumns).single()
    : await client.from("reviews").insert(values).select(reviewColumns).single();
  if (result.error) throw new Error(result.error.message || "Your review could not be saved.");
  return parseTableReview(result.data);
}
