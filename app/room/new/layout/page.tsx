"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { notifyStorageChange, useBrowserStorageValue } from "../../../utils/browserStorage";
import { EDITING_ROOM_KEY } from "../../../utils/roomStorage";
import { useAuth } from "../../../context/AuthContext";
import { loadRoomPlan, type StoredRoomPlan } from "../../../utils/roomPlans";

import { calculateFurniturePlacement, WALL_T, type DoorGeometry, type FurnitureItem, type FurniturePlacement, type RoomData } from "../../../utils/furniturePlacement";

function FurnitureSymbol({ item, w, h, isPlanned }: {
  item: FurnitureItem; w: number; h: number; isPlanned: boolean;
}) {
  const cat = item.category.trim().toLowerCase();
  const bodyStroke = isPlanned ? "rgba(140,120,255,0.9)" : "rgba(0,200,255,0.85)";
  const accentFill = isPlanned ? "rgba(80,60,180,0.55)"  : "rgba(0,100,200,0.55)";
  const softFill   = isPlanned ? "rgba(60,40,140,0.35)"  : "rgba(0,60,140,0.35)";
  const bodyFill   = isPlanned ? "rgba(28,22,80,0.82)"   : "rgba(8,28,68,0.88)";
  const glassColor = "rgba(160,230,255,0.12)";
  const itemKey = item.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const sid = `s_${itemKey}_${cat.replace(/\s/g,"_")}_${isPlanned?"p":"e"}`;

  const defs = (
    <defs>
      <filter id={`f_${sid}`} x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="1" stdDeviation="2"
          floodColor={isPlanned ? "rgba(100,80,255,0.35)" : "rgba(0,180,255,0.3)"} />
      </filter>
      <linearGradient id={`g_${sid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={isPlanned ? "rgba(50,35,120,0.7)" : "rgba(0,50,130,0.7)"} />
        <stop offset="100%" stopColor={isPlanned ? "rgba(18,12,55,0.95)" : "rgba(0,18,55,0.95)"} />
      </linearGradient>
    </defs>
  );

  const plannedOverlay = isPlanned ? (
    <rect x="0" y="0" width={w} height={h} rx="3"
      fill="none" stroke="rgba(140,120,255,0.55)" strokeWidth="1.5" strokeDasharray="5,3" />
  ) : null;

  if (cat === "bed") {
    const hbH = Math.max(8, h * 0.22);
    const pilW = w * 0.32; const pilH = hbH * 0.65; const pilY = hbH * 0.18;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="2" y="2" width={w} height={h} rx="4" fill="rgba(0,0,0,0.3)" />
        <rect x="0" y="0" width={w} height={h} rx="4"
          fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
        <rect x="0" y="0" width={w} height={hbH} rx="4" fill={accentFill} stroke={bodyStroke} strokeWidth="1" />
        <rect x="3" y="3" width={w-6} height={hbH-5} rx="2" fill="none" stroke={bodyStroke} strokeWidth="0.5" opacity="0.5" />
        <rect x={w*0.06} y={pilY} width={pilW} height={pilH} rx="3" fill={glassColor} stroke={bodyStroke} strokeWidth="0.8" />
        <rect x={w*0.62} y={pilY} width={pilW} height={pilH} rx="3" fill={glassColor} stroke={bodyStroke} strokeWidth="0.8" />
        <line x1={w*0.04} y1={hbH+(h-hbH)*0.38} x2={w*0.96} y2={hbH+(h-hbH)*0.38}
          stroke={bodyStroke} strokeWidth="0.7" strokeDasharray="4,3" opacity="0.5" />
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "wardrobe") {
    const panels = Math.max(2, Math.round(w / 22));
    const pw = w / panels;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="2" y="2" width={w} height={h} rx="2" fill="rgba(0,0,0,0.3)" />
        <rect x="0" y="0" width={w} height={h} rx="2"
          fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
        <rect x="0" y="0" width={w} height={Math.max(4,h*0.1)} rx="2" fill={accentFill} stroke={bodyStroke} strokeWidth="0.8" />
        {Array.from({length:panels}).map((_,i) => (
          <g key={i}>
            {i>0 && <line x1={pw*i} y1={h*0.1} x2={pw*i} y2={h} stroke={bodyStroke} strokeWidth="0.8" opacity="0.7" />}
            <rect x={pw*i+3} y={h*0.14} width={pw-6} height={h*0.82} rx="1" fill="none" stroke={bodyStroke} strokeWidth="0.5" opacity="0.4" />
            <rect x={pw*i+pw/2-1.5} y={h*0.52} width={3} height={h*0.1} rx="1.5" fill={bodyStroke} opacity="0.8" />
          </g>
        ))}
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "study table") {
    const legSize = Math.max(3, Math.min(w, h) * 0.1);
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="2" y="2" width={w-4} height={h-4} rx="2" fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
        <rect x={w*0.12} y={h*0.14} width={w*0.76} height={h*0.72} rx="2" fill={softFill} stroke={bodyStroke} strokeWidth="0.7" />
        <rect x={w*0.2} y={h*0.22} width={w*0.32} height={h*0.16} rx="1" fill={accentFill} stroke={bodyStroke} strokeWidth="0.5" />
        {[ [legSize, legSize], [w-legSize*2, legSize], [legSize, h-legSize*2], [w-legSize*2, h-legSize*2] ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={legSize} height={legSize} rx="1" fill={bodyStroke} />
        ))}
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "tv") {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x={w*0.08} y={h*0.12} width={w*0.84} height={h*0.58} rx="2" fill={bodyFill} stroke={bodyStroke} strokeWidth="1.2" />
        <rect x={w*0.14} y={h*0.18} width={w*0.72} height={h*0.46} rx="1" fill={glassColor} stroke={bodyStroke} strokeWidth="0.6" />
        <line x1={w*0.5} y1={h*0.7} x2={w*0.5} y2={h*0.82} stroke={bodyStroke} strokeWidth="1.2" />
        <rect x={w*0.28} y={h*0.82} width={w*0.44} height={Math.max(2, h*0.08)} rx="1" fill={accentFill} stroke={bodyStroke} strokeWidth="0.7" />
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "sofa") {
    const armW = Math.max(6, Math.min(w*0.13,14));
    const backH = Math.max(8, h*0.32);
    const seats = Math.max(1, Math.round((w-armW*2)/28));
    const seatW = (w-armW*2)/seats;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="2" y="2" width={w} height={h} rx="5" fill="rgba(0,0,0,0.3)" />
        <rect x="0" y="0" width={w} height={h} rx="5"
          fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
        <rect x="0" y="0" width={w} height={backH} rx="5" fill={accentFill} stroke={bodyStroke} strokeWidth="0.9" />
        <rect x="0" y={backH} width={armW} height={h-backH} rx="3" fill={accentFill} stroke={bodyStroke} strokeWidth="0.8" />
        <rect x={w-armW} y={backH} width={armW} height={h-backH} rx="3" fill={accentFill} stroke={bodyStroke} strokeWidth="0.8" />
        {Array.from({length:seats}).map((_,i) => (
          <rect key={i} x={armW+seatW*i+2} y={backH+3} width={seatW-4} height={h-backH-6} rx="3"
            fill={softFill} stroke={bodyStroke} strokeWidth="0.6" />
        ))}
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "bookshelf") {
    const shelves = Math.max(2, Math.round(h/16));
    const sh = h/shelves;
    const bkColors = ["rgba(0,160,200,0.35)","rgba(80,120,255,0.35)","rgba(0,200,180,0.3)","rgba(120,80,255,0.3)"];
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="2" y="2" width={w} height={h} rx="2" fill="rgba(0,0,0,0.3)" />
        <rect x="0" y="0" width={w} height={h} rx="2"
          fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
        <rect x="0" y="0" width="3" height={h} fill={accentFill} />
        <rect x={w-3} y="0" width="3" height={h} fill={accentFill} />
        {Array.from({length:shelves}).map((_,i) => (
          <g key={i}>
            <rect x="0" y={sh*i} width={w} height="2.5" fill={accentFill} />
            {Array.from({length:Math.floor((w-6)/7)}).map((_,j) => (
              <rect key={j} x={3+j*7+1} y={sh*i+3} width={5} height={sh-5.5} rx="0.5"
                fill={bkColors[j%bkColors.length]} />
            ))}
          </g>
        ))}
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "dining table") {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="2" y="2" width={w} height={h} rx="3" fill="rgba(0,0,0,0.3)" />
        <rect x="0" y="0" width={w} height={h} rx="3"
          fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
        <rect x="4" y="4" width={w-8} height={h-8} rx="2" fill="none" stroke={bodyStroke} strokeWidth="0.5" opacity="0.4" />
        {[[4, 4], [w-6, 4], [4, h-6], [w-6, h-6]].map(([x, y], i) => <rect key={i} x={x} y={y} width="2" height="2" fill={bodyStroke} />)}
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "chair") {
    const backH = h*0.28;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="1.5" y="1.5" width={w} height={h} rx="4" fill="rgba(0,0,0,0.3)" />
        <rect x="0" y={backH} width={w} height={h-backH} rx="4"
          fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.1" filter={`url(#f_${sid})`} />
        <rect x="3" y={backH+3} width={w-6} height={h-backH-6} rx="3" fill={softFill} stroke={bodyStroke} strokeWidth="0.5" />
        <rect x="0" y="0" width={w} height={backH+2} rx="4" fill={accentFill} stroke={bodyStroke} strokeWidth="1" />
        <line x1={w*0.2} y1={h*0.78} x2={w*0.12} y2={h-1} stroke={bodyStroke} strokeWidth="1.2" />
        <line x1={w*0.8} y1={h*0.78} x2={w*0.88} y2={h-1} stroke={bodyStroke} strokeWidth="1.2" />
        {plannedOverlay}
      </svg>
    );
  }

  if (cat === "dressing table") {
    const mRx = w*0.28; const mRy = h*0.2; const mCy = h*0.26;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        {defs}
        <rect x="2" y="2" width={w} height={h} rx="3" fill="rgba(0,0,0,0.3)" />
        <rect x="0" y="0" width={w} height={h} rx="3"
          fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
        <ellipse cx={w*0.5} cy={mCy} rx={mRx+2} ry={mRy+2} fill={accentFill} stroke={bodyStroke} strokeWidth="1" />
        <ellipse cx={w*0.5} cy={mCy} rx={mRx} ry={mRy} fill={glassColor} stroke={bodyStroke} strokeWidth="0.6" />
        <rect x="2" y={h*0.5} width={w-4} height={h*0.07} rx="1" fill={accentFill} stroke={bodyStroke} strokeWidth="0.7" />
        <rect x={w*0.06} y={h*0.6} width={w*0.38} height={h*0.32} rx="2" fill={softFill} stroke={bodyStroke} strokeWidth="0.7" />
        <rect x={w*0.56} y={h*0.6} width={w*0.38} height={h*0.32} rx="2" fill={softFill} stroke={bodyStroke} strokeWidth="0.7" />
        {plannedOverlay}
      </svg>
    );
  }

  // Generic
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
      {defs}
      <rect x="2" y="2" width={w} height={h} rx="3" fill="rgba(0,0,0,0.3)" />
      <rect x="0" y="0" width={w} height={h} rx="3"
        fill={`url(#g_${sid})`} stroke={bodyStroke} strokeWidth="1.2" filter={`url(#f_${sid})`} />
      <rect x="4" y="4" width={w-8} height={h-8} rx="2"
        fill="none" stroke={bodyStroke} strokeWidth="0.6" strokeDasharray="4,3" opacity="0.5" />
      {plannedOverlay}
    </svg>
  );
}

/* ─────────────────────────────────────────────
   DOOR SYMBOL  — architectural floor-plan style
   Hinge at one jamb, solid door leaf, filled
   quarter-circle swing wedge, dashed arc edge.
   ───────────────────────────────────────────── */
function DoorSymbol({ door, roomPxW, roomPxH, scale }: {
  door: DoorGeometry; roomPxW: number; roomPxH: number; scale: number;
}) {
  const { wall, distance } = door;
  const dp   = door.width * scale;
  const dist = parseFloat(distance) * scale;
  const leafT = Math.max(2.5, dp * 0.055);

  // Use CSS variable values via inline style references
  const gapC     = "var(--door-gap)";
  const frameC   = "var(--door-frame)";
  const leafFill = "var(--door-leaf)";
  const leafStk  = "var(--door-frame)";
  const wedgeFill= "var(--door-wedge)";
  const arcC     = "var(--door-arc)";
  const hingeC   = "var(--door-hinge)";
  const hingeR   = Math.max(1.8, dp * 0.04);

  /*
   * For each wall the door sits in we need:
   *   hinge point (pivot), open-end point of the door leaf,
   *   and the arc end point (where the free end sweeps to).
   *
   * Convention: hinge is at the "dist" side of the opening.
   * The door swings INTO the room (inward).
   *
   * Bottom wall: hinge at (x, roomPxH), leaf goes left→right,
   *   free end sweeps up into the room.
   * Top wall:    hinge at (x, 0), free end sweeps down.
   * Left wall:   hinge at (0, y), free end sweeps right.
   * Right wall:  hinge at (roomPxW, y), free end sweeps left.
   */

  if (wall === "Bottom") {
    const x = dist;
    // hinge at (x, roomPxH), free end at (x+dp, roomPxH)
    // door leaf: thin rect along wall bottom, swings up
    // arc: from (x+dp, roomPxH) sweeping to (x, roomPxH-dp)
    return (
      <g>
        {/* erase wall gap */}
        <line x1={x} y1={roomPxH - WALL_T/2} x2={x+dp} y2={roomPxH - WALL_T/2}
          stroke={gapC} strokeWidth={WALL_T + 2} />
        {/* swing wedge fill */}
        <path d={`M${x} ${roomPxH} L${x+dp} ${roomPxH} A${dp} ${dp} 0 0 0 ${x} ${roomPxH-dp} Z`}
          fill={wedgeFill} stroke="none" />
        {/* swing arc (dashed) */}
        <path d={`M${x+dp} ${roomPxH} A${dp} ${dp} 0 0 0 ${x} ${roomPxH-dp}`}
          fill="none" stroke={arcC} strokeWidth="1" strokeDasharray="4,3" />
        {/* door leaf — solid rectangle */}
        <rect x={x} y={roomPxH - leafT} width={dp} height={leafT}
          fill={leafFill} stroke={leafStk} strokeWidth="1.5" />
        {/* left jamb */}
        <line x1={x} y1={roomPxH - WALL_T} x2={x} y2={roomPxH + 1}
          stroke={frameC} strokeWidth="2" />
        {/* right jamb */}
        <line x1={x+dp} y1={roomPxH - WALL_T} x2={x+dp} y2={roomPxH + 1}
          stroke={frameC} strokeWidth="2" />
        {/* hinge dot */}
        <circle cx={x} cy={roomPxH} r={hingeR} fill={hingeC}
          style={{ filter: "drop-shadow(0 0 3px rgba(0,255,200,0.9))" }} />
      </g>
    );
  }

  if (wall === "Top") {
    const x = dist;
    return (
      <g>
        <line x1={x} y1={WALL_T/2} x2={x+dp} y2={WALL_T/2}
          stroke={gapC} strokeWidth={WALL_T + 2} />
        <path d={`M${x} ${0} L${x+dp} ${0} A${dp} ${dp} 0 0 1 ${x} ${dp} Z`}
          fill={wedgeFill} stroke="none" />
        <path d={`M${x+dp} ${0} A${dp} ${dp} 0 0 1 ${x} ${dp}`}
          fill="none" stroke={arcC} strokeWidth="1" strokeDasharray="4,3" />
        <rect x={x} y={0} width={dp} height={leafT}
          fill={leafFill} stroke={leafStk} strokeWidth="1.5" />
        <line x1={x} y1={-1} x2={x} y2={WALL_T + 1} stroke={frameC} strokeWidth="2" />
        <line x1={x+dp} y1={-1} x2={x+dp} y2={WALL_T + 1} stroke={frameC} strokeWidth="2" />
        <circle cx={x} cy={0} r={hingeR} fill={hingeC}
          style={{ filter: "drop-shadow(0 0 3px rgba(0,255,200,0.9))" }} />
      </g>
    );
  }

  if (wall === "Left") {
    const y = dist;
    return (
      <g>
        <line x1={WALL_T/2} y1={y} x2={WALL_T/2} y2={y+dp}
          stroke={gapC} strokeWidth={WALL_T + 2} />
        <path d={`M${0} ${y} L${0} ${y+dp} A${dp} ${dp} 0 0 1 ${dp} ${y} Z`}
          fill={wedgeFill} stroke="none" />
        <path d={`M${0} ${y+dp} A${dp} ${dp} 0 0 1 ${dp} ${y}`}
          fill="none" stroke={arcC} strokeWidth="1" strokeDasharray="4,3" />
        <rect x={0} y={y} width={leafT} height={dp}
          fill={leafFill} stroke={leafStk} strokeWidth="1.5" />
        <line x1={-1} y1={y} x2={WALL_T + 1} y2={y} stroke={frameC} strokeWidth="2" />
        <line x1={-1} y1={y+dp} x2={WALL_T + 1} y2={y+dp} stroke={frameC} strokeWidth="2" />
        <circle cx={0} cy={y} r={hingeR} fill={hingeC}
          style={{ filter: "drop-shadow(0 0 3px rgba(0,255,200,0.9))" }} />
      </g>
    );
  }

  /* Right wall */
  const y = dist;
  return (
    <g>
      <line x1={roomPxW - WALL_T/2} y1={y} x2={roomPxW - WALL_T/2} y2={y+dp}
        stroke={gapC} strokeWidth={WALL_T + 2} />
      <path d={`M${roomPxW} ${y} L${roomPxW} ${y+dp} A${dp} ${dp} 0 0 0 ${roomPxW-dp} ${y} Z`}
        fill={wedgeFill} stroke="none" />
      <path d={`M${roomPxW} ${y+dp} A${dp} ${dp} 0 0 0 ${roomPxW-dp} ${y}`}
        fill="none" stroke={arcC} strokeWidth="1" strokeDasharray="4,3" />
      <rect x={roomPxW - leafT} y={y} width={leafT} height={dp}
        fill={leafFill} stroke={leafStk} strokeWidth="1.5" />
      <line x1={roomPxW - WALL_T - 1} y1={y} x2={roomPxW + 1} y2={y} stroke={frameC} strokeWidth="2" />
      <line x1={roomPxW - WALL_T - 1} y1={y+dp} x2={roomPxW + 1} y2={y+dp} stroke={frameC} strokeWidth="2" />
      <circle cx={roomPxW} cy={y} r={hingeR} fill={hingeC}
        style={{ filter: "drop-shadow(0 0 3px rgba(0,255,200,0.9))" }} />
    </g>
  );
}

/* ─────────────────────────────────────────────
   WINDOW SYMBOL
   ───────────────────────────────────────────── */
function WindowSymbol({ wall, distance, roomPxW, roomPxH, scale }: {
  wall: string; distance: string; roomPxW: number; roomPxH: number; scale: number;
}) {
  const WIN_FT = 3.5;
  const wp   = WIN_FT * scale;
  const dist = (parseFloat(distance) || 3) * scale;
  const frameC = "rgba(0,212,255,0.95)";
  const glassC = "rgba(160,230,255,0.18)";
  const gapC   = "#050718";

  if (wall === "Top") {
    const x = Math.min(dist, roomPxW - wp - 4);
    return (
      <g>
        <line x1={x} y1={WALL_T/2} x2={x+wp} y2={WALL_T/2} stroke={gapC} strokeWidth={WALL_T+2} />
        <line x1={x} y1={0} x2={x+wp} y2={0} stroke={frameC} strokeWidth="2.5" />
        <line x1={x} y1={4} x2={x+wp} y2={4} stroke={frameC} strokeWidth="1" opacity="0.6" />
        <rect x={x} y={0} width={wp} height={4} fill={glassC} />
        {[0.33,0.66].map(t => <line key={t} x1={x+wp*t} y1={0} x2={x+wp*t} y2={6} stroke={frameC} strokeWidth="0.8" opacity="0.7" />)}
        <line x1={x} y1={-2} x2={x} y2={7} stroke={frameC} strokeWidth="1.5" />
        <line x1={x+wp} y1={-2} x2={x+wp} y2={7} stroke={frameC} strokeWidth="1.5" />
      </g>
    );
  }
  if (wall === "Bottom") {
    const x = Math.min(dist, roomPxW - wp - 4);
    return (
      <g>
        <line x1={x} y1={roomPxH-WALL_T/2} x2={x+wp} y2={roomPxH-WALL_T/2} stroke={gapC} strokeWidth={WALL_T+2} />
        <line x1={x} y1={roomPxH} x2={x+wp} y2={roomPxH} stroke={frameC} strokeWidth="2.5" />
        <line x1={x} y1={roomPxH-4} x2={x+wp} y2={roomPxH-4} stroke={frameC} strokeWidth="1" opacity="0.6" />
        <rect x={x} y={roomPxH-4} width={wp} height={4} fill={glassC} />
        {[0.33,0.66].map(t => <line key={t} x1={x+wp*t} y1={roomPxH-6} x2={x+wp*t} y2={roomPxH+2} stroke={frameC} strokeWidth="0.8" opacity="0.7" />)}
        <line x1={x} y1={roomPxH-7} x2={x} y2={roomPxH+2} stroke={frameC} strokeWidth="1.5" />
        <line x1={x+wp} y1={roomPxH-7} x2={x+wp} y2={roomPxH+2} stroke={frameC} strokeWidth="1.5" />
      </g>
    );
  }
  if (wall === "Left") {
    const y = Math.min(dist, roomPxH - wp - 4);
    return (
      <g>
        <line x1={WALL_T/2} y1={y} x2={WALL_T/2} y2={y+wp} stroke={gapC} strokeWidth={WALL_T+2} />
        <line x1={0} y1={y} x2={0} y2={y+wp} stroke={frameC} strokeWidth="2.5" />
        <line x1={4} y1={y} x2={4} y2={y+wp} stroke={frameC} strokeWidth="1" opacity="0.6" />
        <rect x={0} y={y} width={4} height={wp} fill={glassC} />
        {[0.33,0.66].map(t => <line key={t} x1={0} y1={y+wp*t} x2={6} y2={y+wp*t} stroke={frameC} strokeWidth="0.8" opacity="0.7" />)}
        <line x1={-2} y1={y} x2={7} y2={y} stroke={frameC} strokeWidth="1.5" />
        <line x1={-2} y1={y+wp} x2={7} y2={y+wp} stroke={frameC} strokeWidth="1.5" />
      </g>
    );
  }
  const y = Math.min(dist, roomPxH - wp - 4);
  return (
    <g>
      <line x1={roomPxW-WALL_T/2} y1={y} x2={roomPxW-WALL_T/2} y2={y+wp} stroke={gapC} strokeWidth={WALL_T+2} />
      <line x1={roomPxW} y1={y} x2={roomPxW} y2={y+wp} stroke={frameC} strokeWidth="2.5" />
      <line x1={roomPxW-4} y1={y} x2={roomPxW-4} y2={y+wp} stroke={frameC} strokeWidth="1" opacity="0.6" />
      <rect x={roomPxW-4} y={y} width={4} height={wp} fill={glassC} />
      {[0.33,0.66].map(t => <line key={t} x1={roomPxW-6} y1={y+wp*t} x2={roomPxW+2} y2={y+wp*t} stroke={frameC} strokeWidth="0.8" opacity="0.7" />)}
      <line x1={roomPxW-7} y1={y} x2={roomPxW+2} y2={y} stroke={frameC} strokeWidth="1.5" />
      <line x1={roomPxW-7} y1={y+wp} x2={roomPxW+2} y2={y+wp} stroke={frameC} strokeWidth="1.5" />
    </g>
  );
}

/* ─────────────────────────────────────────────
   ROOM CANVAS
   ───────────────────────────────────────────── */
const PAD = 52;

function RoomCanvas({ data, zoom, placement }: { data: RoomData; zoom: number; placement: FurniturePlacement }) {
  const roomFtW = parseFloat(data.room.length) || 0;
  const roomFtH = parseFloat(data.room.width)  || 0;
  const BASE_SCALE = Math.min(480 / roomFtW, 380 / roomFtH, 36);
  const scale = BASE_SCALE * zoom;
  const roomPxW = roomFtW * scale;
  const roomPxH = roomFtH * scale;
  const svgW = roomPxW + PAD * 2;
  const svgH = roomPxH + PAD * 2;

  const door = placement.door;

  const { placed } = placement;
  const itemNumbers = new Map([...data.existing, ...data.planned].map((item, index) => [item.id, index + 1]));
  const utilization = placement.utilizationPct ?? 0;
  const walkSqFt = placement.walkingAreaSqFt?.toFixed(0) ?? "Unknown";

  const sid = "rc";

  // Wood plank lines — subtle horizontal lines across floor
  const plankH = Math.max(10, scale * 0.75);
  const plankCount = Math.ceil(roomPxH / plankH);

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", flex: "none", filter: "drop-shadow(0 0 28px rgba(0,120,255,0.18))" }}>
      <defs>
        <linearGradient id={`${sid}_wg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(0,60,140,0.95)" />
          <stop offset="100%" stopColor="rgba(0,30,80,0.98)" />
        </linearGradient>
        <linearGradient id={`${sid}_fg`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="rgba(4,18,52,0.96)" />
          <stop offset="100%" stopColor="rgba(2,10,32,0.99)" />
        </linearGradient>
        <radialGradient id={`${sid}_vign`} cx="50%" cy="50%" r="70%">
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.38)" />
        </radialGradient>
        <clipPath id={`${sid}_clip`}>
          <rect x="0" y="0" width={roomPxW} height={roomPxH} />
        </clipPath>
      </defs>

      <g transform={`translate(${PAD},${PAD})`}>
        {/* Outer wall */}
        <rect x={-WALL_T} y={-WALL_T} width={roomPxW+WALL_T*2} height={roomPxH+WALL_T*2}
          fill={`url(#${sid}_wg)`} rx="2"
          style={{ filter: "drop-shadow(0 0 10px rgba(0,180,255,0.18))" }} />

        {/* Floor base */}
        <rect x="0" y="0" width={roomPxW} height={roomPxH} fill={`url(#${sid}_fg)`} />

        {/* Wood plank lines — very subtle, no grid feel */}
        <g clipPath={`url(#${sid}_clip)`} opacity="0.055">
          {Array.from({ length: plankCount }).map((_, i) => (
            <line key={i}
              x1={0} y1={plankH * i}
              x2={roomPxW} y2={plankH * i}
              stroke="rgba(100,180,255,1)" strokeWidth="0.6" />
          ))}
        </g>

        {/* Subtle diagonal sheen across floor */}
        <rect x="0" y="0" width={roomPxW} height={roomPxH}
          fill="none"
          style={{ background: "transparent" }} />
        <line x1={0} y1={0} x2={roomPxW} y2={roomPxH}
          stroke="rgba(0,180,255,0.025)" strokeWidth={Math.max(roomPxW, roomPxH) * 0.6} />

        {/* Inner wall border */}
        <rect x="0" y="0" width={roomPxW} height={roomPxH}
          fill="none" stroke="rgba(0,212,255,0.6)" strokeWidth="1.5" />

        {/* Vignette */}
        <rect x="0" y="0" width={roomPxW} height={roomPxH} fill={`url(#${sid}_vign)`} />

        {/* Outer wall glow */}
        <rect x={-WALL_T} y={-WALL_T} width={roomPxW+WALL_T*2} height={roomPxH+WALL_T*2}
          fill="none" stroke="rgba(0,212,255,0.4)" strokeWidth="1.2" rx="2" />

        {/* Corner brackets */}
        {([[0,0,1,1],[roomPxW,0,-1,1],[0,roomPxH,1,-1],[roomPxW,roomPxH,-1,-1]] as [number,number,number,number][])
          .map(([cx,cy,sx,sy],i) => (
            <g key={i}>
              <line x1={cx} y1={cy} x2={cx+sx*12} y2={cy} stroke="rgba(0,212,255,0.9)" strokeWidth="2" />
              <line x1={cx} y1={cy} x2={cx} y2={cy+sy*12} stroke="rgba(0,212,255,0.9)" strokeWidth="2" />
              <circle cx={cx} cy={cy} r="2.5" fill="rgba(0,212,255,0.8)"
                style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.8))" }} />
            </g>
          ))}

        {/* Dimension lines */}
        <line x1={0} y1={roomPxH+18} x2={roomPxW} y2={roomPxH+18} stroke="rgba(0,212,255,0.35)" strokeWidth="0.8" />
        <line x1={0} y1={roomPxH+14} x2={0} y2={roomPxH+22} stroke="rgba(0,212,255,0.35)" strokeWidth="0.8" />
        <line x1={roomPxW} y1={roomPxH+14} x2={roomPxW} y2={roomPxH+22} stroke="rgba(0,212,255,0.35)" strokeWidth="0.8" />
        <text x={roomPxW/2} y={roomPxH+30} textAnchor="middle"
          fill="rgba(0,212,255,0.55)" fontSize="8.5" fontFamily="'Courier New',monospace" letterSpacing="0.5">
          {roomFtW} FT
        </text>
        <line x1={-20} y1={0} x2={-20} y2={roomPxH} stroke="rgba(0,212,255,0.35)" strokeWidth="0.8" />
        <line x1={-24} y1={0} x2={-16} y2={0} stroke="rgba(0,212,255,0.35)" strokeWidth="0.8" />
        <line x1={-24} y1={roomPxH} x2={-16} y2={roomPxH} stroke="rgba(0,212,255,0.35)" strokeWidth="0.8" />
        <text x={-32} y={roomPxH/2} textAnchor="middle"
          fill="rgba(0,212,255,0.55)" fontSize="8.5" fontFamily="'Courier New',monospace" letterSpacing="0.5"
          transform={`rotate(-90,${-32},${roomPxH/2})`}>
          {roomFtH} FT
        </text>

        {/* Door */}
        {door && <DoorSymbol door={door} roomPxW={roomPxW} roomPxH={roomPxH} scale={scale} />}

        {/* Window */}
        {data.window.enabled && (
          <WindowSymbol wall={data.window.wall} distance={data.window.distance}
            roomPxW={roomPxW} roomPxH={roomPxH} scale={scale} />
        )}

        {/* Furniture */}
        {placed.map(({ item, x, y, w, h }) => {
          const isPlanned = item.status === "planned";
          const markerFill = isPlanned ? "rgba(75,55,170,0.94)" : "rgba(0,55,90,0.94)";
          const markerStroke = isPlanned ? "rgba(180,160,255,0.95)" : "rgba(0,220,255,0.95)";
          const markerSize = Math.min(18, w - 4, h - 4);
          const markerX = (w - markerSize) / 2;
          const markerY = (h - markerSize) / 2;

          return (
            <g key={item.id} transform={`translate(${x * zoom},${y * zoom}) scale(${zoom})`}>
              <FurnitureSymbol item={item} w={w} h={h} isPlanned={isPlanned} />
              {/* Numbered markers map to the furniture list, keeping text off the floor plan. */}
              <g pointerEvents="none">
                <rect x={markerX} y={markerY} width={markerSize} height={markerSize} rx={markerSize / 2}
                  fill={markerFill} stroke={markerStroke} strokeWidth="1" />
                <text x={w / 2} y={h / 2 + Math.min(3, markerSize * 0.18)} textAnchor="middle"
                  fill="white" fontSize={Math.min(11, markerSize * 0.62)} fontWeight="700"
                  fontFamily="'Courier New',monospace">{itemNumbers.get(item.id)}</text>
              </g>
            </g>
          );
        })}

        {/* Room info HUD */}
        {(() => {
          const pw = Math.min(106, roomPxW * 0.36);
          const rows = [
            { k: data.room.type.toUpperCase(), v: `${roomFtW}×${roomFtH}ft` },
            { k: "UTILIZATION", v: `${utilization}%` },
            { k: "EST. REMAINING", v: `${walkSqFt} sqft` },
          ];
          return (
            <g transform={`translate(${roomPxW - pw - 4},4)`}>
              <rect x="0" y="0" width={pw} height={rows.length*11+6} rx="3"
                fill="rgba(0,10,30,0.72)" stroke="rgba(0,212,255,0.2)" strokeWidth="0.7" />
              {rows.map(({ k, v }, i) => (
                <g key={k} transform={`translate(4,${i*11+9})`}>
                  <text x="0" y="0" fill="rgba(0,212,255,0.45)" fontSize="5.5"
                    fontFamily="'Courier New',monospace" letterSpacing="0.3">{k}</text>
                  <text x={pw-8} y="0" textAnchor="end" fill="rgba(255,255,255,0.75)"
                    fontSize="5.5" fontFamily="'Courier New',monospace" fontWeight="700">{v}</text>
                </g>
              ))}
            </g>
          );
        })()}
      </g>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
   ───────────────────────────────────────────── */
export default function GeneratedRoomPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const storedRoom = useBrowserStorageValue("spacewiseCurrentRoom", "session");
  const sessionPlan = useMemo<(RoomData & { id?: string }) | null>(() => {
    try { return storedRoom ? JSON.parse(storedRoom) : null; }
    catch { return null; }
  }, [storedRoom]);
  const roomId = sessionPlan?.id ?? "";
  const [loadedRoom, setLoadedRoom] = useState<{ userId: string; roomId: string; plan: StoredRoomPlan | null } | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [roomLoadError, setRoomLoadError] = useState("");
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (!roomId) {
      queueMicrotask(() => { setRoomLoadError("No saved room plan is selected. Open a plan from My Rooms or create one first."); setRoomLoading(false); });
      return;
    }
    let active = true;
    loadRoomPlan(roomId).then(plan => {
      if (!active) return;
      setLoadedRoom({ userId: user.id, roomId, plan });
      setRoomLoadError(plan ? "" : "This room plan is not available in your Supabase account.");
    }).catch(cause => {
      if (active) {
        setLoadedRoom({ userId: user.id, roomId, plan: null });
        setRoomLoadError(cause instanceof Error ? cause.message : "Could not verify this room plan in Supabase.");
      }
    }).finally(() => { if (active) setRoomLoading(false); });
    return () => { active = false; };
  }, [authLoading, roomId, router, user]);
  const requestMatches = loadedRoom?.userId === user?.id && loadedRoom?.roomId === roomId;
  const data = requestMatches ? loadedRoom?.plan ?? null : null;
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  function editCurrentRoom() {
    if (!roomId) return;
    sessionStorage.setItem(EDITING_ROOM_KEY, roomId);
    notifyStorageChange(EDITING_ROOM_KEY, "session");
  }

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && canvasRef.current) {
      canvasRef.current.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  if (authLoading || !user || roomLoading || (Boolean(roomId) && !requestMatches)) {
    return <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center" }}>Checking sign-in…</main>;
  }

  if (!data) {
    return (
      <main style={{ minHeight: "100vh", background: "#050718", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <p role="alert" style={{ color: "rgba(0,212,255,0.6)", fontFamily: "monospace", letterSpacing: "0.1em", textAlign: "center", maxWidth: 500 }}>{roomLoadError || "Room plan data could not be verified."}</p>
        <Link href="/room/new" style={{ color: "#00d4ff", fontSize: "0.82rem", textDecoration: "none" }}>← Configure a room first</Link>
      </main>
    );
  }

  const allItems = [...data.existing, ...data.planned];
  const placement = calculateFurniturePlacement(data);
  const placedById = new Map(placement.placed.map((entry) => [entry.item.id, entry]));
  const doorConfigured = Boolean(placement.door);
  const { placedItems, unplacedItems } = placement;
  const roomFtW = parseFloat(data.room.length) || 0;
  const roomFtH = parseFloat(data.room.width)  || 0;
  const totalArea = roomFtW * roomFtH;
  const furnitureArea = placement.furnitureAreaSqFt;
  const unplacedFurnitureArea = placement.unplacedFurnitureAreaSqFt;
  const utilization = placement.utilizationPct ?? 0;
  const walkingSpace = placement.walkingAreaSqFt?.toFixed(1) ?? "Unknown";

  const infoCards = [
    { label: "ROOM SIZE",       value: `${roomFtW} × ${roomFtH} ft`,   color: "#00d4ff" },
    { label: "TOTAL AREA",      value: `${totalArea.toFixed(0)} sq ft`, color: "#7b8fff" },
    { label: "PLACED FOOTPRINT", value: `${furnitureArea.toFixed(1)} sq ft`, color: "#7b8fff" },
    { label: "UNPLACED FOOTPRINT", value: `${unplacedFurnitureArea.toFixed(1)} sq ft`, color: "#ffb347" },
    { label: "UTILIZATION", value: `${utilization}%`, color: utilization > 80 ? "#4fffb0" : "#00d4ff" },
    { label: "ESTIMATED REMAINING FLOOR AREA", value: `${walkingSpace} sq ft`, color: "#ffb347" },
    { label: "FURNITURE ITEMS", value: `${allItems.length}`,            color: "#00d4ff" },
    { label: "PLANNED ITEMS",   value: `${data.planned.length}`,        color: "#7b8fff" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,80,180,0.12) 0%, #050718 55%), #050718", color: "#fff", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ position: "fixed", top: "10%", left: "35%", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(0,100,255,0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* TOP BAR */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(5,7,24,0.88)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(0,212,255,0.08)", padding: "0 clamp(1rem,3vw,2rem)", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
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
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <ThemeToggle />
          <Link href="/room/new" onClick={editCurrentRoom} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", textDecoration: "none" }}>
            ← Edit Room
          </Link>
          <Link href={`/room/${roomId}/analysis`} className="glow-btn" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 7, border: "none", color: "#fff", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textDecoration: "none" }}>
            Analyze Room →
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(1rem,3vw,2rem)", position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: "1.4rem" }}>
          <div style={{ fontSize: "0.6rem", letterSpacing: "0.2em", color: "rgba(0,212,255,0.5)", fontWeight: 600, marginBottom: "0.3rem" }}>GENERATED LAYOUT</div>
          <h1 style={{ fontSize: "clamp(1.2rem,3vw,1.7rem)", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>
            <span className="cyan-gradient">{data.room.name}</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 400, fontSize: "0.7em", marginLeft: "0.6rem" }}>{data.room.type}</span>
          </h1>
          {placement.doorWarning && <div role="alert" style={{ marginTop: "0.7rem", padding: "0.75rem 1rem", border: "1px solid rgba(255,179,71,0.45)", borderRadius: 8, background: "rgba(255,179,71,0.1)", color: "#ffcc80", fontSize: "0.8rem" }}>{placement.doorWarning}</div>}
        </div>

        {/* INFO CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "0.7rem", marginBottom: "1.4rem" }}>
          {infoCards.map(({ label, value, color }) => (
            <div key={label} style={{ background: "rgba(5,12,35,0.8)", border: "1px solid rgba(0,212,255,0.09)", borderRadius: 10, padding: "0.8rem 1rem" }}>
              <div style={{ fontSize: "0.58rem", color: "rgba(0,212,255,0.4)", letterSpacing: "0.14em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* CANVAS + SIDEBAR */}
        <div className="gl-room-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: "1.2rem", alignItems: "start" }}>
          <div style={{ background: "rgba(5,12,35,0.82)", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 14, padding: "1.2rem", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", color: "rgba(0,212,255,0.45)", fontWeight: 600 }}>FLOOR PLAN</div>
              <div className="gl-zoom-controls" style={{ display: "flex", gap: "0.4rem" }}>
                <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.15).toFixed(2)))} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.05)", color: "rgba(0,212,255,0.7)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", minWidth: 32, transition: "all 0.15s" }}>−</button>
                <button onClick={() => setZoom(1)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.05)", color: "rgba(0,212,255,0.7)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", minWidth: 32, transition: "all 0.15s" }}>{Math.round(zoom * 100)}%</button>
                <button onClick={() => setZoom(z => Math.min(2.5, +(z + 0.15).toFixed(2)))} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.05)", color: "rgba(0,212,255,0.7)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", minWidth: 32, transition: "all 0.15s" }}>+</button>
                <button onClick={toggleFullscreen} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.05)", color: "rgba(0,212,255,0.7)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", minWidth: 32, transition: "all 0.15s" }}>{fullscreen ? "⊠" : "⛶"}</button>
              </div>
            </div>
            <div ref={canvasRef} className="gl-canvas-scroll" style={{ overflowX: "auto", overflowY: "auto", background: fullscreen ? "#050718" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, padding: fullscreen ? "2rem" : 0 }}>
              <RoomCanvas data={data} zoom={zoom} placement={placement} />
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: "1.2rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 14, height: 10, borderRadius: 2, background: "rgba(8,28,68,0.88)", border: "1.5px solid rgba(0,200,255,0.85)" }} />
                <span style={{ fontSize: "0.7rem", color: "rgba(160,180,255,0.55)" }}>Existing furniture</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 14, height: 10, borderRadius: 2, background: "rgba(28,22,80,0.82)", border: "1.5px dashed rgba(140,120,255,0.9)" }} />
                <span style={{ fontSize: "0.7rem", color: "rgba(160,180,255,0.55)" }}>Planned furniture</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {doorConfigured && <><div style={{ width: 14, height: 3, background: "rgba(0,212,255,0.9)" }} />
                <span style={{ fontSize: "0.7rem", color: "rgba(160,180,255,0.55)" }}>Door</span></>}
              </div>
              {data.window.enabled && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 14, height: 3, background: "rgba(0,212,255,0.95)", boxShadow: "0 0 4px rgba(0,212,255,0.6)" }} />
                  <span style={{ fontSize: "0.7rem", color: "rgba(160,180,255,0.55)" }}>Window</span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            <div style={{ background: "rgba(5,12,35,0.82)", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 12, padding: "1rem" }}>
              <div style={{ fontSize: "0.6rem", letterSpacing: "0.14em", color: "rgba(0,212,255,0.45)", marginBottom: 6 }}>SPACE UTILIZATION</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: utilization > 80 ? "#4fffb0" : "#00d4ff", marginBottom: 6 }}>{utilization}%</div>
              <div style={{ height: 5, background: "rgba(0,212,255,0.1)", borderRadius: 3 }}>
                <div style={{ width: `${utilization}%`, height: "100%", background: utilization > 80 ? "linear-gradient(90deg,#00d4ff,#4fffb0)" : "linear-gradient(90deg,#00d4ff,#0066ff)", borderRadius: 3, transition: "width 0.6s ease" }} />
              </div>
              <div style={{ fontSize: "0.65rem", color: "rgba(160,180,255,0.35)", marginTop: 5 }}>
                {utilization < 60 ? "Room has open space" : utilization < 80 ? "Well balanced layout" : "Efficiently utilized"}
              </div>
            </div>
            <div style={{ background: "rgba(5,12,35,0.82)", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 12, padding: "1rem" }}>
              <div style={{ fontSize: "0.6rem", letterSpacing: "0.14em", color: "rgba(0,212,255,0.45)", marginBottom: 8 }}>FURNITURE LIST</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 320, overflowY: "auto" }}>
                {allItems.map((item, index) => {
                  const placedItem = placedById.get(item.id);
                  const shownLength = placedItem?.rotation === 90 ? item.width : item.length;
                  const shownWidth = placedItem?.rotation === 90 ? item.length : item.width;
                  return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", borderRadius: 6, background: "rgba(0,15,40,0.5)" }}>
                    <div aria-label={`Furniture marker ${index + 1}`} style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", fontSize: "0.62rem", fontWeight: 700, color: "white", background: item.status === "planned" ? "rgba(75,55,170,0.94)" : "rgba(0,55,90,0.94)", border: `1px solid ${item.status === "planned" ? "rgba(180,160,255,0.95)" : "rgba(0,220,255,0.95)"}` }}>{index + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name || item.category}</div>
                      <div style={{ fontSize: "0.6rem", color: "rgba(160,180,255,0.45)" }}>{item.category} · {shownLength}×{shownWidth} ft{placedItem?.rotation === 90 ? " · rotated" : ""}</div>
                      <div style={{ fontSize: "0.58rem", color: placedItems.has(item) ? "rgba(79,255,176,0.75)" : "rgba(255,180,100,0.9)" }}>{item.status === "planned" ? "Planned" : "Existing"} · {placedItems.has(item) ? "placed" : `⚠ Not placed — ${placement.unplacedReasons.get(item.id) ?? "No valid position found."}`}</div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
            <div style={{ background: "rgba(5,12,35,0.82)", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 12, padding: "1rem" }}>
              <div style={{ fontSize: "0.6rem", letterSpacing: "0.14em", color: "rgba(0,212,255,0.45)", marginBottom: 6 }}>LAYOUT STATUS</div>
              {[
                { label: unplacedItems.length ? `${unplacedItems.length} item${unplacedItems.length === 1 ? "" : "s"} not placed` : "Furniture fits", ok: unplacedItems.length === 0 },
                { label: placement.checks.doorSwing?.evaluated ? "Door swing clear" : "Door swing — Not evaluated", ok: placement.checks.doorSwing?.passed ?? null },
                { label: placement.checks.entranceAccess?.evaluated ? "Entrance route" : "Entrance route — Not evaluated", ok: placement.checks.entranceAccess?.passed ?? null },
                { label: placement.checks.windows?.evaluated ? "Window clear" : "Window — Not evaluated", ok: placement.checks.windows?.evaluated ? placement.checks.windows.passed : null },
                { label: placement.checks.walkingRoutes.evaluated ? "Walking route" : "Walking route — Not evaluated", ok: placement.checks.walkingRoutes.evaluated ? placement.checks.walkingRoutes.passed : null },
              ].map(({ label, ok }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: "0.7rem", color: ok === null ? "rgba(160,180,255,0.45)" : ok ? "#4fffb0" : "rgba(255,100,100,0.85)" }}>{ok === null ? "—" : ok ? "✓" : "!"}</span>
                  <span style={{ fontSize: "0.7rem", color: "rgba(160,180,255,0.55)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div style={{ display: "flex", gap: "0.8rem", marginTop: "1.4rem", flexWrap: "wrap" }}>
          <Link href={`/room/${roomId}/analysis`} className="glow-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 24px", borderRadius: 8, border: "none", color: "#fff", fontWeight: 700, fontSize: "0.88rem", letterSpacing: "0.06em", textDecoration: "none" }}>
            Analyze Room →
          </Link>
          <Link href="/room/new" onClick={editCurrentRoom} style={{ display: "inline-flex", alignItems: "center", padding: "11px 20px", borderRadius: 8, border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.04)", color: "rgba(160,180,255,0.6)", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.05em", textDecoration: "none" }}>
            ← Edit Room
          </Link>
          <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", padding: "11px 20px", borderRadius: 8, border: "1px solid rgba(0,212,255,0.1)", background: "transparent", color: "rgba(160,180,255,0.4)", fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.05em", textDecoration: "none" }}>
            Dashboard
          </Link>
        </div>
      </div>

      <style>{`
        @media (max-width: 780px) {
          .gl-room-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .gl-room-grid > * { min-width: 0; }
          .gl-canvas-scroll { justify-content: flex-start !important; overscroll-behavior-x: contain; }
          .gl-zoom-controls { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
