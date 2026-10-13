"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../../components/ThemeToggle";
import { useAuth } from "../../context/AuthContext";
import { isSpaceWiseAdmin } from "../../utils/admin";

type AccessState = "checking" | "allowed" | "denied" | "error";

export default function DashboardSelectPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [access, setAccess] = useState<AccessState>("checking");
  const [retry, setRetry] = useState(0);

  const verifyAccess = useCallback(async () => {
    try {
      setAccess(await isSpaceWiseAdmin() ? "allowed" : "denied");
    } catch {
      setAccess("error");
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=%2Fdashboard%2Fselect");
      return;
    }
    setAccess("checking");
    void verifyAccess();
  }, [authLoading, user, router, retry, verifyAccess]);

  useEffect(() => {
    if (access === "denied") router.replace("/dashboard");
  }, [access, router]);

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--text)",
    padding: "clamp(1rem, 4vw, 2.5rem)",
  };

  if (authLoading || !user || access === "checking" || access === "denied") {
    return <main style={{ ...pageStyle, display: "grid", placeItems: "center" }}><p role="status" style={{ color: "var(--text-secondary)" }}>Verifying administrator access…</p></main>;
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: "clamp(2rem, 7vh, 4rem)" }}>
          <Link href="/dashboard" className="cyan-gradient" style={{ fontSize: "1.05rem", fontWeight: 750, letterSpacing: "0.07em", textDecoration: "none" }}>SpaceWise</Link>
          <ThemeToggle />
        </header>

        {access === "error" ? (
          <section role="alert" style={{ maxWidth: 560, margin: "0 auto", padding: "clamp(1.5rem, 4vw, 2.5rem)", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16 }}>
            <h1 style={{ fontSize: "1.35rem", marginBottom: 10 }}>Administrator access unavailable</h1>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>SpaceWise could not verify your administrator permission. No admin dashboard links are available until verification succeeds.</p>
            <button type="button" onClick={() => setRetry(value => value + 1)} className="view-plan-btn">Try again</button>
          </section>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <div style={{ color: "var(--text-label)", fontSize: "0.65rem", letterSpacing: "0.18em", fontWeight: 650, marginBottom: 9 }}>WORKSPACE</div>
              <h1 style={{ fontSize: "clamp(1.6rem, 5vw, 2.35rem)", fontWeight: 800, marginBottom: 9 }}>Choose your dashboard</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Signed in as {user.email || "authorized account"}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
              <Link href="/admin" style={{ display: "block", padding: "clamp(1.4rem, 4vw, 2rem)", border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface)", color: "var(--text)", textDecoration: "none", transition: "border-color 150ms ease, transform 150ms ease" }}>
                <div style={{ color: "var(--accent)", fontSize: "0.65rem", letterSpacing: "0.14em", fontWeight: 700, marginBottom: 12 }}>ADMINISTRATION</div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 750, marginBottom: 8 }}>Admin Dashboard</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.84rem", lineHeight: 1.55 }}>Manage users, room plans, and reviews.</p>
              </Link>
              <Link href="/dashboard" style={{ display: "block", padding: "clamp(1.4rem, 4vw, 2rem)", border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface)", color: "var(--text)", textDecoration: "none", transition: "border-color 150ms ease, transform 150ms ease" }}>
                <div style={{ color: "var(--accent)", fontSize: "0.65rem", letterSpacing: "0.14em", fontWeight: 700, marginBottom: 12 }}>ROOM PLANNING</div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 750, marginBottom: 8 }}>User Dashboard</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.84rem", lineHeight: 1.55 }}>Create room plans, manage furniture, and view saved plans.</p>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
