"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./components/ThemeToggle";
import { getSupabaseClient } from "./utils/supabaseClient";

export default function Home() {
  const router = useRouter();

  async function handleStartPlanning(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      router.push(data.session ? "/room/new" : "/login?next=%2Froom%2Fnew");
    } catch {
      router.push("/login?next=%2Froom%2Fnew");
    }
  }

  return (
    <main className="home-page" style={{
      minHeight: "100vh",
      background: "var(--bg)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient glow blobs */}
      <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: 700, height: 400, background: "radial-gradient(ellipse, rgba(0,150,255,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "5%", right: "10%", width: 400, height: 300, background: "radial-gradient(ellipse, rgba(0,80,200,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* ── NAVBAR ── */}
      <nav className="home-navbar" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 2.5rem", height: 60,
        background: "var(--surface2)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="3" width="22" height="22" rx="2" stroke="var(--accent)" strokeWidth="1.2" fill="rgba(0,40,80,0.4)" />
            <rect x="7" y="12" width="6" height="10" rx="0.5" stroke="var(--accent)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <rect x="15" y="7" width="8" height="7" rx="0.5" stroke="var(--accent)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <line x1="3" y1="22" x2="25" y2="22" stroke="var(--accent)" strokeWidth="1" />
            <circle cx="22" cy="3" r="2" fill="var(--accent)" />
          </svg>
          <span style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "0.08em" }} className="cyan-gradient">SpaceWise</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <ThemeToggle />
          <Link href="/login" style={{
            padding: "7px 22px", borderRadius: 6,
            border: "1px solid var(--border-strong)",
            color: "var(--accent)", fontSize: "0.82rem", fontWeight: 600,
            letterSpacing: "0.06em", textDecoration: "none",
            background: "var(--surface2)",
            transition: "all 0.2s",
          }}>LOGIN</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "80px 1.5rem 2rem", position: "relative",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 16px", border: "1px solid var(--border-strong)",
          borderRadius: 20, background: "var(--surface2)", marginBottom: "1.4rem",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 6px var(--accent)", display: "inline-block" }} />
          <span style={{ fontSize: "0.68rem", letterSpacing: "0.2em", color: "var(--accent)", fontWeight: 600 }}>SMART ROOM PLANNING</span>
        </div>

        <h1 style={{ fontSize: "clamp(3rem, 7vw, 7.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: "0.35rem" }}>
          <span className="cyan-gradient">SpaceWise</span>
        </h1>
        <div style={{ fontSize: "clamp(1.1rem, 2.8vw, 2rem)", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text)", lineHeight: 1.2, marginBottom: "1.2rem" }}>
          <div>Plan Your Space</div>
          <div style={{ color: "var(--text-secondary)", fontWeight: 400, fontSize: "0.85em" }}>Buy Smarter</div>
        </div>

        <p style={{ fontSize: "clamp(0.9rem, 1.8vw, 1.1rem)", color: "var(--text-secondary)", maxWidth: 520, lineHeight: 1.7, marginBottom: "2.2rem", letterSpacing: "0.01em" }}>
          Visualize your room. Analyze your space. Buy furniture with confidence.
        </p>

        <Link href="/login?next=%2Froom%2Fnew" onClick={event => { void handleStartPlanning(event); }} className="glow-btn" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "14px 36px", borderRadius: 8, color: "#fff",
          fontWeight: 700, fontSize: "1rem", letterSpacing: "0.08em", textDecoration: "none",
        }}>START PLANNING →</Link>

        {/* ── ROOM VISUALIZATION ── */}
        <div className="home-visualization" style={{ position: "relative", marginTop: "3.5rem", width: "min(600px, 92vw)" }}>
          <div className="pulse-ring" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "110%", height: "110%", borderRadius: "50%", border: "1px solid var(--border)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "125%", height: "125%", borderRadius: "50%", border: "1px solid var(--border)", pointerEvents: "none" }} />

          <svg viewBox="0 0 400 320" width="100%" style={{ display: "block", filter: "drop-shadow(0 0 20px rgba(0,150,255,0.15))" }}>
            <rect x="30" y="20" width="340" height="280" className="room-wall" rx="2" />
            <line x1="30" y1="240" x2="30" y2="280" stroke="var(--accent)" strokeWidth="1.5" />
            <line x1="30" y1="200" x2="30" y2="240" stroke="var(--bg)" strokeWidth="3" />
            <path d="M30 200 Q70 200 70 240" fill="none" stroke="var(--accent)" strokeWidth="0.8" strokeDasharray="3,2" />
            <text x="34" y="225" className="dim-label">DOOR</text>
            <line x1="150" y1="20" x2="250" y2="20" stroke="var(--accent)" strokeWidth="2.5" />
            <line x1="170" y1="20" x2="170" y2="26" stroke="var(--accent)" strokeWidth="1" />
            <line x1="200" y1="20" x2="200" y2="26" stroke="var(--accent)" strokeWidth="1" />
            <line x1="230" y1="20" x2="230" y2="26" stroke="var(--accent)" strokeWidth="1" />
            <text x="175" y="36" className="dim-label">WINDOW · 3.3FT</text>
            <rect x="220" y="190" width="120" height="90" className="room-furniture" rx="3" />
            <rect x="220" y="190" width="120" height="22" fill="rgba(0,80,160,0.4)" stroke="var(--accent)" strokeWidth="0.8" rx="2" />
            <ellipse cx="240" cy="201" rx="8" ry="7" fill="rgba(0,120,200,0.3)" stroke="var(--accent)" strokeWidth="0.8" />
            <ellipse cx="260" cy="201" rx="8" ry="7" fill="rgba(0,120,200,0.3)" stroke="var(--accent)" strokeWidth="0.8" />
            <text x="255" y="248" className="dim-label" textAnchor="middle">BED · 6×4FT</text>
            <rect x="300" y="30" width="60" height="100" className="room-furniture" rx="2" />
            <line x1="330" y1="30" x2="330" y2="130" stroke="var(--accent)" strokeWidth="0.8" />
            <circle cx="326" cy="80" r="2" fill="var(--accent)" />
            <circle cx="334" cy="80" r="2" fill="var(--accent)" />
            <text x="330" y="145" className="dim-label" textAnchor="middle">WARDROBE</text>
            <rect x="50" y="30" width="110" height="55" className="room-furniture" rx="2" />
            <rect x="55" y="35" width="70" height="40" fill="rgba(0,60,120,0.3)" stroke="var(--accent)" strokeWidth="0.6" rx="1" />
            <rect x="130" y="38" width="22" height="14" fill="rgba(0,80,160,0.4)" stroke="var(--accent)" strokeWidth="0.6" rx="1" />
            <text x="105" y="100" className="dim-label" textAnchor="middle">STUDY TABLE · 3.6FT</text>
            <rect x="80" y="100" width="36" height="36" className="room-furniture" rx="3" />
            <rect x="84" y="104" width="28" height="20" fill="rgba(0,60,120,0.35)" stroke="var(--accent)" strokeWidth="0.6" rx="2" />
            <text x="98" y="150" className="dim-label" textAnchor="middle">CHAIR</text>
            <line x1="30" y1="310" x2="370" y2="310" stroke="var(--border)" strokeWidth="0.8" />
            <text x="200" y="318" className="dim-label" textAnchor="middle">12 FT</text>
            <line x1="385" y1="20" x2="385" y2="300" stroke="var(--border)" strokeWidth="0.8" />
            <text x="393" y="165" className="dim-label" textAnchor="middle" transform="rotate(90,393,165)">10 FT</text>
            <circle cx="30" cy="20" r="2.5" fill="var(--accent)" />
            <circle cx="370" cy="20" r="2.5" fill="var(--accent)" />
            <circle cx="30" cy="300" r="2.5" fill="var(--accent)" />
            <circle cx="370" cy="300" r="2.5" fill="var(--accent)" />
          </svg>

          {/* HUD PANELS */}
          <div className="hud-panel float-panel" style={{ position: "absolute", top: "8%", left: "-8%", padding: "8px 14px", borderRadius: 6, minWidth: 140 }}>
            <div style={{ fontSize: "0.6rem", color: "var(--text-label)", letterSpacing: "0.15em", marginBottom: 3 }}>SPACE UTILIZATION</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" }}>82%</div>
            <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginTop: 5 }}>
              <div style={{ width: "82%", height: "100%", background: "linear-gradient(90deg,var(--accent),var(--accent2))", borderRadius: 2 }} />
            </div>
          </div>
          <div className="hud-panel float-panel-2" style={{ position: "absolute", top: "8%", right: "-8%", padding: "8px 14px", borderRadius: 6 }}>
            <div style={{ fontSize: "0.6rem", color: "var(--text-label)", letterSpacing: "0.15em", marginBottom: 3 }}>FIT ANALYSIS</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--success)", letterSpacing: "0.05em" }}>✓ GOOD FIT</div>
          </div>
          <div className="hud-panel float-panel-3" style={{ position: "absolute", bottom: "18%", left: "-10%", padding: "8px 14px", borderRadius: 6, minWidth: 155 }}>
            <div style={{ fontSize: "0.6rem", color: "var(--text-label)", letterSpacing: "0.15em", marginBottom: 3 }}>WALKING SPACE</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", letterSpacing: "0.04em" }}>3.2 FT CLEAR</div>
          </div>
          <div className="hud-panel float-panel-4" style={{ position: "absolute", bottom: "18%", right: "-8%", padding: "8px 14px", borderRadius: 6 }}>
            <div style={{ fontSize: "0.6rem", color: "var(--text-label)", letterSpacing: "0.15em", marginBottom: 3 }}>AI VERDICT</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--accent3)", letterSpacing: "0.05em" }}>RECOMMENDED</div>
          </div>
        </div>
      </section>
      <style>{`
        @media (max-width: 600px) {
          .home-navbar { padding-left: 1rem !important; padding-right: 1rem !important; }
          .home-navbar a { padding-left: 14px !important; padding-right: 14px !important; }
          .home-visualization { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; margin-top: 2rem !important; }
          .home-visualization > svg { grid-column: 1 / -1; }
          .home-visualization .hud-panel { position: static !important; inset: auto !important; transform: none !important; min-width: 0 !important; padding: 7px 9px !important; }
        }
      `}</style>
    </main>
  );
}
