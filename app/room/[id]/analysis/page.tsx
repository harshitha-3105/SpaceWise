"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { notifyStorageChange, useHasHydrated } from "../../../utils/browserStorage";
import { CURRENT_ROOM_KEY, EDITING_ROOM_KEY } from "../../../utils/roomStorage";
import Link from "next/link";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { calculateFurniturePlacement, type FurniturePlacement } from "../../../utils/furniturePlacement";
import { useAuth } from "../../../context/AuthContext";
import { loadRoomPlan, type StoredRoomPlan } from "../../../utils/roomPlans";

/* ── Types ── */
interface FurnitureItem {
  id: string; name: string; category: string;
  length: string; width: string; status: "existing" | "planned";
}
interface RoomData {
  room: { name: string; type: string; length: string; width: string };
  existing: FurnitureItem[];
  planned: FurnitureItem[];
  door: { enabled: boolean; wall: string; distance: string };
  window: { enabled: boolean; wall: string; distance: string };
}
type Verdict = "BUY" | "CONSIDER" | "DON'T BUY";
interface FurnitureRec {
  item: FurnitureItem;
  verdict: Verdict;
  reason: string;
  fitStatus: string;
  spaceImpact: string;
  walkingImpact: string;
  alternative?: string;
}

/* ── Analysis engine ── */
function analyze(data: RoomData, placement: FurniturePlacement) {
  const roomArea=placement.roomAreaSqFt;
  const placedIds=new Set(placement.placed.map(p=>p.item.id));
  const itemArea=(item:FurnitureItem)=>{
    const length=Number.parseFloat(item.length), width=Number.parseFloat(item.width);
    return Number.isFinite(length)&&length>0&&Number.isFinite(width)&&width>0?length*width:0;
  };
  const existingArea=data.existing.filter(item=>placedIds.has(item.id)).reduce((sum,item)=>sum+itemArea(item),0);
  const plannedArea=data.planned.filter(item=>placedIds.has(item.id)).reduce((sum,item)=>sum+itemArea(item),0);
  const totalFurnitureArea=placement.furnitureAreaSqFt;
  const remainingArea=placement.walkingAreaSqFt;
  const walkingSqFt=remainingArea;
  const utilization=placement.utilizationPct;
  const walkingPct=roomArea&&walkingSqFt!==null?walkingSqFt/roomArea*100:null;
  const walkingStatus:"High"|"Moderate"|"Low"|"Unknown"=walkingPct===null?"Unknown":walkingPct>=40?"High":walkingPct>=25?"Moderate":"Low";
  const accessChecksEvaluated=Boolean(placement.checks.entranceAccess?.evaluated&&placement.checks.doorSwing?.evaluated&&placement.checks.walkingRoutes.evaluated);
  const windowCheckRequired=Boolean(data.window?.enabled);
  const checksComplete=Boolean(placement.roomKnown&&placement.checks.collisions.evaluated&&placement.checks.boundaries.evaluated&&accessChecksEvaluated&&(!windowCheckRequired||placement.checks.windows?.evaluated));
  const checksPassed=Boolean(placement.checks.collisions.passed&&placement.checks.boundaries.passed&&placement.checks.entranceAccess?.passed&&placement.checks.doorSwing?.passed&&placement.checks.walkingRoutes.passed&&(!windowCheckRequired||placement.checks.windows?.passed));
  const spaceLimited=(utilization??0)>85||(walkingPct!==null&&walkingPct<25);
  // Existing items are not purchase candidates. A placed planned item receives BUY only
  // when the full plan and its required geometry checks pass without crowding.
  const recommendations:FurnitureRec[]=data.planned.filter(item=>item.status==="planned").map(item=>{
    const l=Number.parseFloat(item.length),w=Number.parseFloat(item.width),area=Number.isFinite(l*w)?l*w:0;
    const pct=roomArea?area/roomArea*100:null, reason=placement.unplacedReasons.get(item.id);
    if(!placement.roomKnown)return {item,verdict:"CONSIDER",fitStatus:"Unknown",reason:"Room dimensions are missing or invalid, so fit cannot be evaluated.",spaceImpact:"Unknown",walkingImpact:"Unknown"};
    if(reason||!placedIds.has(item.id)){
      const cannotFit=reason?.startsWith("The item is larger")||reason?.includes("every candidate position conflicts");
      return {item,verdict:cannotFit?"DON'T BUY":"CONSIDER",fitStatus:"Not placed",reason:cannotFit?`${item.name||item.category}: ${reason} The configured size cannot be placed safely with the room openings.`:`${item.name||item.category}: ${reason||"No valid placement found."} The current search did not find a safe arrangement; this is not proof that no alternative arrangement exists.`,spaceImpact:pct===null?"Unknown":`${pct.toFixed(0)}% of room area if placed`,walkingImpact:"Not currently placed",alternative:"Consider a smaller item or revise the layout."};
    }
    const fitStatus="Planned item — placed in layout";
    if(placement.criticalObstructionItemIds.includes(item.id))return {item,verdict:"DON'T BUY",fitStatus,reason:"Removing this planned item restores the verified 2 ft entrance-to-destination route. It is a critical obstruction in this layout.",spaceImpact:`${pct?.toFixed(0)??"?"}% of total area`,walkingImpact:"Blocks the verified route",alternative:"Choose a smaller item or a different position."};
    if(!checksComplete)return {item,verdict:"CONSIDER",fitStatus,reason:"The item is placed, but one or more required entrance, door, boundary, collision, or window checks could not be evaluated. Purchase suitability is not established.",spaceImpact:`${pct?.toFixed(0)??"?"}% of total area`,walkingImpact:"Route status incomplete"};
    if(!checksPassed)return {item,verdict:"CONSIDER",fitStatus,reason:"The item is placed, but the generated room has a failed access or clearance check. Review the layout before buying.",spaceImpact:`${pct?.toFixed(0)??"?"}% of total area`,walkingImpact:"A required access/clearance check failed"};
    if(placement.unplacedItems.length>0)return {item,verdict:"CONSIDER",fitStatus,reason:"This item is placed, but other saved furniture is unplaced, so the complete room plan has not passed fit validation.",spaceImpact:`${pct?.toFixed(0)??"?"}% of total area`,walkingImpact:"Full layout not validated"};
    if(spaceLimited)return {item,verdict:"CONSIDER",fitStatus,reason:"This item fits, but estimated remaining floor area or utilization is limited. Placement alone does not establish that purchasing it is practical.",spaceImpact:`${pct?.toFixed(0)??"?"}% of total area`,walkingImpact:"Limited estimated space"};
    return {item,verdict:"BUY",fitStatus,reason:"The item is placed and the complete layout passes the evaluated 2 ft entrance route, door swing, furniture-fit, boundary, collision, and applicable window checks; estimated remaining area is not limited.",spaceImpact:`${pct?.toFixed(0)??"?"}% of total area`,walkingImpact:"Verified route passes"};
  });
  const utilizationScore=utilization===null?null:utilization<=75?100:utilization<=85?80:utilization<=92?55:30;
  const walkingScore=walkingStatus==="Unknown"?null:walkingStatus==="High"?100:walkingStatus==="Moderate"?65:30;
  const itemCount=data.existing.length+data.planned.length;
  const fitScore=placement.roomKnown&&itemCount>0?(placement.unplacedItems.length>0?0:100):null;
  const accessEvaluated=accessChecksEvaluated;
  const accessScore=accessEvaluated?(placement.checks.entranceAccess!.passed&&placement.checks.doorSwing!.passed&&placement.checks.walkingRoutes.passed?100:0):null;
  const scoreBreakdown=[
    {label:"Space Efficiency",score:utilizationScore,weight:30,description:"Based on placed-footprint utilization: 100 at ≤75%, 80 at ≤85%, 55 at ≤92%, otherwise 30."},
    {label:"Estimated Remaining Floor Area",score:walkingScore,weight:30,description:"100 when estimated remaining area is ≥40% of room area, 65 at ≥25%, otherwise 30. This is not a walking-route check."},
    {label:"Furniture Fit",score:fitScore,weight:25,description:"100 when every saved existing and planned item is placed; 0 when any item is unplaced."},
    {label:"Entrance & Door Access",score:accessScore,weight:15,description:"100 only when a 2 ft route reaches a usable position beside the room's primary furniture and the saved door-swing clearance passes; 0 when evaluated and either fails."},
  ].map(component=>({...component,weightedPoints:component.score===null?0:component.score*component.weight/100}));
  const overallScore=placement.roomKnown?Math.round(scoreBreakdown.reduce((sum,component)=>sum+component.weightedPoints,0)):0;
  const unevaluatedScoreComponents=scoreBreakdown.filter(component=>component.score===null).map(component=>component.label);
  const hasUnplacedRequired=placement.unplacedItems.length>0;
  const criticalCheckFailed=!checksPassed&&checksComplete;
  const rating=hasUnplacedRequired||criticalCheckFailed?"NEEDS WORK":!checksComplete?"CHECKS INCOMPLETE":overallScore>=80?"EXCELLENT":overallScore>=55?"GOOD":overallScore>=35?"FAIR":"NEEDS WORK";
  const concerns:string[]=[],positives:string[]=[];
  if(!placement.roomKnown)concerns.push("Room dimensions are missing or invalid; spatial estimates are unavailable.");
  if(utilization!==null&&utilization>85)concerns.push("Computed furniture footprint is high relative to room area.");
  if(walkingStatus==="Low")concerns.push("Estimated remaining floor area is limited; it does not establish an accessible route.");
  if(placement.checks.entranceAccess?.evaluated&&!placement.checks.entranceAccess.passed)concerns.push("The 2 ft entrance route to the room's primary furniture could not be verified.");
  if(!placement.checks.entranceAccess?.evaluated)concerns.push("Entrance access was not evaluated because valid door geometry or a usable destination was unavailable.");
  if(placement.checks.windows?.evaluated&&!placement.checks.windows.passed)concerns.push("Furniture intersects the supplied window clearance zone.");
  if(hasUnplacedRequired)concerns.push("One or more saved furniture items remain unplaced; the room rating is NEEDS WORK.");
  if(utilization!==null&&utilization<30)concerns.push("Furniture footprint uses a small share of the room area.");
  if(utilization!==null&&utilization>=50&&utilization<=80)positives.push("Furniture footprint uses a moderate share of the room area.");
  if(placement.checks.entranceAccess?.evaluated&&placement.checks.entranceAccess.passed)positives.push("A 2 ft entrance route to the room's primary furniture was verified.");
  if(placement.checks.windows?.evaluated&&placement.checks.windows.passed)positives.push("Supplied window clearance is clear.");
  const comfortLevel=walkingStatus==="Unknown"?"Unknown":walkingStatus==="High"&&utilization!==null&&utilization<=80?"High":walkingStatus==="Moderate"?"Medium":"Low";
  const spaceEfficiency=utilization===null?"Unknown":utilization>=55&&utilization<=82?"Balanced":utilization<55?"Lower furniture coverage":"High furniture coverage";
  return {roomArea,existingArea,plannedArea,totalFurnitureArea,unplacedFurnitureArea:placement.unplacedFurnitureAreaSqFt,remainingArea,utilization,walkingSqFt,walkingStatus,recommendations,overallScore,rating,scoreBreakdown,unevaluatedScoreComponents,utilizationScore,walkingScore,fitScore,accessScore,hasUnplacedRequired,concerns,positives,comfortLevel,spaceEfficiency};
}
/* ── Colour helpers ── */
function verdictColor(v: Verdict) {
  if (v === "BUY")         return { bg: "rgba(79,255,176,0.1)",  border: "rgba(79,255,176,0.35)",  text: "#4fffb0" };
  if (v === "CONSIDER")    return { bg: "rgba(255,179,71,0.1)",  border: "rgba(255,179,71,0.35)",  text: "#ffb347" };
  return                          { bg: "rgba(255,80,100,0.1)",  border: "rgba(255,80,100,0.35)",  text: "#ff5064" };
}
function walkingColor(s: string) {
  if (s === "High")     return "#4fffb0";
  if (s === "Moderate") return "#ffb347";
  return "#ff5064";
}
function scoreColor(n: number | null) {
  if (n === null) return "rgba(160,180,255,0.4)";
  if (n >= 75) return "#4fffb0";
  if (n >= 50) return "#ffb347";
  return "#ff5064";
}
function utilColor(n: number | null) {
  if (n === null) return "rgba(160,180,255,0.4)";
  if (n <= 80) return "#4fffb0";
  if (n <= 90) return "#ffb347";
  return "#ff5064";
}

/* ── Reusable card ── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="analysis-card" style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "1.3rem", ...style,
    }}>
      {children}
    </div>
  );
}

/* ── Section label ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="analysis-section-label" style={{ fontSize: "0.62rem", letterSpacing: "0.18em", color: "var(--text-label)", fontWeight: 600, marginBottom: "1rem", textTransform: "uppercase" as const }}>
      {children}
    </div>
  );
}

/* ── Progress bar ── */
function Bar({ pct, color, height = 6 }: { pct: number | null; color: string; height?: number }) {
  return (
    <div style={{ height, background: "rgba(0,212,255,0.08)", borderRadius: height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct ?? 0)}%`, height: "100%", background: color, borderRadius: height, transition: "width 0.8s ease" }} />
    </div>
  );
}

/* ── Score ring (SVG) ── */
function ScoreRing({ score }: { score: number }) {
  const R = 52; const C = 2 * Math.PI * R;
  const dash = (score / 100) * C;
  const color = scoreColor(score);
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(0,212,255,0.08)" strokeWidth="10" />
      <circle cx="65" cy="65" r={R} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${C}`} strokeDashoffset={C * 0.25}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dasharray 1s ease" }} />
      <text x="65" y="60" textAnchor="middle" fill={color} fontSize="22" fontWeight="800" fontFamily="Inter,sans-serif">{score}</text>
      <text x="65" y="76" textAnchor="middle" fill="rgba(160,180,255,0.45)" fontSize="9" fontFamily="monospace">/100</text>
    </svg>
  );
}

/* ── Main Page ── */
export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [cloudResult, setCloudResult] = useState<{ userId: string; planId: string; plan: StoredRoomPlan | null } | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudError, setCloudError] = useState("");
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    let active = true;
    loadRoomPlan(params.id).then(plan => {
      if (active) { setCloudResult({ userId: user.id, planId: params.id, plan }); setCloudError(""); }
    }).catch(cause => {
      if (active) {
        setCloudResult({ userId: user.id, planId: params.id, plan: null });
        setCloudError(cause instanceof Error ? cause.message : "Could not load this room plan.");
      }
    }).finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [authLoading, params.id, router, user]);
  const requestMatches = cloudResult?.userId === user?.id && cloudResult?.planId === params.id;
  const data = requestMatches ? cloudResult?.plan ?? null : null;
  const loaded = useHasHydrated();

  if (!loaded || authLoading || (user && (cloudLoading || !requestMatches))) {
    return (
      <main style={{ minHeight: "100vh", background: "#050718", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(0,212,255,0.5)", fontFamily: "monospace", letterSpacing: "0.1em", fontSize: "0.8rem" }}>LOADING ANALYSIS…</div>
      </main>
    );
  }
  if (!user) {
    return <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center" }}>Redirecting to sign in…</main>;
  }
  if (!data) {
    return (
      <main style={{ minHeight: "100vh", background: "#050718", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <div role="alert" style={{ color: "rgba(255,80,100,0.7)", fontFamily: "monospace", letterSpacing: "0.1em", textAlign: "center", maxWidth: 480 }}>{cloudError ? `Could not load this room from Supabase: ${cloudError}` : "This room is unavailable in your Supabase room plans."}</div>
        <Link href="/room/new" style={{ color: "#00d4ff", fontSize: "0.82rem", textDecoration: "none" }}>← Configure a room first</Link>
      </main>
    );
  }

  function openCurrentLayout() {
    sessionStorage.setItem(CURRENT_ROOM_KEY, JSON.stringify(data));
    notifyStorageChange(CURRENT_ROOM_KEY, "session");
  }
  function editCurrentRoom() {
    sessionStorage.setItem(EDITING_ROOM_KEY, params.id);
    notifyStorageChange(EDITING_ROOM_KEY, "session");
  }

  const placement = calculateFurniturePlacement(data);
  const r = analyze(data, placement);
  const allItems = [...data.existing, ...data.planned];

  return (
    <div className="analysis-page" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", top: "8%", left: "30%", width: 700, height: 400, background: "radial-gradient(ellipse, rgba(0,100,255,0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* ── TOP BAR ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--surface2)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "0 clamp(1rem,3vw,2rem)", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="3" width="22" height="22" rx="2" stroke="rgba(0,212,255,0.7)" strokeWidth="1.2" fill="rgba(0,40,80,0.4)" />
            <rect x="7" y="12" width="6" height="10" rx="0.5" stroke="rgba(0,212,255,0.5)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <rect x="15" y="7" width="8" height="7" rx="0.5" stroke="rgba(0,212,255,0.5)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <line x1="3" y1="22" x2="25" y2="22" stroke="rgba(0,212,255,0.4)" strokeWidth="1" />
            <circle cx="22" cy="3" r="2" fill="rgba(0,212,255,0.6)" />
          </svg>
          <span className="cyan-gradient" style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.07em" }}>SpaceWise</span>
          <span style={{ color: "rgba(0,212,255,0.2)" }}>/</span>
          <span style={{ fontSize: "0.75rem", color: "rgba(160,180,255,0.5)" }}>{data.room.name}</span>
          <span style={{ color: "rgba(0,212,255,0.2)" }}>/</span>
          <span style={{ fontSize: "0.75rem", color: "rgba(0,212,255,0.6)" }}>Analysis</span>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <ThemeToggle />
          <Link href="/room/new/layout" onClick={openCurrentLayout} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600, textDecoration: "none" }}>
            ← Layout
          </Link>
          <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textDecoration: "none" }}>
            Dashboard
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(1rem,3vw,2rem)", position: "relative", zIndex: 1 }}>

        {/* Page heading */}
        <div style={{ marginBottom: "1.6rem" }}>
          <div style={{ fontSize: "0.6rem", letterSpacing: "0.2em", color: "rgba(0,212,255,0.5)", fontWeight: 600, marginBottom: "0.35rem" }}>SMART SPACE ANALYSIS</div>
          <h1 style={{ fontSize: "clamp(1.2rem,3vw,1.75rem)", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>
            <span className="cyan-gradient">{data.room.name}</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, fontSize: "0.65em", marginLeft: "0.6rem" }}>{data.room.type} · {data.room.length}×{data.room.width} ft</span>
          </h1>
        </div>

        {/* ── ROW 1: Score + Metrics ── */}
        <div className="an-score-row" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1rem", marginBottom: "1rem", alignItems: "stretch" }}>

          {/* Score card */}
          <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 170, gap: "0.5rem" }}>
            <SectionLabel>OVERALL SCORE</SectionLabel>
            {r.roomArea === null ? <div style={{ color: "rgba(160,180,255,0.5)", fontSize: "0.85rem" }}>Not enough room data</div> : <>
              <ScoreRing score={r.overallScore} />
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: scoreColor(r.overallScore), letterSpacing: "0.06em" }}>
                {r.rating}
              </div>
              {r.unevaluatedScoreComponents.length > 0 && <div style={{ maxWidth: 190, textAlign: "center", fontSize: "0.62rem", color: "rgba(160,180,255,0.45)" }}>Some weighted checks were not evaluated.</div>}
            </>}
          </Card>

          {/* Metric cards grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.7rem" }}>
            {[
              { label: "ROOM AREA",       value: `${r.roomArea === null ? "Unknown" : `${r.roomArea.toFixed(1)} sq ft`}`,          color: "#00d4ff" },
              { label: "PLACED FOOTPRINT", value: `${r.totalFurnitureArea.toFixed(1)} sq ft`, color: "#7b8fff" },
              { label: "UNPLACED FOOTPRINT", value: `${r.unplacedFurnitureArea.toFixed(1)} sq ft`, color: "#ffb347" },
              { label: "EST. REMAINING FLOOR AREA", value: r.remainingArea === null ? "Unknown" : `${r.remainingArea.toFixed(1)} sq ft`, color: "#4fffb0" },
              { label: "UTILIZATION", value: r.utilization === null ? "Unknown" : `${r.utilization}%`, color: utilColor(r.utilization) },
              { label: "FURNITURE COUNT", value: `${allItems.length} items`,                 color: "#00d4ff" },
            ].map(({ label, value, color }) => (
              <div key={label} className="analysis-metric-card" style={{ background: "rgba(5,12,35,0.8)", border: "1px solid rgba(0,212,255,0.09)", borderRadius: 10, padding: "0.85rem 1rem", transition: "border-color 0.2s", cursor: "default" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.25)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.09)")}>
                <div className="analysis-label" style={{ fontSize: "0.58rem", color: "rgba(0,212,255,0.4)", letterSpacing: "0.14em", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ROW 2: Utilization + Walking ── */}
        <div className="an-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>

          {/* Utilization bar card */}
          <Card>
            <SectionLabel>SPACE UTILIZATION</SectionLabel>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
              <span style={{ fontSize: "2rem", fontWeight: 800, color: utilColor(r.utilization) }}>{r.utilization === null ? "Not evaluated" : `${r.utilization}%`}</span>
              <span style={{ fontSize: "0.72rem", color: "rgba(160,180,255,0.45)" }}>{r.spaceEfficiency}</span>
            </div>
            {r.utilization !== null && <Bar pct={r.utilization} color={`linear-gradient(90deg,#00d4ff,${utilColor(r.utilization)})`} height={8} />}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginTop: "1rem" }}>
              {[
                { label: "Placed existing", val: r.existingArea.toFixed(1), unit: "sq ft" },
                { label: "Placed planned",  val: r.plannedArea.toFixed(1),  unit: "sq ft" },
                { label: "Placed", val: r.totalFurnitureArea.toFixed(1), unit: "sq ft" },
                { label: "Unplaced", val: r.unplacedFurnitureArea.toFixed(1), unit: "sq ft" },
                { label: "Remaining floor area", val: r.remainingArea === null ? "Unknown" : r.remainingArea.toFixed(1), unit: r.remainingArea === null ? "" : "sq ft" },
              ].map(({ label, val, unit }) => (
                <div key={label} className="analysis-mini-card" style={{ background: "rgba(0,15,40,0.5)", borderRadius: 7, padding: "6px 8px", textAlign: "center" }}>
                  <div className="analysis-strong" style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>{val}</div>
                  <div className="analysis-label" style={{ fontSize: "0.58rem", color: "rgba(0,212,255,0.35)", letterSpacing: "0.08em" }}>{unit}</div>
                  <div className="analysis-muted" style={{ fontSize: "0.6rem", color: "rgba(160,180,255,0.4)", marginTop: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Walking space card */}
          <Card>
            <SectionLabel>ESTIMATED REMAINING FLOOR AREA</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", border: `2px solid ${walkingColor(r.walkingStatus)}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 0 12px ${walkingColor(r.walkingStatus)}40` }}>
                <span style={{ fontSize: "1.1rem" }}>{r.walkingStatus === "High" ? "~" : r.walkingStatus === "Moderate" ? "~" : "!"}</span>
              </div>
              <div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: walkingColor(r.walkingStatus) }}>{r.walkingSqFt === null ? "Unknown" : `${r.walkingSqFt.toFixed(1)} sq ft (${r.walkingStatus} estimate)`}</div>
                <div style={{ fontSize: "0.72rem", color: "rgba(160,180,255,0.45)", marginTop: 2 }}>Room area minus placed furniture footprints; not a guaranteed clear route.</div>
              </div>
            </div>
            {[
              { label: "Entrance access check", val: placement.checks.entranceAccess?.evaluated ? placement.checks.entranceAccess.passed ? "Route check passed" : "No route found" : "Not evaluated", color: placement.checks.entranceAccess?.evaluated ? placement.checks.entranceAccess.passed ? "#4fffb0" : "#ff5064" : "rgba(160,180,255,0.45)" },
              { label: "Walking route check", val: placement.checks.walkingRoutes.evaluated ? placement.checks.walkingRoutes.passed ? "Route check passed" : "No route found" : "Not evaluated", color: placement.checks.walkingRoutes.evaluated ? placement.checks.walkingRoutes.passed ? "#4fffb0" : "#ff5064" : "rgba(160,180,255,0.45)" },
              { label: "Comfort (area estimate)", val: r.comfortLevel, color: r.comfortLevel === "High" ? "#4fffb0" : r.comfortLevel === "Medium" ? "#ffb347" : "#ff5064" },
              { label: "Door Clearance", val: placement.checks.doorSwing?.evaluated ? placement.checks.doorSwing.passed ? "Clear" : "Obstructed" : "Not evaluated", color: "#00d4ff" },
              { label: "Window Clearance", val: placement.checks.windows?.evaluated ? placement.checks.windows.passed ? "Clear" : "Obstructed" : "Not evaluated", color: placement.checks.windows?.evaluated ? placement.checks.windows.passed ? "#4fffb0" : "#ff5064" : "rgba(160,180,255,0.45)" },
              { label: "Furniture Overlap", val: placement.checks.collisions.evaluated ? placement.checks.collisions.passed ? "No overlap found" : "Overlap found" : "Not evaluated", color: placement.checks.collisions.evaluated ? placement.checks.collisions.passed ? "#4fffb0" : "#ff5064" : "rgba(160,180,255,0.45)" },
              { label: "Room Boundaries", val: placement.checks.boundaries.evaluated ? placement.checks.boundaries.passed ? "Within room" : "Boundary violation" : "Not evaluated", color: placement.checks.boundaries.evaluated ? placement.checks.boundaries.passed ? "#4fffb0" : "#ff5064" : "rgba(160,180,255,0.45)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(0,212,255,0.05)" }}>
                <span style={{ fontSize: "0.75rem", color: "rgba(160,180,255,0.5)" }}>{label}</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color }}>{val}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* ── FURNITURE RECOMMENDATIONS ── */}
        {r.recommendations.length > 0 && (
          <Card style={{ marginBottom: "1rem" }}>
            <SectionLabel>FURNITURE RECOMMENDATIONS</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "0.8rem" }}>
              {r.recommendations.map(rec => {
                const vc = verdictColor(rec.verdict);
                return (
                  <div key={rec.item.id} style={{ background: vc.bg, border: `1px solid ${vc.border}`, borderRadius: 10, padding: "1rem", transition: "transform 0.18s, box-shadow 0.18s" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 20px ${vc.border}`; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                      <div>
                <div className="analysis-strong" style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>{rec.item.name || rec.item.category}</div>
                        <div style={{ fontSize: "0.65rem", color: "rgba(160,180,255,0.45)", marginTop: 1 }}>{rec.item.category} · {rec.item.length}×{rec.item.width} ft</div>
                      </div>
                      <div style={{ padding: "3px 10px", borderRadius: 5, background: vc.border, color: vc.text, fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.1em", flexShrink: 0 }}>
                        {rec.verdict}
                      </div>
                    </div>
                    <p className="analysis-body-text" style={{ fontSize: "0.75rem", color: "rgba(200,210,255,0.65)", lineHeight: 1.5, marginBottom: "0.6rem" }}>{rec.reason}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginBottom: rec.alternative ? "0.6rem" : 0 }}>
                      {[
                        { label: "Fit", val: rec.fitStatus },
                        { label: "Space Impact", val: rec.spaceImpact },
                        { label: "Walking Impact", val: rec.walkingImpact },
                      ].map(({ label, val }) => (
                        <div key={label} className="analysis-detail-card" style={{ background: "rgba(0,10,30,0.4)", borderRadius: 5, padding: "4px 7px" }}>
                          <div style={{ fontSize: "0.55rem", color: "rgba(0,212,255,0.35)", letterSpacing: "0.1em" }}>{label.toUpperCase()}</div>
                          <div className="analysis-strong" style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {rec.alternative && (
                      <div className="analysis-alt-card" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.12)", borderRadius: 6, padding: "6px 9px" }}>
                        <div style={{ fontSize: "0.6rem", color: "rgba(0,212,255,0.45)", letterSpacing: "0.1em", marginBottom: 2 }}>ALTERNATIVE</div>
                        <div className="analysis-body-text" style={{ fontSize: "0.72rem", color: "rgba(160,200,255,0.65)" }}>{rec.alternative}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── OVERALL SUMMARY ── */}
        <div className="an-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>

          {/* Concerns */}
          <Card>
            <SectionLabel>MAIN CONCERNS</SectionLabel>
            {r.concerns.length === 0 ? (
              <p style={{ fontSize: "0.78rem", color: "rgba(79,255,176,0.6)" }}>No major concerns found.</p>
            ) : r.concerns.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: "0.6rem" }}>
                <span style={{ color: "#ff5064", fontSize: "0.75rem", marginTop: 1, flexShrink: 0 }}>⚠</span>
                <span style={{ fontSize: "0.78rem", color: "rgba(200,210,255,0.65)", lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </Card>

          {/* Positives */}
          <Card>
            <SectionLabel>POSITIVE FINDINGS</SectionLabel>
            {r.positives.length === 0 ? (
              <p style={{ fontSize: "0.78rem", color: "rgba(160,180,255,0.4)" }}>Add more furniture to get positive findings.</p>
            ) : r.positives.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: "0.6rem" }}>
                <span style={{ color: "#4fffb0", fontSize: "0.75rem", marginTop: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: "0.78rem", color: "rgba(200,210,255,0.65)", lineHeight: 1.5 }}>{p}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* ── SCORE BREAKDOWN ── */}
        <Card style={{ marginBottom: "1.4rem" }}>
          <SectionLabel>SCORE BREAKDOWN</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem" }}>
            {r.scoreBreakdown.map(({ label, score, weight, weightedPoints, description }) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: 5 }}>
                  <span style={{ fontSize: "0.72rem", color: "rgba(160,180,255,0.7)" }}>{label}</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: scoreColor(score), whiteSpace: "nowrap" }}>{score === null ? "Not evaluated" : `${score}/100`}</span>
                </div>
                {score !== null && <Bar pct={score} color={scoreColor(score)} height={5} />}
                <div style={{ fontSize: "0.58rem", color: "rgba(0,212,255,0.45)", marginTop: 4 }}>{weightedPoints.toFixed(1)} of {weight} weighted points · {weight}% weight</div>
                <div style={{ fontSize: "0.62rem", color: "rgba(160,180,255,0.42)", lineHeight: 1.45, marginTop: 5 }}>{description}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.65rem", color: "rgba(160,180,255,0.5)", marginTop: "0.8rem", lineHeight: 1.5 }}>
            Overall score = sum of weighted points, rounded to the nearest whole point. An unevaluated component contributes 0 points and its weight is not redistributed. Ratings cannot be GOOD or EXCELLENT when saved furniture remains unplaced, an essential access/clearance check is incomplete, or an essential check fails. The 15% access component requires a verified 2 ft entrance route to the room's primary furniture and a passing saved-door swing check.
          </p>
        </Card>

        {/* ── ACTIONS ── */}
        <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
          <Link href="/room/new/layout" onClick={openCurrentLayout} className="glow-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 24px", borderRadius: 8, border: "none", color: "#fff", fontWeight: 700, fontSize: "0.88rem", letterSpacing: "0.06em", textDecoration: "none" }}>
            ← View Layout
          </Link>
          <Link href="/room/new" onClick={editCurrentRoom} style={{ display: "inline-flex", alignItems: "center", padding: "11px 20px", borderRadius: 8, border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.04)", color: "rgba(160,180,255,0.6)", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.05em", textDecoration: "none" }}>
            Edit Room
          </Link>
          <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", padding: "11px 20px", borderRadius: 8, border: "1px solid rgba(0,212,255,0.1)", background: "transparent", color: "rgba(160,180,255,0.4)", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.05em", textDecoration: "none" }}>
            Dashboard
          </Link>
        </div>
      </div>

      <style>{`
        [data-theme="light"] .analysis-page .analysis-muted,
        [data-theme="light"] .analysis-page .analysis-body-text { color: var(--text-secondary) !important; }
        [data-theme="light"] .analysis-page .analysis-strong { color: var(--text) !important; }
        [data-theme="light"] .analysis-page .analysis-section-label { color: var(--text-label) !important; }
        [data-theme="light"] .analysis-page div[style*="rgba(160,180,255,0.45)"],
        [data-theme="light"] .analysis-page span[style*="rgba(160,180,255,0.45)"],
        [data-theme="light"] .analysis-page span[style*="rgba(160,180,255,0.5)"] { color: var(--text-secondary) !important; }
        [data-theme="light"] .analysis-page .analysis-detail-card > div:first-child { color: var(--text-label) !important; }
        [data-theme="light"] .analysis-page .analysis-detail-card > div:last-child { color: var(--text) !important; }
        [data-theme="light"] .analysis-page .analysis-metric-card,
        [data-theme="light"] .analysis-page .analysis-mini-card,
        [data-theme="light"] .analysis-page .analysis-detail-card,
        [data-theme="light"] .analysis-page .analysis-alt-card { background: var(--surface2) !important; border-color: var(--border) !important; }
        [data-theme="light"] .analysis-page div[style*="rgba(0,212,255"][style*="letterSpacing"] { color: var(--text-label) !important; }
        [data-theme="light"] .analysis-page h1 { color: var(--text) !important; }
        [data-theme="light"] .analysis-page div[style*="rgba(5,12,35,0.8)"],
        [data-theme="light"] .analysis-page div[style*="rgba(0,15,40,0.5)"],
        [data-theme="light"] .analysis-page div[style*="rgba(0,10,30,0.4)"],
        [data-theme="light"] .analysis-page div[style*="rgba(0,212,255,0.05)"] { background: var(--surface2) !important; border-color: var(--border) !important; }
        [data-theme="light"] .analysis-page div[style*="rgba(255,255,255,0.7)"],
        [data-theme="light"] .analysis-page div[style*="color: #fff"],
        [data-theme="light"] .analysis-page div[style*="color:#fff"] { color: var(--text) !important; }
        [data-theme="light"] .analysis-page .analysis-card { color: var(--text) !important; }
        [data-theme="light"] .analysis-page div[style*="rgba(160,180,255"],
        [data-theme="light"] .analysis-page span[style*="rgba(160,180,255"],
        [data-theme="light"] .analysis-page div[style*="rgba(160,200,255"],
        [data-theme="light"] .analysis-page span[style*="rgba(200,210,255"],
        [data-theme="light"] .analysis-page p[style*="rgba(200,210,255"] { color: var(--text-secondary) !important; }
        [data-theme="light"] .analysis-page div[style*="rgba(0,212,255"][style*="letterSpacing"],
        [data-theme="light"] .analysis-page .analysis-detail-card > div:first-child { color: var(--text-label) !important; }
        [data-theme="light"] .analysis-page h1 > span:last-child { color: var(--text-secondary) !important; }
        [data-theme="light"] .analysis-page span[style*="color: #4fffb0"],
        [data-theme="light"] .analysis-page span[style*="color:#4fffb0"] { color: var(--success) !important; }
        [data-theme="light"] .analysis-page span[style*="color: #ff5064"],
        [data-theme="light"] .analysis-page span[style*="color:#ff5064"] { color: var(--error) !important; }
        [data-theme="light"] .analysis-page div[style*="color: #00d4ff"],
        [data-theme="light"] .analysis-page div[style*="color:#00d4ff"] { color: var(--accent) !important; }
        [data-theme="light"] .analysis-page div[style*="color: #7b8fff"],
        [data-theme="light"] .analysis-page div[style*="color:#7b8fff"] { color: #3344bb !important; }
        [data-theme="light"] .analysis-page div[style*="color: #4fffb0"],
        [data-theme="light"] .analysis-page div[style*="color:#4fffb0"] { color: var(--success) !important; }
        [data-theme="light"] .analysis-page div[style*="color: #ffb347"],
        [data-theme="light"] .analysis-page div[style*="color:#ffb347"] { color: var(--warn) !important; }
        [data-theme="light"] .analysis-page div[style*="color: #ff5064"],
        [data-theme="light"] .analysis-page div[style*="color:#ff5064"] { color: var(--error) !important; }
        [data-theme="light"] .analysis-page p[style*="rgba(79,255,176,0.6)"] { color: var(--success) !important; }
        [data-theme="light"] .analysis-page text[fill="#4fffb0"] { fill: var(--success) !important; }
        [data-theme="light"] .analysis-page text[fill="#ffb347"] { fill: var(--warn) !important; }
        [data-theme="light"] .analysis-page text[fill="#ff5064"] { fill: var(--error) !important; }
        [data-theme="dark"] .analysis-page .analysis-muted,
        [data-theme="dark"] .analysis-page .analysis-body-text,
        [data-theme="dark"] .analysis-page div[style*="rgba(160,180,255"],
        [data-theme="dark"] .analysis-page span[style*="rgba(160,180,255"],
        [data-theme="dark"] .analysis-page div[style*="rgba(160,200,255"],
        [data-theme="dark"] .analysis-page span[style*="rgba(200,210,255"],
        [data-theme="dark"] .analysis-page p[style*="rgba(200,210,255"] { color: #c6d2f1 !important; }
        [data-theme="dark"] .analysis-page .analysis-label,
        [data-theme="dark"] .analysis-page .analysis-section-label,
        [data-theme="dark"] .analysis-page div[style*="rgba(0,212,255"][style*="letterSpacing"] { color: #63dcff !important; }
        [data-theme="light"] .analysis-page :is(h1, h2, h3, p, span, div, a, button),
        [data-theme="light"] .analysis-page svg text { color: #000 !important; fill: #000 !important; }
        @media (max-width: 780px) {
          .an-score-row { grid-template-columns: 1fr !important; }
          .an-two-col   { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
