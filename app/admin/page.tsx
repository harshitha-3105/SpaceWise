"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { isSpaceWiseAdmin, loadAdminOverview, setAdminReviewStatus, type AdminOverview } from "../utils/admin";

type PageState = "loading" | "ready" | "signed-out" | "unauthorized" | "error";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function StatePanel({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <section role="status" style={{ maxWidth: 640, margin: "4rem auto", padding: "clamp(1.4rem,4vw,2.4rem)", border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface)", textAlign: "center" }}>
      <div style={{ color: "var(--accent)", fontSize: "0.62rem", letterSpacing: "0.18em", fontWeight: 700, marginBottom: 10 }}>SPACEWISE ADMIN</div>
      <h1 style={{ color: "var(--text)", fontSize: "1.35rem", marginBottom: 10 }}>{title}</h1>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: action ? 20 : 0 }}>{message}</p>
      {action}
    </section>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article style={{ minWidth: 0, padding: "1.1rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
      <div style={{ color: "var(--text-label)", fontSize: "0.62rem", letterSpacing: "0.13em", marginBottom: 9 }}>{label}</div>
      <div style={{ color: "var(--text)", fontSize: "clamp(1.3rem,3vw,1.8rem)", fontWeight: 800, overflowWrap: "anywhere" }}>{value}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", marginTop: 5 }}>{detail}</div>
    </article>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 100, marginTop: "1.25rem", padding: "clamp(1rem,2.5vw,1.5rem)", border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ color: "var(--text)", fontSize: "1.05rem", marginBottom: 5 }}>{title}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: 1.5 }}>{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [moderatingReviewId, setModeratingReviewId] = useState<string | null>(null);
  const [reviewActionMessage, setReviewActionMessage] = useState("");
  const [reviewActionError, setReviewActionError] = useState("");

  useEffect(() => {
    let active = true;
    async function verifyAndLoad() {
      if (authLoading) return;
      if (!user) {
        setOverview(null);
        setPageState("signed-out");
        return;
      }
      setPageState("loading");
      setErrorMessage("");
      try {
        const isAdmin = await isSpaceWiseAdmin();
        if (!active) return;
        if (!isAdmin) {
          setOverview(null);
          setPageState("unauthorized");
          return;
        }
        const result = await loadAdminOverview();
        if (!active) return;
        setOverview(result);
        setPageState("ready");
      } catch (cause) {
        if (!active) return;
        setErrorMessage(cause instanceof Error ? cause.message : "Admin data could not be loaded.");
        setPageState("error");
      }
    }
    void verifyAndLoad();
    return () => { active = false; };
  }, [authLoading, user, retry]);

  const buttonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "9px 15px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface2)", color: "var(--text)", textDecoration: "none", fontSize: "0.8rem", fontWeight: 650, cursor: "pointer" };

  async function moderateReview(reviewId: string, status: "published" | "hidden") {
    setModeratingReviewId(reviewId);
    setReviewActionMessage("");
    setReviewActionError("");
    try {
      await setAdminReviewStatus(reviewId, status);
      setOverview(await loadAdminOverview());
      setReviewActionMessage(status === "hidden" ? "Review hidden from the public list." : "Review republished.");
    } catch (cause) {
      setReviewActionError(cause instanceof Error ? cause.message : "Review moderation failed.");
    } finally {
      setModeratingReviewId(null);
    }
  }

  if (authLoading || pageState === "loading") {
    return <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.2rem" }}><StatePanel title="Verifying admin access" message="Checking your Supabase session and database-authorized admin role…" /></main>;
  }
  if (pageState === "signed-out") {
    return <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.2rem" }}><StatePanel title="Sign in required" message="Sign in with the account authorized for SpaceWise administration." action={<Link href="/login" style={buttonStyle}>Go to sign in</Link>} /></main>;
  }
  if (pageState === "unauthorized") {
    return <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.2rem" }}><StatePanel title="Admin access denied" message="This Supabase account is not listed as an authorized SpaceWise administrator. No admin records were loaded." action={<Link href="/dashboard" style={buttonStyle}>Return to dashboard</Link>} /></main>;
  }
  if (pageState === "error" || !overview) {
    return <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.2rem" }}><StatePanel title="Admin data unavailable" message={errorMessage || "The admin overview is unavailable. No statistics or records are being fabricated."} action={<button type="button" style={buttonStyle} onClick={() => setRetry(value => value + 1)}>Try again</button>} /></main>;
  }

  const navigation = [
    ["Overview", "#overview"],
    ["Users", "#users"],
    ["Room plans", "#room-plans"],
    ["Reviews", "#reviews"],
  ];

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "clamp(1rem,3vw,2rem)" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingBottom: "1.2rem", borderBottom: "1px solid var(--border)" }}>
          <div>
            <Link href="/dashboard" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 750, letterSpacing: "0.06em" }}>SPACEWISE</Link>
            <h1 style={{ fontSize: "clamp(1.35rem,3vw,1.9rem)", marginTop: 7, fontWeight: 800 }}>Admin dashboard</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.76rem", marginTop: 4 }}>Database-verified administration · signed in as {user?.email ?? "authorized account"}</p>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}><ThemeToggle /><Link href="/dashboard/select" style={buttonStyle}>Switch dashboards</Link><Link href="/dashboard" style={buttonStyle}>User dashboard</Link></div>
        </header>

        <nav aria-label="Admin sections" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "1rem 0", borderBottom: "1px solid var(--border)" }}>
          {navigation.map(([label, href]) => <a key={href} href={href} style={{ ...buttonStyle, whiteSpace: "nowrap" }}>{label}</a>)}
        </nav>

        <section id="overview" style={{ scrollMarginTop: 100, paddingTop: "1.25rem" }}>
          <div style={{ marginBottom: "0.8rem" }}><h2 style={{ fontSize: "1.05rem", marginBottom: 5 }}>Overview</h2><p style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Counts come from Supabase Auth and the existing database tables.</p></div>
          <div className="admin-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "0.8rem" }}>
            <StatCard label="REGISTERED USERS" value={String(overview.registeredUsers)} detail="Supabase Auth accounts" />
            <StatCard label="VERIFIED EMAILS" value={String(overview.verifiedEmailUsers)} detail="Email confirmation recorded" />
            <StatCard label="PENDING VERIFICATION" value={String(overview.pendingEmailVerificationUsers)} detail="Accounts not yet email-confirmed" />
            <StatCard label="SAVED ROOM PLANS" value={overview.roomPlansAvailable && overview.totalRoomPlans !== null ? String(overview.totalRoomPlans) : "Unavailable"} detail={overview.roomPlansAvailable ? "Existing room_plans table" : "Expected schema unavailable"} />
            <StatCard label="REVIEWS" value={overview.reviewsModuleAvailable && overview.totalReviews !== null ? String(overview.totalReviews) : "Unavailable"} detail={overview.reviewsModuleAvailable ? "All review records" : "Review migration unavailable"} />
            <StatCard label="ADMIN ACCOUNT" value="Authorized" detail="Verified by a protected Supabase function" />
          </div>
        </section>

        <Section id="users" title="Users" description={`Showing up to ${overview.users.length} recent accounts; the registered-user total above counts the full Auth user table. Only account email and sign-in timestamps are shown.`}>
          {overview.users.length === 0 ? <p style={{ color: "var(--text-muted)", padding: "0.8rem" }}>No registered user records are available.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead><tr>{["Email", "Email status", "Registered", "Last sign-in"].map(label => <th key={label} scope="col" style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-label)", borderBottom: "1px solid var(--border)", fontWeight: 650 }}>{label}</th>)}</tr></thead>
                <tbody>{overview.users.map(account => <tr key={account.id}>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text)", overflowWrap: "anywhere" }}>{account.email || "Email unavailable"}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: account.emailConfirmedAt ? "var(--success, #2e9d65)" : "var(--text-muted)" }}>{account.emailConfirmedAt ? "Verified" : "Pending verification"}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{formatDate(account.createdAt)}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{formatDate(account.lastSignInAt)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </Section>

        <Section id="room-plans" title="Room plans" description="Recent plan metadata only. Furniture contents and full saved plan JSON are not exposed in the admin overview.">
          {!overview.roomPlansAvailable ? <p role="status" style={{ color: "var(--text-muted)", padding: "0.8rem", borderRadius: 8, background: "var(--surface2)" }}>Room-plan data is unavailable. Confirm that the existing room_plans table has the expected schema and that the admin migration is installed.</p>
            : overview.roomPlans.length === 0 ? <p style={{ color: "var(--text-muted)", padding: "0.8rem" }}>No saved room plans yet.</p>
              : <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead><tr>{["Room", "Type", "Dimensions", "Owner ID", "Updated"].map(label => <th key={label} scope="col" style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-label)", borderBottom: "1px solid var(--border)", fontWeight: 650 }}>{label}</th>)}</tr></thead>
                  <tbody>{overview.roomPlans.map(plan => <tr key={plan.id}>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>{plan.roomName}</td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{plan.roomType}</td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{plan.roomLength} × {plan.roomWidth} ft</td>
                    <td title={plan.ownerId} style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "monospace" }}>{plan.ownerId.slice(0, 8)}…</td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(plan.updatedAt)}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
        </Section>

        <Section id="reviews" title="Reviews" description="Recent reviews and moderation status. Review records include the public display name but no account email.">
          {!overview.reviewsModuleAvailable ? <div role="status" style={{ padding: "1rem", border: "1px dashed var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
            <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 5 }}>Review data unavailable</div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: 1.5 }}>The Reviews table or updated admin overview migration is not installed or its expected schema is unavailable. Counts and review records are not treated as zero.</p>
          </div> : <>
            <div className="admin-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "0.7rem", marginBottom: "1rem" }}>
              <StatCard label="TOTAL" value={String(overview.totalReviews ?? "Unavailable")} detail="All moderation states" />
              <StatCard label="PUBLISHED" value={String(overview.publishedReviews ?? "Unavailable")} detail="Visible to visitors" />
              <StatCard label="HIDDEN" value={String(overview.hiddenReviews ?? "Unavailable")} detail="Not publicly listed" />
              <StatCard label="AVERAGE RATING" value={overview.averagePublishedRating === null ? "—" : `${overview.averagePublishedRating.toFixed(1)} / 5`} detail="Published reviews only" />
            </div>
            {reviewActionMessage && <p role="status" style={{ color: "var(--success)", fontSize: "0.8rem", marginBottom: 10 }}>{reviewActionMessage}</p>}
            {reviewActionError && <p role="alert" style={{ color: "var(--error)", fontSize: "0.8rem", marginBottom: 10 }}>{reviewActionError}</p>}
            {overview.reviews.length === 0 ? <p role="status" style={{ color: "var(--text-muted)", padding: "0.8rem" }}>No review records are available.</p> : <div style={{ display: "grid", gap: "0.7rem" }}>
              {overview.reviews.map(review => <article key={review.id} style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{review.displayName}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: 4 }}>{review.rating}/5 · {formatDate(review.updatedAt)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: review.status === "published" ? "var(--success)" : "var(--warn)", fontSize: "0.75rem", fontWeight: 700 }}>{review.status === "published" ? "Published" : "Hidden"}</span>
                    <button type="button" disabled={moderatingReviewId !== null} onClick={() => { void moderateReview(review.id, review.status === "published" ? "hidden" : "published"); }} style={{ ...buttonStyle, padding: "6px 10px", fontSize: "0.72rem", opacity: moderatingReviewId !== null ? 0.65 : 1 }}>
                      {moderatingReviewId === review.id ? "Saving…" : review.status === "published" ? "Hide review" : "Republish"}
                    </button>
                  </div>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.reviewText}</p>
              </article>)}
            </div>}
          </>}
        </Section>
      </div>
      <style>{`@media (max-width: 760px) { .admin-stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; } } @media (max-width: 420px) { .admin-stat-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </main>
  );
}
