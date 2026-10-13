"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import { notifyStorageChange, useBrowserStorageValue } from "../utils/browserStorage";
import { CURRENT_ROOM_KEY, EDITING_ROOM_KEY, ROOM_PLANS_KEY } from "../utils/roomStorage";
import { useAuth } from "../context/AuthContext";
import { isSpaceWiseAdmin } from "../utils/admin";
import { deleteRoomPlan, importLocalRoomPlans, loadRoomPlans, type StoredRoomPlan } from "../utils/roomPlans";

interface RoomPlan {
  id: string; name: string; type: string; dimensions: string;
  furniture: number; planned: number; utilization: number; updated: string;
  plan: StoredRoomPlan;
}
const NAV = [
  { label: "Dashboard",       icon: GridIcon,     href: "/dashboard", key: "dashboard" },
  { label: "Create Room Plan",icon: PlusIcon,     href: "/room/new",  key: "create" },
  { label: "My Rooms",        icon: RoomsIcon,    href: "/rooms", key: "rooms" },
  { label: "Reviews",         icon: StarIcon,     href: "/reviews", key: "reviews" },
  { label: "Analysis",        icon: ChartIcon,    href: "/rooms", key: "analysis" },
  { label: "Settings",        icon: GearIcon,     href: "/settings", key: "settings" },
];

export default function DashboardPage({ view = "dashboard" }: { view?: "dashboard" | "rooms" | "settings" }) {
  const router = useRouter();
  const { user, loading: authLoading, error: authError } = useAuth();
  const [cloudPlans, setCloudPlans] = useState<StoredRoomPlan[]>([]);
  const [cloudOwnerId, setCloudOwnerId] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(view !== "settings");
  const [cloudError, setCloudError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let active = true;
    if (authLoading || !user) {
      setIsAdmin(false);
      return () => { active = false; };
    }
    isSpaceWiseAdmin().then(authorized => {
      if (active) setIsAdmin(authorized);
    }).catch(() => {
      if (active) setIsAdmin(false);
    });
    return () => { active = false; };
  }, [authLoading, user?.id]);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (view === "settings") return;
    let active = true;
    loadRoomPlans().then(plans => {
      if (active) { setCloudOwnerId(user.id); setCloudPlans(plans); setCloudError(""); }
    }).catch(cause => {
      if (active) { setCloudOwnerId(user.id); setCloudError(cause instanceof Error ? cause.message : "Could not load cloud room plans."); }
    }).finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [authLoading, user, router, reloadKey, view]);
  const session = useBrowserStorageValue("sw_session");
  const userName = useMemo(() => {
    try { return JSON.parse(session || "{}").name?.trim() || "Account unavailable"; }
    catch { return "Account unavailable"; }
  }, [session]);
  const savedPlans = useBrowserStorageValue(ROOM_PLANS_KEY);
  const localPlans = useMemo<StoredRoomPlan[]>(() => {
    try {
      const saved = JSON.parse(savedPlans || "[]");
      return Array.isArray(saved) ? saved.filter((plan: StoredRoomPlan) => Boolean(plan?.id && plan?.room)) : [];
    } catch { return []; }
  }, [savedPlans]);
  const activeCloudPlans = useMemo(() => cloudOwnerId === user?.id ? cloudPlans : [], [cloudOwnerId, user?.id, cloudPlans]);
  const activeCloudError = cloudOwnerId === user?.id ? cloudError : "";
  const roomPlans = activeCloudPlans;
  const cloudPlanIds = useMemo(() => new Set(activeCloudPlans.map(plan => plan.id)), [activeCloudPlans]);
  const rooms = useMemo<RoomPlan[]>(() => roomPlans.map(plan => {
    const length = Number.parseFloat(plan.room.length) || 0;
    const width = Number.parseFloat(plan.room.width) || 0;
    const items = [...(plan.existing || []), ...(plan.planned || [])];
    const area = length * width;
    const used = items.reduce((sum, item) => sum + ((Number.parseFloat(item.length) || 0) * (Number.parseFloat(item.width) || 0)), 0);
    const lastUpdated = plan.updatedAt || plan.createdAt;
    return { id: plan.id, name: plan.room.name, type: plan.room.type, dimensions: `${length} × ${width} ft`, furniture: items.length, planned: plan.planned?.length || 0, utilization: area ? Math.min(99, Math.round(used / area * 100)) : 0, updated: lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "Recently", plan };
  }), [roomPlans]);
  const analysisHref = rooms[0] ? `/room/${rooms[0].id}/analysis` : "/rooms";
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try {
      const { getSupabaseClient } = await import("../utils/supabaseClient");
      const auth = getSupabaseClient().auth;
      const { error } = await auth.signOut();
      if (error) {
        const { error: localError } = await auth.signOut({ scope: "local" });
        if (localError) throw error;
      }
      localStorage.removeItem("sw_session");
      notifyStorageChange("sw_session");
      router.replace("/login");
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  function openPlan(plan: StoredRoomPlan) {
    sessionStorage.setItem(CURRENT_ROOM_KEY, JSON.stringify(plan));
    notifyStorageChange(CURRENT_ROOM_KEY, "session");
    router.push("/room/new/layout");
  }

  function editRoom(plan: StoredRoomPlan) {
    sessionStorage.setItem(EDITING_ROOM_KEY, plan.id);
    notifyStorageChange(EDITING_ROOM_KEY, "session");
    router.push("/room/new");
  }

  function createRoom() {
    sessionStorage.removeItem(EDITING_ROOM_KEY);
    notifyStorageChange(EDITING_ROOM_KEY, "session");
    router.push("/room/new");
  }

  async function deleteRoom(plan: StoredRoomPlan) {
    if (!window.confirm(`Delete the room plan “${plan.room.name}”? This cannot be undone.`)) return;
    try {
      if (cloudPlanIds.has(plan.id)) {
        await deleteRoomPlan(plan.id);
        setCloudPlans(current => current.filter(item => item.id !== plan.id));
      }
      setCloudError("");
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : "Could not delete this room plan.");
      return;
    }
    try {
      const current = JSON.parse(sessionStorage.getItem(CURRENT_ROOM_KEY) || "null");
      if (current?.id === plan.id) {
        sessionStorage.removeItem(CURRENT_ROOM_KEY);
        notifyStorageChange(CURRENT_ROOM_KEY, "session");
      }
    } catch { /* Keep the saved room list update. */ }
    if (sessionStorage.getItem(EDITING_ROOM_KEY) === plan.id) {
      sessionStorage.removeItem(EDITING_ROOM_KEY);
      notifyStorageChange(EDITING_ROOM_KEY, "session");
    }
  }

  async function importLegacyPlans() {
    if (localPlans.length === 0) return;
    const confirmed = window.confirm(`This browser contains ${localPlans.length} local room plan${localPlans.length === 1 ? "" : "s"}. Importing will assign them to the currently signed-in account. Continue only if these plans belong to you; do not import another account's or demo plans.`);
    if (!confirmed) return;
    setImporting(true);
    setImportMessage("");
    try {
      const result = await importLocalRoomPlans(localPlans);
      setCloudPlans(await loadRoomPlans());
      setImportMessage(`Imported ${result.imported} room plan${result.imported === 1 ? "" : "s"}; ${result.alreadyPresent} already existed in Supabase. Verify imported plans by opening View Plan and Analyze before removing any local data.`);
      setCloudError("");
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : "Could not import local room plans.");
    } finally {
      setImporting(false);
    }
  }

  const totalFurniture = rooms.reduce((s, r) => s + r.furniture, 0);
  const avgUtilization = rooms.length ? Math.round(rooms.reduce((s, r) => s + r.utilization, 0) / rooms.length) : 0;

  const stats = [
    { label: "Room Plans",       value: rooms.length,      sub: "Active layouts",    icon: RoomsIcon,     color: "#00d4ff" },
    { label: "Furniture Items",  value: totalFurniture,    sub: "Across all rooms",  icon: FurnitureIcon, color: "#7b8fff" },
    { label: "Space Utilization",value: rooms.length ? `${avgUtilization}%` : "—", sub: rooms.length ? "Average efficiency" : "No room data yet", icon: ChartIcon, color: "#4fffb0" },
    { label: "Planned Furniture", value: rooms.reduce((sum, room) => sum + room.planned, 0), sub: "Across all rooms", icon: StarIcon, color: "#ffb347" },
  ];

  if (authLoading || (view !== "settings" && user && (cloudLoading || cloudOwnerId !== user.id))) return <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center" }}>Loading your room plans…</main>;
  if (!user) return <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center" }}>{authError || "Redirecting to sign in…"}</main>;
  if (view !== "settings" && activeCloudError) return <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center", padding: "1.5rem" }}><section style={{ maxWidth: 520, textAlign: "center", padding: "2rem", border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)" }}><h1 style={{ color: "var(--text)", fontSize: "1.25rem", marginBottom: "0.8rem" }}>Room plans unavailable</h1><p role="alert" style={{ color: "var(--text-secondary)", overflowWrap: "anywhere", marginBottom: "1rem" }}>{activeCloudError}</p><p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "1.2rem" }}>No local or demo plans are being used as a fallback.</p><button type="button" className="view-plan-btn" onClick={() => { setCloudLoading(true); setReloadKey(value => value + 1); }}>Try again</button></section></main>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: "5%", left: "30%", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(0,100,255,0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "10%", right: "5%", width: 400, height: 300, background: "radial-gradient(ellipse, rgba(0,60,180,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* SIDEBAR */}
      <aside className="dash-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 20px 1.6rem" }}>
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="3" width="22" height="22" rx="2" stroke="var(--accent)" strokeWidth="1.2" fill="rgba(0,40,80,0.4)" />
            <rect x="7" y="12" width="6" height="10" rx="0.5" stroke="var(--accent)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <rect x="15" y="7" width="8" height="7" rx="0.5" stroke="var(--accent)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <line x1="3" y1="22" x2="25" y2="22" stroke="var(--accent)" strokeWidth="1" />
            <circle cx="22" cy="3" r="2" fill="var(--accent)" />
          </svg>
          <span style={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.07em" }} className="cyan-gradient">SpaceWise</span>
        </div>

        <div style={{ padding: "0 20px 0.5rem", fontSize: "0.6rem", letterSpacing: "0.18em", color: "var(--text-label)", fontWeight: 600 }}>NAVIGATION</div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ label, icon: Icon, href, key }) => (
            <Link key={key} href={key === "analysis" ? analysisHref : href} onClick={() => { if (key === "create") { sessionStorage.removeItem(EDITING_ROOM_KEY); notifyStorageChange(EDITING_ROOM_KEY, "session"); } }} className={`dash-nav-item${(view === "dashboard" && key === "dashboard") || (view === "rooms" && key === "rooms") || (view === "settings" && key === "settings") ? " active" : ""}`}>
              <Icon size={15} />{label}
            </Link>
          ))}
          {isAdmin && <Link href="/dashboard/select" className="dash-nav-item"><GridIcon size={15} />Switch dashboards</Link>}
        </nav>

        <div style={{ padding: "1rem 20px 0", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: "0.8rem" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#00d4ff,#0055ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0, color: "#fff" }}>
              {userName[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>{userName}</div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-label)", letterSpacing: "0.05em" }}>{userName === "Account unavailable" ? "ACCOUNT UNAVAILABLE" : "SUPABASE SESSION"}</div>
            </div>
          </div>
          <div style={{ marginBottom: "0.5rem" }}><ThemeToggle /></div>
          <button onClick={handleLogout} className="dash-nav-item" style={{ color: "rgba(255,100,120,0.7)", width: "100%", paddingLeft: 0 }}>
            <LogoutIcon size={15} />Logout
          </button>
        </div>
      </aside>

      {/* MOBILE TOP BAR */}
      <div className="dash-mobile-bar" style={{ display: "none", position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, height: 54, background: "var(--sidebar-bg)", borderBottom: "1px solid var(--border)", alignItems: "center", justifyContent: "space-between", padding: "0 1rem", backdropFilter: "blur(12px)" }}>
        <span style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.07em" }} className="cyan-gradient">SpaceWise</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          <button onClick={() => setMobileOpen(v => !v)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="2" y1="5" x2="18" y2="5" /><line x1="2" y1="10" x2="18" y2="10" /><line x1="2" y1="15" x2="18" y2="15" />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--sidebar-bg)", padding: "4rem 1.5rem 2rem", display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => setMobileOpen(false)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
          {NAV.map(({ label, icon: Icon, href, key }) => (
            <Link key={key} href={key === "analysis" ? analysisHref : href} className={`dash-nav-item${(view === "dashboard" && key === "dashboard") || (view === "rooms" && key === "rooms") || (view === "settings" && key === "settings") ? " active" : ""}`} onClick={() => { setMobileOpen(false); if (key === "create") { sessionStorage.removeItem(EDITING_ROOM_KEY); notifyStorageChange(EDITING_ROOM_KEY, "session"); } }} style={{ fontSize: "0.95rem", padding: "12px 16px" }}>
              <Icon size={16} />{label}
            </Link>
          ))}
          {isAdmin && <Link href="/dashboard/select" className="dash-nav-item" onClick={() => setMobileOpen(false)} style={{ fontSize: "0.95rem", padding: "12px 16px" }}><GridIcon size={16} />Switch dashboards</Link>}
          <button onClick={handleLogout} className="dash-nav-item" style={{ color: "rgba(255,100,120,0.7)", fontSize: "0.95rem", padding: "12px 16px" }}>
            <LogoutIcon size={16} />Logout
          </button>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="dash-main" style={{ marginLeft: 220, flex: 1, padding: "clamp(1.2rem,3vw,2.2rem)", paddingTop: "clamp(1.5rem,3vw,2.2rem)", position: "relative", zIndex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontSize: "0.62rem", letterSpacing: "0.2em", color: "var(--text-label)", fontWeight: 600, marginBottom: "0.4rem" }}>{view === "rooms" ? "SAVED ROOM PLANS" : view === "settings" ? "ACCOUNT PREFERENCES" : "CONTROL CENTER"}</div>
            <h1 style={{ fontSize: "clamp(1.4rem,3vw,2rem)", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em", marginBottom: "0.35rem" }}>
              {view === "rooms" ? <>My <span className="cyan-gradient">Rooms</span></> : view === "settings" ? <>SpaceWise <span className="cyan-gradient">Settings</span></> : <>Welcome to <span className="cyan-gradient">SpaceWise</span></>}
            </h1>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.5 }}>
              {view === "rooms" ? "View, edit, and analyze your saved room plans." : view === "settings" ? "Manage your appearance and review the account currently signed in." : "Manage your room plans, analyze furniture decisions, and optimize every square foot."}
            </p>
          </div>
          <Link href="/room/new" onClick={() => { sessionStorage.removeItem(EDITING_ROOM_KEY); notifyStorageChange(EDITING_ROOM_KEY, "session"); }} className="glow-btn" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 22px", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.06em", textDecoration: "none", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Create New Room Plan
          </Link>
        </div>
        {cloudError && <p role="alert" style={{ color: "var(--error)", marginBottom: "1rem", overflowWrap: "anywhere" }}>Cloud room plans: {cloudError}</p>}

        {/* DASHBOARD OVERVIEW */}
        {view === "dashboard" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem", marginBottom: "2rem" }}>
          {stats.map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(ellipse at top right, ${color}12 0%, transparent 70%)`, pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.8rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}14`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color }}>
                  <Icon size={16} />
                </div>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, marginTop: 4 }} />
              </div>
              <div style={{ fontSize: "clamp(1.4rem,3vw,1.8rem)", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginTop: "0.25rem" }}>{label}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.15rem", letterSpacing: "0.02em" }}>{sub}</div>
            </div>
          ))}
        </div>}

        {view === "settings" ? (
          <SettingsPanel session={session} onLogout={handleLogout} />
        ) : view === "dashboard" ? (
          <Link href="/rooms" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "1.2rem 1.4rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", color: "var(--text)", textDecoration: "none" }}>
            <span><strong style={{ display: "block", fontSize: "0.95rem" }}>My Room Plans</strong><span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{rooms.length} saved plan{rooms.length !== 1 ? "s" : ""}</span></span>
            <span style={{ color: "var(--accent)", fontSize: "0.8rem", fontWeight: 700 }}>View all →</span>
          </Link>
        ) : <>
        {/* ROOM PLANS */}
        <div id="rooms" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", scrollMarginTop: 24 }}>
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", letterSpacing: "0.01em" }}>My Room Plans</h2>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>{rooms.length} layout{rooms.length !== 1 ? "s" : ""} saved</p>
          </div>
          <button type="button" onClick={createRoom} style={{ border: 0, padding: 0, background: "none", fontSize: "0.75rem", color: "var(--accent)", cursor: "pointer", letterSpacing: "0.05em", fontWeight: 600 }}>+ New Plan</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={importLegacyPlans} disabled={importing || localPlans.length === 0} className="view-plan-btn">
              {importing ? "Importing…" : "Import local plans"}
            </button>
          </div>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", lineHeight: 1.5, margin: "0 0 0.75rem" }}>
          Import copies local-only plans to your signed-in account. Existing local plans stay in this browser. After import, open each plan with View Plan and Analyze to verify its room details and layout before removing any local data.
        </p>
        {importMessage && <p role="status" style={{ color: "var(--success)", fontSize: "0.78rem", marginBottom: "0.75rem" }}>{importMessage}</p>}

        {rooms.length === 0 ? (
          <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 14, padding: "3rem 2rem", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--surface2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", color: "var(--accent)" }}>
              <RoomsIcon size={24} />
            </div>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem" }}>No room plans yet</p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.2rem" }}>Create your first room layout to get started.</p>
            <Link href="/room/new" onClick={() => { sessionStorage.removeItem(EDITING_ROOM_KEY); notifyStorageChange(EDITING_ROOM_KEY, "session"); }} className="glow-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: "0.82rem", letterSpacing: "0.06em", textDecoration: "none" }}>
              Create Your First Room
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1rem" }}>
            {rooms.map(room => (
              <div key={room.id} className="room-card">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>{room.name}</div>
                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: 4 }}>Saved to your Supabase account</div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 20, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "0.62rem", color: "var(--accent)", letterSpacing: "0.08em", fontWeight: 600 }}>{room.type.toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4fffb0", boxShadow: "0 0 6px #4fffb0", marginTop: 4, flexShrink: 0 }} />
                </div>

                <div style={{ borderRadius: 8, overflow: "hidden", background: "var(--surface3)", border: "1px solid var(--border)", padding: "0.5rem" }}>
                  <svg viewBox="0 0 120 80" width="100%" style={{ display: "block" }}>
                    <rect x="4" y="4" width="112" height="72" fill="var(--surface2)" stroke="var(--accent)" strokeWidth="1" rx="1" />
                    <rect x="10" y="10" width="35" height="25" fill="var(--surface)" stroke="var(--accent)" strokeWidth="0.7" rx="0.5" />
                    <rect x="55" y="10" width="55" height="35" fill="var(--surface)" stroke="var(--accent)" strokeWidth="0.7" rx="0.5" />
                    <rect x="10" y="45" width="55" height="25" fill="var(--surface)" stroke="var(--accent)" strokeWidth="0.7" rx="0.5" />
                    <circle cx="4" cy="4" r="1.5" fill="var(--accent)" />
                    <circle cx="116" cy="4" r="1.5" fill="var(--accent)" />
                    <circle cx="4" cy="76" r="1.5" fill="var(--accent)" />
                    <circle cx="116" cy="76" r="1.5" fill="var(--accent)" />
                  </svg>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {[{ label: "DIMENSIONS", val: room.dimensions }, { label: "FURNITURE", val: `${room.furniture} items` }, { label: "PLANNED", val: `${room.planned} items` }].map(({ label, val }) => (
                    <div key={label} style={{ background: "var(--surface2)", borderRadius: 7, padding: "7px 10px" }}>
                      <div style={{ fontSize: "0.58rem", color: "var(--text-label)", letterSpacing: "0.12em", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>{val}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: "0.62rem", color: "var(--text-label)", letterSpacing: "0.1em" }}>SPACE UTILIZATION</span>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: room.utilization >= 75 ? "#4fffb0" : "var(--accent)" }}>{room.utilization}%</span>
                  </div>
                  <div style={{ height: 4, background: "var(--border)", borderRadius: 2 }}>
                    <div style={{ width: `${room.utilization}%`, height: "100%", background: room.utilization >= 75 ? "linear-gradient(90deg,#00d4ff,#4fffb0)" : "linear-gradient(90deg,#00d4ff,#0066ff)", borderRadius: 2, transition: "width 0.6s ease" }} />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", letterSpacing: "0.04em" }}>Updated {room.updated}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => openPlan(room.plan)} className="view-plan-btn">View Plan →</button>
                    <button type="button" onClick={() => editRoom(room.plan)} className="view-plan-btn">Edit</button>
                    <Link href={`/room/${room.id}/analysis`} className="view-plan-btn">Analyze</Link>
                    <button type="button" onClick={() => deleteRoom(room.plan)} className="view-plan-btn" style={{ color: "#ff687b", borderColor: "rgba(255,104,123,0.3)" }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>}
      </main>
    </div>
  );
}

function SettingsPanel({ session, onLogout }: { session: string | null; onLogout: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState("");
  let account: { name?: string; email?: string } | null = null;
  let accountError = false;
  try {
    const parsed: unknown = JSON.parse(session || "null");
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as { name?: unknown; email?: unknown };
      account = {
        name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : undefined,
        email: typeof candidate.email === "string" && candidate.email.trim() ? candidate.email.trim() : undefined,
      };
      if (!account.name && !account.email) account = null;
    } else if (session) accountError = true;
  } catch {
    accountError = Boolean(session);
  }
  const cardStyle = { padding: "clamp(1rem, 3vw, 1.5rem)", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", boxShadow: "0 8px 24px var(--shadow-glow)" };
  const labelStyle = { fontSize: "0.68rem", fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.12em", marginBottom: 5 };
  const valueStyle = { color: "var(--text)", fontSize: "0.95rem", overflowWrap: "anywhere" as const };
  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 760 }}>
      <section style={cardStyle} aria-labelledby="settings-appearance">
        <div style={{ marginBottom: "1rem" }}>
          <h2 id="settings-appearance" style={{ color: "var(--text)", fontSize: "1.05rem", fontWeight: 700 }}>Appearance</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: 5 }}>Choose the SpaceWise color theme for this browser.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "0.9rem 1rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 9 }}>
          <div><div style={labelStyle}>COLOR THEME</div><div style={valueStyle}>Light Mode or Dark Mode</div></div>
          <ThemeToggle />
        </div>
      </section>
      <section style={cardStyle} aria-labelledby="settings-account">
        <div style={{ marginBottom: "1rem" }}>
          <h2 id="settings-account" style={{ color: "var(--text)", fontSize: "1.05rem", fontWeight: 700 }}>Account</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: 5 }}>Information from the authenticated session.</p>
        </div>
        {account ? <>
          {editingName ? (
            <form onSubmit={event => {
              event.preventDefault();
              const trimmedName = nameDraft.trim();
              if (!trimmedName) { setNameError("Username cannot be empty."); setNameSuccess(""); return; }
              try {
                const currentSession: unknown = JSON.parse(session || "null");
                if (!currentSession || typeof currentSession !== "object" || Array.isArray(currentSession)) throw new Error("Invalid session");
                localStorage.setItem("sw_session", JSON.stringify({ ...(currentSession as Record<string, unknown>), name: trimmedName }));
                notifyStorageChange("sw_session");
                setNameDraft(trimmedName);
                setNameError("");
                setNameSuccess("Username saved successfully.");
                setEditingName(false);
              } catch {
                setNameError("Could not save the username because the current session is unavailable.");
                setNameSuccess("");
              }
            }} style={{ display: "grid", gap: "0.65rem", maxWidth: 420 }}>
              <label htmlFor="settings-username" style={labelStyle}>USERNAME</label>
              <input id="settings-username" value={nameDraft} onChange={event => { setNameDraft(event.target.value); setNameError(""); setNameSuccess(""); }} autoComplete="nickname" style={{ width: "100%", padding: "0.7rem 0.8rem", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--input-text)", font: "inherit" }} />
              {nameError && <p role="alert" style={{ color: "var(--error)", fontSize: "0.82rem" }}>{nameError}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" className="view-plan-btn">Save</button>
                <button type="button" className="view-plan-btn" onClick={() => { setEditingName(false); setNameDraft(account?.name || ""); setNameError(""); setNameSuccess(""); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0.75rem" }}>
              <div style={{ padding: "0.85rem", borderRadius: 8, background: "var(--surface2)" }}>
                <div style={labelStyle}>USERNAME</div>
                <div style={{ ...valueStyle, marginBottom: "0.75rem" }}>{account.name || "No username is available in this session."}</div>
                <button type="button" className="view-plan-btn" onClick={() => { setNameDraft(account?.name || ""); setNameError(""); setNameSuccess(""); setEditingName(true); }}>Edit</button>
              </div>
              {account.email && <div style={{ padding: "0.85rem", borderRadius: 8, background: "var(--surface2)" }}><div style={labelStyle}>EMAIL</div><div style={valueStyle}>{account.email}</div></div>}
            </div>
          )}
          {nameSuccess && <p role="status" style={{ color: "var(--success)", fontSize: "0.82rem", marginTop: "0.75rem" }}>{nameSuccess}</p>}
        </> : <p role="status" style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "0.85rem", borderRadius: 8, background: "var(--surface2)" }}>{accountError ? "Account information is unavailable because the saved session is invalid." : "No account information is available for the current session."}</p>}
      </section>
      <section style={cardStyle} aria-labelledby="settings-session">
        <div style={{ marginBottom: "1rem" }}>
          <h2 id="settings-session" style={{ color: "var(--text)", fontSize: "1.05rem", fontWeight: 700 }}>Session</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: 5 }}>Sign out of this browser session. Your saved rooms and account remain stored.</p>
        </div>
        <button type="button" onClick={onLogout} className="view-plan-btn" style={{ color: "var(--error)", borderColor: "var(--border-strong)" }}>Log Out</button>
      </section>
    </div>
  );
}

function GridIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>;
}
function PlusIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="14" /><line x1="2" y1="8" x2="14" y2="8" /></svg>;
}
function RoomsIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="1" width="14" height="14" rx="1.5" /><line x1="1" y1="9" x2="9" y2="9" /><line x1="9" y1="1" x2="9" y2="15" /></svg>;
}
function ChartIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polyline points="1,12 5,7 9,9 15,3" /><line x1="1" y1="15" x2="15" y2="15" /></svg>;
}
function FurnitureIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="6" width="12" height="6" rx="1" /><line x1="4" y1="12" x2="4" y2="15" /><line x1="12" y1="12" x2="12" y2="15" /><rect x="4" y="3" width="8" height="3" rx="0.5" /></svg>;
}
function StarIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="8,1 10,6 15,6 11,9.5 12.5,15 8,12 3.5,15 5,9.5 1,6 6,6" /></svg>;
}
function GearIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" /></svg>;
}
function LogoutIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /><polyline points="11,5 14,8 11,11" /><line x1="14" y1="8" x2="6" y2="8" /></svg>;
}
