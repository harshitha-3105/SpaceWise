"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import {
  loadReviewsSnapshot,
  REVIEW_DISPLAY_NAME_MAX_LENGTH,
  REVIEW_TEXT_MAX_LENGTH,
  REVIEW_TEXT_MIN_LENGTH,
  submitMyReview,
  type PublicReviewsSummary,
  type SpaceWiseReview,
} from "../utils/reviews";

const emptySummary: PublicReviewsSummary = { averageRating: null, totalPublished: 0, reviews: [] };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

function RatingStars({ rating, label }: { rating: number; label: string }) {
  return <span aria-label={label} style={{ color: "var(--warn)", letterSpacing: "0.12em", whiteSpace: "nowrap" }}>{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>;
}

function ReviewCard({ review, mine = false }: { review: SpaceWiseReview; mine?: boolean }) {
  return (
    <article style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 9 }}>
        <div>
          <div style={{ color: "var(--text)", fontWeight: 700 }}>{review.displayName || "SpaceWise user"}{mine ? " · Your review" : ""}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: 4 }}>{formatDate(review.updatedAt)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RatingStars rating={review.rating} label={`${review.rating} out of 5 stars`} />
          {mine && review.status === "hidden" && <span style={{ color: "var(--warn)", fontSize: "0.7rem" }}>Hidden from public</span>}
        </div>
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.reviewText}</p>
    </article>
  );
}

export default function ReviewsPage() {
  const { user, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState<PublicReviewsSummary>(emptySummary);
  const [myReview, setMyReview] = useState<SpaceWiseReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setLoading(true);
    setPageError("");
    loadReviewsSnapshot()
      .then(({ summary: publicSummary, myReview: ownReview }) => {
        if (!active) return;
        setSummary(publicSummary);
        setMyReview(ownReview);
        if (ownReview) {
          setRating(ownReview.rating);
          setDisplayName(ownReview.displayName);
          setReviewText(ownReview.reviewText);
        } else if (user) {
          const profileName = user.user_metadata?.name;
          setDisplayName(typeof profileName === "string" && profileName.trim() ? profileName.trim().slice(0, REVIEW_DISPLAY_NAME_MAX_LENGTH) : "SpaceWise user");
          setRating(0);
          setReviewText("");
        } else {
          setRating(0);
          setDisplayName("");
          setReviewText("");
        }
      })
      .catch(cause => {
        if (active) setPageError(cause instanceof Error ? cause.message : "Reviews could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    const normalizedName = displayName.trim();
    const normalizedText = reviewText.trim();
    if (!user) { setFormError("Sign in before submitting a review."); return; }
    if (rating < 1 || rating > 5) { setFormError("Choose a rating from 1 to 5 stars."); return; }
    if (normalizedName.length < 1 || normalizedName.length > REVIEW_DISPLAY_NAME_MAX_LENGTH) { setFormError(`Display name must be 1–${REVIEW_DISPLAY_NAME_MAX_LENGTH} characters.`); return; }
    if (normalizedText.length < REVIEW_TEXT_MIN_LENGTH || normalizedText.length > REVIEW_TEXT_MAX_LENGTH) { setFormError(`Review must be ${REVIEW_TEXT_MIN_LENGTH}–${REVIEW_TEXT_MAX_LENGTH} characters after trimming.`); return; }

    setSaving(true);
    try {
      const saved = await submitMyReview({ id: myReview?.id, displayName: normalizedName, rating, reviewText: normalizedText });
      setMyReview(saved);
      setSuccessMessage("Your review has been saved.");
      try {
        const snapshot = await loadReviewsSnapshot();
        setSummary(snapshot.summary);
        setMyReview(snapshot.myReview);
      } catch {
        setSuccessMessage("Your review was saved, but the published list could not refresh. Reload the page to see its current status.");
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Your review could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "0.75rem 0.85rem", border: "1px solid var(--input-border)", borderRadius: 8, background: "var(--input-bg)", color: "var(--input-text)", font: "inherit" };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "clamp(1rem,4vw,2.5rem)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
          <div>
            <Link href="/dashboard" style={{ color: "var(--accent)", textDecoration: "none", fontSize: "0.78rem", fontWeight: 700 }}>← SPACEWISE</Link>
            <h1 style={{ marginTop: 8, fontSize: "clamp(1.5rem,4vw,2.1rem)" }}>Reviews</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 5 }}>Share feedback and read reviews from the SpaceWise community.</p>
          </div>
          <ThemeToggle />
        </header>

        {loading || authLoading ? <section role="status" style={{ padding: "1.2rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>Loading reviews…</section> : pageError ? (
          <section role="alert" style={{ padding: "1.2rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Reviews unavailable</h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>{pageError}</p>
          </section>
        ) : (
          <>
            <section aria-label="Published review summary" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "1rem 1.2rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", marginBottom: "1.2rem" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>{summary.averageRating === null ? "—" : summary.averageRating.toFixed(1)} <span style={{ color: "var(--warn)", fontSize: "1.1rem" }}>★</span></div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>{summary.totalPublished} published review{summary.totalPublished === 1 ? "" : "s"}</p>
            </section>

            <section aria-labelledby="write-review-heading" style={{ padding: "clamp(1rem,3vw,1.5rem)", border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)", marginBottom: "1.5rem" }}>
              <h2 id="write-review-heading" style={{ fontSize: "1.05rem", marginBottom: 6 }}>{myReview ? "Edit your review" : "Write a review"}</h2>
              {myReview?.status === "hidden" && <p role="status" style={{ color: "var(--warn)", fontSize: "0.78rem", marginTop: 8 }}>Your review is currently hidden from the public list. Editing it will not change its moderation status.</p>}
              {user ? <form onSubmit={event => { void handleSubmit(event); }}>
                <label htmlFor="review-display-name" style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.8rem", margin: "1rem 0 0.4rem" }}>Display name</label>
                <input id="review-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={REVIEW_DISPLAY_NAME_MAX_LENGTH} required style={inputStyle} />

                <fieldset style={{ border: 0, marginTop: "1rem" }}>
                  <legend style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: 6 }}>Your rating</legend>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={rating === value} onClick={() => setRating(value)} style={{ border: 0, background: "transparent", color: value <= rating ? "var(--warn)" : "var(--text-muted)", fontSize: "1.8rem", cursor: "pointer", padding: "0 3px" }}>★</button>)}
                  </div>
                </fieldset>

                <label htmlFor="review-text" style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.8rem", margin: "0.7rem 0 0.4rem" }}>Your review ({REVIEW_TEXT_MIN_LENGTH}–{REVIEW_TEXT_MAX_LENGTH} characters)</label>
                <textarea id="review-text" value={reviewText} onChange={event => setReviewText(event.target.value)} minLength={REVIEW_TEXT_MIN_LENGTH} maxLength={REVIEW_TEXT_MAX_LENGTH} required rows={5} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textAlign: "right", marginTop: 4 }}>{reviewText.length}/{REVIEW_TEXT_MAX_LENGTH}</div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: 8 }}>Your display name, rating, review, and date are public when the review is published. Your email is never included. Editing a hidden review does not publish it.</p>
                {formError && <p role="alert" style={{ color: "var(--error)", fontSize: "0.8rem", marginTop: 10 }}>{formError}</p>}
                {successMessage && <p role="status" style={{ color: "var(--success)", fontSize: "0.8rem", marginTop: 10 }}>{successMessage}</p>}
                <button type="submit" disabled={saving} style={{ marginTop: 14, padding: "0.7rem 1.1rem", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface2)", color: "var(--accent)", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : myReview ? "Save changes" : "Submit review"}</button>
              </form> : <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 12 }}>Please <Link href="/login?next=%2Freviews" style={{ color: "var(--accent)" }}>sign in</Link> to write or edit a review.</p>}
            </section>

            <section aria-labelledby="published-reviews-heading">
              <h2 id="published-reviews-heading" style={{ fontSize: "1.05rem", marginBottom: "0.3rem" }}>Published reviews</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: "0.8rem" }}>Showing up to 100 of the most recent published reviews.</p>
              {summary.reviews.length === 0 ? <p role="status" style={{ padding: "1rem", border: "1px dashed var(--border)", borderRadius: 12, color: "var(--text-muted)" }}>No published reviews yet. You can be the first to share feedback.</p>
                : <div style={{ display: "grid", gap: "0.75rem" }}>{summary.reviews.map(review => <ReviewCard key={review.id} review={review} />)}</div>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
