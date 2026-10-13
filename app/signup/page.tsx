"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import { getSupabaseClient } from "../utils/supabaseClient";

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  terms?: string;
}

const PW_RULES = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
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
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = "Full name is required.";
    if (!email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email address.";
    if (!password) e.password = "Password is required.";
    else if (!PW_RULES.test(password)) e.password = "Min 8 characters, include a letter and a number.";
    if (!confirm) e.confirm = "Please confirm your password.";
    else if (confirm !== password) e.confirm = "Passwords do not match.";
    if (!terms) e.terms = "You must accept the Terms & Conditions.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitted(true);
    setAuthMessage("");
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Supabase did not return an account. Please try again.");
      if (data.user && !data.session && data.user.identities?.length === 0) {
        setErrors({ email: "An account with this email already exists." });
        setSubmitted(false);
        return;
      }
      setErrors({});
      if (data.session && data.user) {
        router.replace("/dashboard");
      } else {
        setSubmitted(false);
        setAuthMessage("Account created. Check your email for the confirmation link, then sign in.");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not create the account. Please try again.";
      if (/already registered|already exists|user already/i.test(message)) setErrors({ email: "An account with this email already exists." });
      else setAuthMessage(message);
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
      <div style={{ position: "absolute", top: "10%", right: "20%", width: 500, height: 400, background: "radial-gradient(ellipse, rgba(0,100,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "5%", left: "10%", width: 400, height: 300, background: "radial-gradient(ellipse, rgba(0,60,180,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 460 }}>
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
              GET STARTED
            </div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em", marginBottom: "0.4rem" }}>
              Create your account
            </h1>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Plan smarter. Buy with confidence.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Full Name */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "rgba(160,200,255,0.7)", letterSpacing: "0.08em", marginBottom: 6 }}>
                FULL NAME
              </label>
              <input
                type="text"
                className={`auth-input${errors.name ? " error" : ""}`}
                placeholder="Jane Smith"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
              />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "rgba(160,200,255,0.7)", letterSpacing: "0.08em", marginBottom: 6 }}>
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
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "rgba(160,200,255,0.7)", letterSpacing: "0.08em", marginBottom: 6 }}>
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  className={`auth-input${errors.password ? " error" : ""}`}
                  placeholder="Min 8 chars, letter + number"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(0,212,255,0.5)", padding: 2, lineHeight: 1 }} aria-label="Toggle password">
                  <EyeIcon open={showPw} />
                </button>
              </div>
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "rgba(160,200,255,0.7)", letterSpacing: "0.08em", marginBottom: 6 }}>
                CONFIRM PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"}
                  className={`auth-input${errors.confirm ? " error" : ""}`}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(0,212,255,0.5)", padding: 2, lineHeight: 1 }} aria-label="Toggle confirm password">
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {errors.confirm && <p className="field-error">{errors.confirm}</p>}
            </div>

            {/* Terms */}
            <div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", userSelect: "none" }}>
                <div
                  onClick={() => setTerms(v => !v)}
                  style={{
                    width: 17, height: 17, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    border: `1px solid ${errors.terms ? "rgba(255,80,100,0.6)" : terms ? "rgba(0,212,255,0.7)" : "rgba(0,212,255,0.25)"}`,
                    background: terms ? "rgba(0,212,255,0.15)" : "rgba(0,20,50,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                >
                  {terms && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: "0.82rem", color: "rgba(160,180,255,0.65)", lineHeight: 1.4 }}>
                  I agree to the{" "}
                  <span style={{ color: "#00d4ff", fontWeight: 600 }}>Terms &amp; Conditions</span>
                  {" "}and{" "}
                  <span style={{ color: "#00d4ff", fontWeight: 600 }}>Privacy Policy</span>
                </span>
              </label>
              {errors.terms && <p className="field-error" style={{ marginTop: 5 }}>{errors.terms}</p>}
            </div>

            {/* Submit */}
            <button type="submit" className="auth-submit" style={{ marginTop: "0.3rem" }} disabled={submitted}>
              {submitted ? "CREATING ACCOUNT…" : "CREATE ACCOUNT →"}
            </button>
          </form>
          {authMessage && <p role={authMessage.startsWith("Account created") ? "status" : "alert"} style={{ marginTop: "0.8rem", color: authMessage.startsWith("Account created") ? "var(--success)" : "var(--error)", fontSize: "0.82rem" }}>{authMessage}</p>}

          {/* Footer link */}
          <p style={{ textAlign: "center", marginTop: "1.4rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "#00d4ff", textDecoration: "none", fontWeight: 600 }}>
              Sign in
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
