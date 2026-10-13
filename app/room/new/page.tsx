"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "../../components/ThemeToggle";
import { notifyStorageChange, useBrowserStorageValue } from "../../utils/browserStorage";
import { calculateFurniturePlacement, DEFAULT_DOOR_WIDTH_FT } from "../../utils/furniturePlacement";
import { CURRENT_ROOM_KEY, EDITING_ROOM_KEY } from "../../utils/roomStorage";
import { useAuth } from "../../context/AuthContext";
import { loadRoomPlan, saveRoomPlan, type StoredRoomPlan } from "../../utils/roomPlans";

/* ── Types ── */
interface FurnitureItem {
  [key: string]: unknown;
  id: string;
  name: string;
  category: string;
  sizeMode: "standard" | "actual";
  length: string;
  width: string;
  status: "existing" | "planned";
}

interface RoomForm {
  name: string;
  type: string;
  length: string;
  width: string;
}

interface DoorForm {
  enabled: boolean;
  wall: string;
  distance: string;
}

interface WindowForm {
  enabled: boolean;
  wall: string;
  distance: string;
}

interface Errors {
  name?: string;
  type?: string;
  length?: string;
  width?: string;
  furniture?: string;
  [key: string]: string | undefined;
}

/* ── Constants ── */
const ROOM_TYPES = ["Bedroom", "Living Room", "Study Room", "Dining Room", "Other"];
const WALLS = ["Top", "Bottom", "Left", "Right"];
const FURNITURE_CATEGORIES = [
  "Bed", "Wardrobe", "Study Table", "Sofa", "Bookshelf",
  "Dining Table", "Chair", "Dressing Table", "TV", "Other",
];

const STANDARD_SIZES: Record<string, { length: string; width: string }> = {
  "Bed":           { length: "6.5", width: "5" },
  "Wardrobe":      { length: "6",   width: "2" },
  "Study Table":   { length: "4",   width: "2" },
  "Sofa":          { length: "7",   width: "3" },
  "Bookshelf":     { length: "3",   width: "1" },
  "Dining Table":  { length: "5",   width: "3" },
  "Chair":         { length: "1.5", width: "1.5" },
  "Dressing Table":{ length: "3.5", width: "1.5" },
  "TV":            { length: "5.5", width: "1.5" },
  "Other":         { length: "",    width: "" },
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `furniture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeFurniture(status: "existing" | "planned"): FurnitureItem {
  return { id: uid(), name: "", category: "Bed", sizeMode: "standard", length: "6.5", width: "5", status };
}

/* ── Preview SVG ── */
function RoomPreview({ length, width }: { length: string; width: string }) {
  const l = parseFloat(length) || 0;
  const w = parseFloat(width) || 0;
  const valid = l > 0 && w > 0;

  const PAD = 24;
  const SVG_W = 260;
  const SVG_H = 200;
  const maxDim = Math.max(l, w, 1);
  const scale = Math.min((SVG_W - PAD * 2) / l, (SVG_H - PAD * 2) / w, 30);
  const rw = valid ? l * scale : SVG_W - PAD * 2;
  const rh = valid ? w * scale : SVG_H - PAD * 2;
  const ox = (SVG_W - rw) / 2;
  const oy = (SVG_H - rh) / 2;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: "block" }}>
      <rect x={ox} y={oy} width={rw} height={rh}
        fill="rgba(0,30,60,0.55)" stroke="rgba(0,212,255,0.5)" strokeWidth="1.5" rx="1"
        style={{ filter: "drop-shadow(0 0 6px rgba(0,212,255,0.2))" }} />
      {valid && (
        <>
          <circle cx={ox} cy={oy} r="2.5" fill="rgba(0,212,255,0.6)" />
          <circle cx={ox + rw} cy={oy} r="2.5" fill="rgba(0,212,255,0.6)" />
          <circle cx={ox} cy={oy + rh} r="2.5" fill="rgba(0,212,255,0.6)" />
          <circle cx={ox + rw} cy={oy + rh} r="2.5" fill="rgba(0,212,255,0.6)" />
          {/* dimension labels */}
          <text x={SVG_W / 2} y={oy + rh + 14} textAnchor="middle"
            fill="rgba(0,212,255,0.5)" fontSize="8" fontFamily="monospace">{l} ft</text>
          <text x={ox - 6} y={SVG_H / 2} textAnchor="middle"
            fill="rgba(0,212,255,0.5)" fontSize="8" fontFamily="monospace"
            transform={`rotate(-90,${ox - 6},${SVG_H / 2})`}>{w} ft</text>
          {/* area */}
          <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle"
            fill="rgba(0,212,255,0.25)" fontSize="9" fontFamily="monospace">{(l * w).toFixed(1)} sq ft</text>
        </>
      )}
      {!valid && (
        <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle"
          fill="rgba(0,212,255,0.2)" fontSize="9" fontFamily="monospace">Enter dimensions</text>
      )}
    </svg>
  );
}

/* ── Toggle ── */
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div className="rs-toggle" onClick={onToggle}>
      <div className={`rs-toggle-track${on ? " on" : ""}`}>
        <div className="rs-toggle-thumb" />
      </div>
      <span style={{ fontSize: "0.82rem", color: on ? "rgba(0,212,255,0.85)" : "rgba(160,180,255,0.5)" }}>{label}</span>
    </div>
  );
}

/* ── Field ── */
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="rs-label">{label}</label>
      {children}
      {error && <p className="rs-field-err">{error}</p>}
    </div>
  );
}

/* ── Select ── */
function Select({ value, onChange, options, error }: {
  value: string; onChange: (v: string) => void; options: string[]; error?: boolean;
}) {
  return (
    <select
      className={`rs-input${error ? " err" : ""}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ appearance: "none", cursor: "pointer" }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/* ── Furniture Row ── */
function FurnitureRow({
  item, index, onUpdate, onRemove, errors,
}: {
  item: FurnitureItem;
  index: number;
  onUpdate: (id: string, patch: Partial<FurnitureItem>) => void;
  onRemove: (id: string) => void;
  errors: Errors;
}) {
  function handleCategory(cat: string) {
    const std = STANDARD_SIZES[cat] ?? { length: "", width: "" };
    const sizeMode = cat === "Other" ? "actual" : item.sizeMode;
    onUpdate(item.id, {
      category: cat,
      sizeMode,
      length: cat === "Other" ? "" : sizeMode === "standard" ? std.length : item.length,
      width: cat === "Other" ? "" : sizeMode === "standard" ? std.width : item.width,
    });
  }

  function handleSizeMode(mode: "standard" | "actual") {
    const std = STANDARD_SIZES[item.category] ?? { length: "", width: "" };
    const sizeMode = item.category === "Other" ? "actual" : mode;
    onUpdate(item.id, {
      sizeMode,
      length: sizeMode === "standard" ? std.length : "",
      width:  sizeMode === "standard" ? std.width  : "",
    });
  }

  const prefix = `${item.status}_${index}`;

  return (
    <div className="rs-furniture-row">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
        <span style={{ fontSize: "0.7rem", color: "rgba(0,212,255,0.4)", letterSpacing: "0.1em" }}>
          ITEM {index + 1}
        </span>
        <button className="rs-remove-btn" onClick={() => onRemove(item.id)} type="button" aria-label="Remove">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem", marginBottom: "0.7rem" }}>
        <Field label="Name" error={errors[`${prefix}_name`]}>
          <input className={`rs-input${errors[`${prefix}_name`] ? " err" : ""}`}
            placeholder={item.category === "Other" ? "Name your custom furniture" : "e.g. Queen Bed"}
            value={item.name}
            onChange={e => onUpdate(item.id, { name: e.target.value })} />
        </Field>
        <Field label="Category">
          <Select value={item.category} onChange={handleCategory} options={FURNITURE_CATEGORIES} />
        </Field>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.7rem" }}>
        {(["standard", "actual"] as const).map(m => (
          <button key={m} type="button"
            className={`rs-size-pill${item.sizeMode === m ? " active" : ""}`}
            onClick={() => handleSizeMode(m)}>
            {m === "standard" ? "Standard Size" : "Actual Size"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}>
        <Field label="Length (ft)" error={errors[`${prefix}_length`]}>
          <input className={`rs-input${errors[`${prefix}_length`] ? " err" : ""}`}
            type="number" min="0" step="0.1"
            placeholder="ft"
            value={item.length}
            readOnly={item.sizeMode === "standard"}
            onChange={e => onUpdate(item.id, { length: e.target.value })}
            style={{ opacity: item.sizeMode === "standard" ? 0.6 : 1 }} />
        </Field>
        <Field label="Width (ft)" error={errors[`${prefix}_width`]}>
          <input className={`rs-input${errors[`${prefix}_width`] ? " err" : ""}`}
            type="number" min="0" step="0.1"
            placeholder="ft"
            value={item.width}
            readOnly={item.sizeMode === "standard"}
            onChange={e => onUpdate(item.id, { width: e.target.value })}
            style={{ opacity: item.sizeMode === "standard" ? 0.6 : 1 }} />
        </Field>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function RoomSetupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const editingId = useBrowserStorageValue(EDITING_ROOM_KEY, "session");

  const [room, setRoom] = useState<RoomForm>({ name: "", type: "Bedroom", length: "", width: "" });
  const [existing, setExisting] = useState<FurnitureItem[]>([makeFurniture("existing")]);
  const [planned, setPlanned] = useState<FurnitureItem[]>([]);
  const [door, setDoor] = useState<DoorForm>({ enabled: false, wall: "Bottom", distance: "" });
  const [win, setWin] = useState<WindowForm>({ enabled: false, wall: "Top", distance: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState("");
  const [editLoadMessage, setEditLoadMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<StoredRoomPlan | null>(null);
  const [editingPlanOwnerId, setEditingPlanOwnerId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const loadedEditingId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadRoomForEditing = async () => {
      if (cancelled || authLoading) return;
      if (!user) { router.replace("/login"); return; }
      if (!editingId || loadedEditingId.current === `${user.id}:${editingId}`) return;
      let cloudLoadIssue = "";
      try {
        let plan: StoredRoomPlan | undefined;
        try { plan = (await loadRoomPlan(editingId)) ?? undefined; }
        catch (cause) { cloudLoadIssue = cause instanceof Error ? cause.message : "Cloud room data could not be loaded."; }
        if (!plan) {
          if (cancelled) return;
          loadedEditingId.current = `${user.id}:${editingId}`;
          setEditingPlan(null);
          setEditingPlanOwnerId(user.id);
          setEditingPlanId(editingId);
          setEditLoadMessage(cloudLoadIssue ? `Could not load this room plan from Supabase: ${cloudLoadIssue}` : "This room plan is not available in your Supabase account. Local browser data has not been used as a fallback.");
          return;
        }
        if (cancelled) return;
        loadedEditingId.current = `${user.id}:${editingId}`;
        setEditingPlan(plan);
        setEditingPlanOwnerId(user.id);
        setEditingPlanId(editingId);
        setEditLoadMessage("");
        setRoom({ ...plan.room });
        setExisting(plan.existing?.length ? plan.existing.map(item => ({ ...item, sizeMode: item.sizeMode === "actual" ? "actual" as const : "standard" as const, status: "existing" as const })) : []);
        setPlanned(plan.planned?.map(item => ({ ...item, sizeMode: item.sizeMode === "actual" ? "actual" as const : "standard" as const, status: "planned" as const })) || []);
        setDoor({ ...plan.door, wall: plan.door?.wall === "auto" ? "Bottom" : plan.door?.wall || "Bottom" });
        setWin({ ...plan.window, wall: plan.window?.wall || "Top" });
        setErrors({});
      } catch {
        loadedEditingId.current = `${user.id}:${editingId}`;
        setEditingPlan(null);
        setEditingPlanOwnerId(user.id);
        setEditingPlanId(editingId);
        setEditLoadMessage("Could not load this room plan from your Supabase account.");
      }
    };
    void loadRoomForEditing();
    return () => { cancelled = true; };
  }, [authLoading, editingId, user, router]);
  /* furniture helpers */
  function updateItem(list: FurnitureItem[], setList: React.Dispatch<React.SetStateAction<FurnitureItem[]>>, id: string, patch: Partial<FurnitureItem>) {
    setList(list.map(i => i.id === id ? { ...i, ...patch } : i));
  }
  function removeItem(list: FurnitureItem[], setList: React.Dispatch<React.SetStateAction<FurnitureItem[]>>, id: string) {
    setList(list.filter(i => i.id !== id));
  }

  /* validation */
  function validate(): Errors {
    const e: Errors = {};
    if (!room.name.trim()) e.name = "Room name is required.";
    if (!room.length || parseFloat(room.length) <= 0) e.length = "Enter a valid length.";
    if (!room.width  || parseFloat(room.width)  <= 0) e.width  = "Enter a valid width.";

    const allItems = [...existing, ...planned];
    if (allItems.length === 0) e.furniture = "Add at least one furniture item.";

    allItems.forEach(item => {
      const prefix = `${item.status}_${item.status === "existing" ? existing.indexOf(item) : planned.indexOf(item)}`;
      if (!item.name.trim()) e[`${prefix}_name`] = "Name required.";
      if (!item.length || parseFloat(item.length) <= 0) e[`${prefix}_length`] = "Must be > 0.";
      if (!item.width  || parseFloat(item.width)  <= 0) e[`${prefix}_width`]  = "Must be > 0.";
    });

    return e;
  }

  async function handleGenerate() {
    const ownedEditingPlan = user && editingPlanOwnerId === user.id && editingPlanId === editingId ? editingPlan : null;
    if (editingId && !ownedEditingPlan) {
      setSaveError("This room plan has not been verified as belonging to the signed-in account.");
      return;
    }
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const id = ownedEditingPlan?.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const now = new Date().toISOString();
    const itemIds = new Set<string>();
    const ensureUniqueIds = (items: FurnitureItem[]) => items.map(item => {
      let itemId = item.id;
      while (!itemId || itemIds.has(itemId)) itemId = uid();
      itemIds.add(itemId);
      return { ...item, id: itemId };
    });
    const payload: StoredRoomPlan = {
      ...(ownedEditingPlan || {}),
      id,
      createdAt: ownedEditingPlan?.createdAt || now,
      updatedAt: now,
      room: { ...(ownedEditingPlan?.room || {}), ...room },
      existing: ensureUniqueIds(existing),
      planned: ensureUniqueIds(planned),
      door: door.enabled ? door : { enabled: false, wall: "auto", distance: "" },
      window: win.enabled ? win : { enabled: false, wall: "", distance: "" },
    };
    const layout = calculateFurniturePlacement(payload);
    const savedPayload = {
      ...payload,
      door: layout.door ?? { enabled: false, wall: "", distance: "", width: DEFAULT_DOOR_WIDTH_FT, swingDirection: "inward" as const, hinge: "start" as const, autoPlaced: true, warning: layout.doorWarning ?? "No valid entrance position was found." },
      generatedLayout: {
        placementVersion: 3,
        generatedAt: now,
        placed: layout.placed.map(({ item, x, y, w, h, rotation }) => ({ itemId: item.id, x, y, width: w, height: h, rotation })),
        unplaced: layout.unplacedItems.map(item => ({ itemId: item.id, reason: layout.unplacedReasons.get(item.id) || "No valid position found." })),
      },
    };
    setSaving(true);
    setSaveError("");
    let persistedPlan: StoredRoomPlan;
    try {
      persistedPlan = await saveRoomPlan(savedPayload);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save this room plan to Supabase.");
      setSaving(false);
      return;
    }
    const finalPayload = { ...savedPayload, ...persistedPlan };
    sessionStorage.setItem(CURRENT_ROOM_KEY, JSON.stringify(finalPayload));
    notifyStorageChange(CURRENT_ROOM_KEY, "session");
    sessionStorage.removeItem(EDITING_ROOM_KEY);
    notifyStorageChange(EDITING_ROOM_KEY, "session");
    // Keep the legacy browser plan list untouched. Cloud persistence is authoritative for this save.
    router.push("/room/new/layout");
  }

  /* progress dots — count filled sections */
  const dots = [
    !!(room.name && room.length && room.width),
    existing.length > 0,
    planned.length > 0,
    true, // door always "touched"
    true, // window always "touched"
  ];

  if (authLoading || !user) return <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center" }}>Checking sign-in…</main>;
  const ownedEditingPlan = editingPlanOwnerId === user.id && editingPlanId === editingId ? editingPlan : null;
  if (editingId && (editingPlanOwnerId !== user.id || editingPlanId !== editingId)) return <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center" }}>Verifying room ownership…</main>;

  return (
    <div className="rs-page">
      {/* Ambient glows */}
      <div style={{ position: "fixed", top: "5%", left: "40%", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(0,100,255,0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Top bar */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--surface2)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "0 clamp(1rem,3vw,2rem)", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="3" width="22" height="22" rx="2" stroke="rgba(0,212,255,0.7)" strokeWidth="1.2" fill="rgba(0,40,80,0.4)" />
            <rect x="7" y="12" width="6" height="10" rx="0.5" stroke="rgba(0,212,255,0.5)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <rect x="15" y="7" width="8" height="7" rx="0.5" stroke="rgba(0,212,255,0.5)" strokeWidth="1" fill="rgba(0,80,160,0.3)" />
            <line x1="3" y1="22" x2="25" y2="22" stroke="rgba(0,212,255,0.4)" strokeWidth="1" />
            <circle cx="22" cy="3" r="2" fill="rgba(0,212,255,0.6)" />
          </svg>
          <span className="cyan-gradient" style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.07em" }}>SpaceWise</span>
          <span style={{ color: "rgba(0,212,255,0.25)", margin: "0 4px" }}>/</span>
          <span style={{ fontSize: "0.78rem", color: "rgba(160,180,255,0.5)", letterSpacing: "0.05em" }}>{editingPlan ? "Edit Room" : "New Room"}</span>
        </div>
        {/* Progress dots + theme toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {dots.map((done, i) => (
              <div key={i} className={`rs-step-dot${done ? " done" : ""}`} />
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(1rem,3vw,2rem)", display: "grid", gridTemplateColumns: "1fr auto", gap: "1.5rem", alignItems: "start" }}>

        {/* ── LEFT: Form ── */}
        <div style={{ minWidth: 0 }}>
          {/* Page heading */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "0.62rem", letterSpacing: "0.2em", color: "rgba(0,212,255,0.5)", fontWeight: 600, marginBottom: "0.4rem" }}>ROOM CONFIGURATION</div>
            <h1 style={{ fontSize: "clamp(1.3rem,3vw,1.8rem)", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>
              Configure Your <span className="cyan-gradient">Room Plan</span>
            </h1>
            <p style={{ fontSize: "0.82rem", color: "rgba(160,180,255,0.45)", marginTop: "0.3rem" }}>
              Fill in the details below to generate your smart room layout.
            </p>
          </div>

          {/* ── SECTION 1: Room Details ── */}
          <div className="rs-section">
            <div className="rs-section-title">
              <SectionIcon n={1} />
              Room Details
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginBottom: "0.8rem" }}>
              <Field label="Room Name" error={errors.name}>
                <input className={`rs-input${errors.name ? " err" : ""}`}
                  placeholder="e.g. Master Bedroom"
                  value={room.name}
                  onChange={e => setRoom({ ...room, name: e.target.value })} />
              </Field>
              <Field label="Room Type">
                <Select value={room.type} onChange={v => setRoom({ ...room, type: v })} options={ROOM_TYPES} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
              <Field label="Length (ft)" error={errors.length}>
                <input className={`rs-input${errors.length ? " err" : ""}`}
                  type="number" min="0" step="0.5" placeholder="e.g. 12"
                  value={room.length}
                  onChange={e => setRoom({ ...room, length: e.target.value })} />
              </Field>
              <Field label="Width (ft)" error={errors.width}>
                <input className={`rs-input${errors.width ? " err" : ""}`}
                  type="number" min="0" step="0.5" placeholder="e.g. 10"
                  value={room.width}
                  onChange={e => setRoom({ ...room, width: e.target.value })} />
              </Field>
            </div>
          </div>

          {/* ── SECTION 2: Existing Furniture ── */}
          <div className="rs-section">
            <div className="rs-section-title">
              <SectionIcon n={2} />
              Existing Furniture
            </div>
            {errors.furniture && existing.length === 0 && planned.length === 0 && (
              <p className="rs-field-err" style={{ marginBottom: "0.8rem" }}>{errors.furniture}</p>
            )}
            {existing.map((item, idx) => (
              <FurnitureRow key={item.id} item={item} index={idx}
                onUpdate={(id, patch) => updateItem(existing, setExisting, id, patch)}
                onRemove={(id) => removeItem(existing, setExisting, id)}
                errors={errors} />
            ))}
            <button type="button" className="rs-add-btn"
              onClick={() => setExisting(p => [...p, makeFurniture("existing")])}>
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Add Furniture Item
            </button>
          </div>

          {/* ── SECTION 3: Furniture to Buy ── */}
          <div className="rs-section">
            <div className="rs-section-title">
              <SectionIcon n={3} />
              Furniture to Buy
              <span style={{ marginLeft: "auto", fontSize: "0.6rem", color: "rgba(0,212,255,0.35)", fontWeight: 500, letterSpacing: "0.08em" }}>PLANNED</span>
            </div>
            {errors.furniture && existing.length === 0 && planned.length === 0 && (
              <p className="rs-field-err" style={{ marginBottom: "0.8rem" }}>{errors.furniture}</p>
            )}
            {planned.length === 0 && (
              <p style={{ fontSize: "0.78rem", color: "rgba(160,180,255,0.3)", marginBottom: "0.8rem" }}>
                No planned items yet. Add furniture you intend to buy.
              </p>
            )}
            {planned.map((item, idx) => (
              <FurnitureRow key={item.id} item={item} index={idx}
                onUpdate={(id, patch) => updateItem(planned, setPlanned, id, patch)}
                onRemove={(id) => removeItem(planned, setPlanned, id)}
                errors={errors} />
            ))}
            <button type="button" className="rs-add-btn"
              onClick={() => setPlanned(p => [...p, makeFurniture("planned")])}>
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Add Planned Item
            </button>
          </div>

          {/* ── SECTION 4: Door ── */}
          <div className="rs-section">
            <div className="rs-section-title">
              <SectionIcon n={4} />
              Door Details
            </div>
            <Toggle on={door.enabled} onToggle={() => setDoor(d => ({ ...d, enabled: !d.enabled }))}
              label="I want to provide door position" />
            {door.enabled && (
              <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                <Field label="Wall Position">
                  <Select value={door.wall} onChange={v => setDoor(d => ({ ...d, wall: v }))} options={WALLS} />
                </Field>
                <Field label="Distance from Corner (ft)">
                  <input className="rs-input" type="number" min="0" step="0.5"
                    placeholder="e.g. 2"
                    value={door.distance}
                    onChange={e => setDoor(d => ({ ...d, distance: e.target.value }))} />
                </Field>
              </div>
            )}
            {!door.enabled && (
              <p style={{ fontSize: "0.75rem", color: "rgba(160,180,255,0.3)", marginTop: "0.7rem" }}>
                A 3 ft entrance door will be positioned automatically when you generate the room.
              </p>
            )}
          </div>

          {/* ── SECTION 5: Window ── */}
          <div className="rs-section">
            <div className="rs-section-title">
              <SectionIcon n={5} />
              Window Details
            </div>
            <Toggle on={win.enabled} onToggle={() => setWin(w => ({ ...w, enabled: !w.enabled }))}
              label="My room has a window" />
            {win.enabled && (
              <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                <Field label="Wall Position">
                  <Select value={win.wall} onChange={v => setWin(w => ({ ...w, wall: v }))} options={WALLS} />
                </Field>
                <Field label="Distance from Corner (ft)">
                  <input className="rs-input" type="number" min="0" step="0.5"
                    placeholder="e.g. 3"
                    value={win.distance}
                    onChange={e => setWin(w => ({ ...w, distance: e.target.value }))} />
                </Field>
              </div>
            )}
            {!win.enabled && (
              <p style={{ fontSize: "0.75rem", color: "rgba(160,180,255,0.3)", marginTop: "0.7rem" }}>
                No window will be added to the layout.
              </p>
            )}
          </div>

          {/* ── Actions ── */}
          <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
            {editingId && editLoadMessage && <p role="status" style={{ flexBasis: "100%", color: "var(--text-secondary)", fontSize: "0.78rem", overflowWrap: "anywhere" }}>{editLoadMessage}</p>}
            {saveError && <p role="alert" className="rs-field-err" style={{ flexBasis: "100%", overflowWrap: "anywhere" }}>{saveError}</p>}
            <button type="button" className="glow-btn"
              onClick={() => void handleGenerate()}
              disabled={saving || Boolean(editingId && !editingPlan)}
              style={{ padding: "12px 28px", borderRadius: 8, border: "none", color: "#fff", fontWeight: 700, fontSize: "0.92rem", letterSpacing: "0.07em", cursor: saving || Boolean(editingId && !editingPlan) ? "wait" : "pointer", opacity: saving || Boolean(editingId && !editingPlan) ? 0.7 : 1 }}>
              {saving ? "Saving room plan…" : editingId && !ownedEditingPlan ? "Saved room unavailable" : ownedEditingPlan ? "Save Room Changes →" : "Generate My Room →"}
            </button>
            <Link href="/dashboard"
              style={{ display: "inline-flex", alignItems: "center", padding: "12px 22px", borderRadius: 8, border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.04)", color: "rgba(160,180,255,0.6)", fontWeight: 600, fontSize: "0.88rem", letterSpacing: "0.05em", textDecoration: "none", transition: "all 0.18s" }}>
              Cancel
            </Link>
          </div>
        </div>

        {/* ── RIGHT: Preview ── */}
        <div style={{ width: 300, flexShrink: 0 }} className="rs-preview-col">
          <div className="rs-preview-box">
            <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", color: "rgba(0,212,255,0.45)", fontWeight: 600, marginBottom: "0.8rem" }}>
              ROOM PREVIEW
            </div>
            <RoomPreview length={room.length} width={room.width} />
            {room.name && (
              <div style={{ marginTop: "0.8rem", textAlign: "center" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{room.name}</div>
                <div style={{ fontSize: "0.7rem", color: "rgba(0,212,255,0.4)", marginTop: 2 }}>{room.type}</div>
              </div>
            )}
            {/* Quick stats */}
            <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {[
                { label: "EXISTING", val: existing.length },
                { label: "PLANNED",  val: planned.length },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: "rgba(0,15,40,0.6)", borderRadius: 7, padding: "7px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#00d4ff" }}>{val}</div>
                  <div style={{ fontSize: "0.58rem", color: "rgba(0,212,255,0.35)", letterSpacing: "0.1em" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile preview below form */}
      <style>{`
        @media (max-width: 860px) {
          .rs-page > header { height: auto !important; min-height: 56px; flex-wrap: wrap; padding-top: 0.6rem !important; padding-bottom: 0.6rem !important; }
          .rs-preview-col { display: block !important; width: 100% !important; }
          .rs-preview-box { position: static; }
          .rs-page > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Section number badge ── */
function SectionIcon({ n }: { n: number }) {
  return (
    <div style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "#00d4ff", flexShrink: 0 }}>
      {n}
    </div>
  );
}
