"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import { getSupabaseClient } from "../utils/supabaseClient";
import { isSpaceWiseAdmin } from "../utils/admin";

interface Errors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  function validate(): Errors {
    const e: Errors = {};
    if (!email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email address.";
    if (!password) e.password = "Password is required.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrs = validate();
    if (Object.keys(fieldErrs).length > 0) { setErrors(fieldErrs); return; }
    setSubmitted(true);
    setAuthMessage("");
    try {
      const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      if (!data.user || !data.session) throw new Error("Sign-in did not return an active session. Check your email confirmation and try again.");
      setErrors({});
      const next = new URLSearchParams(window.location.search).get("next");
      let isAdmin = false;
      try {
        isAdmin = await isSpaceWiseAdmin();
      } catch {
        // Authorization failures must not grant admin access; the dashboard remains available.
      }
      const destination = isAdmin
        ? "/dashboard/select"
        : next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      router.replace(destination);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not sign in. Please try again.";
      if (/invalid login credentials|user not found|email not confirmed/i.test(message)) {
        setErrors({ email: /not confirmed/i.test(message) ? "Confirm your email before signing in." : "Email or password is incorrect. If you are using an older local account, create a Supabase account with this email first." });
      } else {
        setAuthMessage(message);
      }
      setSubmitted(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}><ThemeToggle /></div>
      {/* Ambient glows */}
      <div style={{ position: "absolute", top: "15%", left: "20%", width: 500, height: 400, background: "radial-gradient(ellipse, rgba(0,120,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "15%", width: 400, height: 300, background: "radial-gradient(ellipse, rgba(0,60,180,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: "2rem" }}>
          <svg width="30" height="30" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="3" width="22" height="22" rx="2" stroke="rgba(0,212,255,0.7)" strokeWidth="1.2" fill="rgba(0,40,80,0.4)" />
            <rect x="7" y="12" width="6" height="10" rx="0.5" stroke="rgba(0,212,255,0.5)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <rect x="15" y="7" width="8" height="7" rx="0.5" stroke="rgba(0,212,255,0.5)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <line x1="3" y1="22" x2="25" y2="22" stroke="rgba(0,212,255,0.4)" strokeWidth="1" />
            <circle cx="22" cy="3" r="2" fill="rgba(0,212,255,0.6)" />
          </svg>
          <span style={{ fontSize: "1.4rem", fontWeight: 700, letterSpacing: "0.08em" }} className="cyan-gradient">SpaceWise</span>
        </div>

        {/* Card */}
        <div className="auth-card" style={{ padding: "clamp(1.5rem, 5vw, 2.5rem)" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "1.8rem" }}>
            <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: "rgba(0,212,255,0.6)", fontWeight: 600, marginBottom: "0.6rem" }}>
              SMART ROOM PLANNING
            </div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em", marginBottom: "0.4rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
              Welcome back
              <span style={{ fontSize: "1.1rem", opacity: 0.85 }} role="img" aria-label="sparkle">✦</span>
            </h1>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Plan smarter. Buy with confidence.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            {/* Email */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", marginBottom: 6 }}>
                EMAIL
              </label>
              <input
                type="email"
                className={`auth-input${errors.email ? " error" : ""}`}
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", marginBottom: 6 }}>
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  className={`auth-input${errors.password ? " error" : ""}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(0,212,255,0.5)", padding: 2, lineHeight: 1 }}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>

            {/* Remember me */}
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", userSelect: "none" }}>
              <div
                onClick={() => setRemember(v => !v)}
                style={{
                  width: 17, height: 17, borderRadius: 4, flexShrink: 0,
                  border: `1px solid ${remember ? "rgba(0,212,255,0.7)" : "rgba(0,212,255,0.25)"}`,
                  background: remember ? "rgba(0,212,255,0.15)" : "rgba(0,20,50,0.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}
              >
                {remember && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Remember me</span>
            </label>

            {/* Submit */}
            <button type="submit" className="auth-submit" style={{ marginTop: "0.3rem" }} disabled={submitted}>
              {submitted ? "SIGNING IN…" : "LOGIN →"}
            </button>
          </form>
          {authMessage && <p role="alert" className="field-error" style={{ marginTop: "0.8rem" }}>{authMessage}</p>}

          {/* Footer link */}
          <p style={{ textAlign: "center", marginTop: "1.4rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: "#00d4ff", textDecoration: "none", fontWeight: 600 }}>
              Create one
            </Link>
          </p>
        </div>

        {/* Back to home */}
        <p style={{ textAlign: "center", marginTop: "1.2rem", fontSize: "0.78rem" }}>
          <Link href="/" style={{ color: "rgba(0,212,255,0.4)", textDecoration: "none", letterSpacing: "0.05em" }}>
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
