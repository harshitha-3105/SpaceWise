"use client";

import { getSupabaseClient } from "./supabaseClient";
import type { SpaceWiseReview } from "./reviews";

export interface AdminUserSummary {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
}

export interface AdminRoomPlanSummary {
  id: string;
  ownerId: string;
  roomName: string;
  roomType: string;
  roomLength: number;
  roomWidth: number;
  updatedAt: string;
}

export interface AdminOverview {
  registeredUsers: number;
  verifiedEmailUsers: number;
  pendingEmailVerificationUsers: number;
  roomPlansAvailable: boolean;
  totalRoomPlans: number | null;
  reviewsAvailable: boolean;
  totalReviews: number | null;
  reviewsModuleAvailable: boolean;
  publishedReviews: number | null;
  hiddenReviews: number | null;
  averagePublishedRating: number | null;
  reviews: SpaceWiseReview[];
  users: AdminUserSummary[];
  roomPlans: AdminRoomPlanSummary[];
}

function isAdminReview(value: unknown): value is SpaceWiseReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const review = value as Record<string, unknown>;
  return typeof review.id === "string"
    && typeof review.displayName === "string"
    && typeof review.rating === "number"
    && typeof review.reviewText === "string"
    && (review.status === "published" || review.status === "hidden")
    && typeof review.createdAt === "string"
    && typeof review.updatedAt === "string";
}

export async function isSpaceWiseAdmin(): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("spacewise_is_admin");
  if (error) throw new Error("Admin authorization could not be verified. Apply the SpaceWise admin migration and try again.");
  return data === true;
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await getSupabaseClient().rpc("spacewise_admin_overview");
  if (error) throw new Error("Admin overview data is unavailable. Verify the migration and database permissions.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The admin overview returned an invalid response.");

  const value = data as Record<string, unknown>;
  if (typeof value.registeredUsers !== "number"
    || typeof value.verifiedEmailUsers !== "number"
    || typeof value.pendingEmailVerificationUsers !== "number"
    || typeof value.roomPlansAvailable !== "boolean"
    || !(value.totalRoomPlans === null || typeof value.totalRoomPlans === "number")
    || typeof value.reviewsAvailable !== "boolean"
    || !(value.totalReviews === null || typeof value.totalReviews === "number")
    || !Array.isArray(value.users)
    || !Array.isArray(value.roomPlans)) {
    throw new Error("The admin overview returned incomplete data.");
  }
  const reviewsModuleAvailable = value.reviewsModuleAvailable === true;
  const reviews = Array.isArray(value.reviews) ? value.reviews : [];
  if (reviewsModuleAvailable && (!reviews.every(isAdminReview)
    || typeof value.publishedReviews !== "number"
    || typeof value.hiddenReviews !== "number"
    || !(value.averagePublishedRating === null || typeof value.averagePublishedRating === "number"))) {
    throw new Error("The admin review overview returned incomplete data.");
  }
  return {
    ...(value as unknown as Omit<AdminOverview, "reviewsModuleAvailable" | "publishedReviews" | "hiddenReviews" | "averagePublishedRating" | "reviews">),
    reviewsModuleAvailable,
    publishedReviews: typeof value.publishedReviews === "number" ? value.publishedReviews : null,
    hiddenReviews: typeof value.hiddenReviews === "number" ? value.hiddenReviews : null,
    averagePublishedRating: typeof value.averagePublishedRating === "number" ? value.averagePublishedRating : null,
    reviews: reviewsModuleAvailable ? reviews as SpaceWiseReview[] : [],
  };
}

export async function setAdminReviewStatus(reviewId: string, status: "published" | "hidden"): Promise<void> {
  const { error } = await getSupabaseClient().rpc("spacewise_admin_set_review_status", {
    p_review_id: reviewId,
    p_status: status,
  });
  if (error) throw new Error(error.message || "Review moderation could not be completed.");
}
