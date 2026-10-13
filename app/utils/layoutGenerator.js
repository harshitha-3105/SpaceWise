// layoutGenerator.js
// SpaceWise - generateRoomLayout engine.
//
// Pure, dependency-free generator. Reads the flat room payload stored under
// sessionStorage key spacewiseCurrentRoom and returns a layout object that
// the GeneratedRoomPage consumes verbatim:
//
//   {
//     room: { name, type, length, width },        // feet
//     door:  { enabled, wall, distance },          // feet / wall id
//     window:{ enabled, wall, distance },         // feet / wall id
//     roomPxW, roomPxH,                          // px at 1:1 scale
//     placed: [ { item, x, y, w, h } ... ],       // px coords, top-left origin
//     unplaced: [ { item } ... ],
//     warnings: [ string ... ],
//   }
//
// All measurements are in FEET for input, and PIXELS for output.
// No side effects, no DOM dependencies - safe to import anywhere.

// Placement constants (px)
const WALL_T   = 7;    // wall thickness px
const WALK_CLR = 18;   // minimum walking clearance px between items
const WALL_OFF = WALL_T + 4; // offset from inner wall face
const DOOR_FT  = 3;    // nominal door width (ft) - kept proportional to scale

// Helpers

/** Returns true when value is a finite number (not NaN, not Infinity). */
function isFiniteNum(v) {
  return typeof v === "number" && isFinite(v);
}

/** Returns a finite number, or 0 when not parseable. */
function toNum(v) {
  const n = parseFloat(v);
  return isFiniteNum(n) ? n : 0;
}

/** Returns true when value is a finite number > 0. */
function isPos(v) {
  return isFiniteNum(toNum(v)) && toNum(v) > 0;
}

/** Returns true when an item has valid numeric x, y, length, width > 0. */
function isValidItem(item) {
  return (
    item != null &&
    isFiniteNum(item.x) &&
    isFiniteNum(item.y) &&
    isFiniteNum(item.length) &&
    isFiniteNum(item.width) &&
    item.length > 0 &&
    item.width  > 0
  );
}

/** Returns true when a room has valid numeric length and width > 0. */
function isValidRoom(room) {
  return (
    room != null &&
    isFiniteNum(room.length) &&
    isFiniteNum(room.width) &&
    room.length > 0 &&
    room.width > 0
  );
}

// Category -> preferred wall order (matches the existing smart engine).
function preferredWalls(category, doorWall, roomType) {
  const cat = String(category || "").toLowerCase();
  const allWalls = ["Top", "Bottom", "Left", "Right"];
  // walls that are NOT the door wall
  const nonDoor = allWalls.filter(w => w !== doorWall);

  if (cat === "bed") {
    const opp = { Bottom: "Top", Top: "Bottom", Left: "Right", Right: "Left", auto: "Top" };
    const oppWall = opp[doorWall] || "Top";
    return [oppWall, ...nonDoor.filter(w => w !== oppWall)];
  }
  if (cat === "wardrobe" || cat === "bookshelf") return nonDoor;
  if (cat === "study table" || cat === "dressing table") return nonDoor;
  if (cat === "sofa") {
    const opp = { Bottom: "Top", Top: "Bottom", Left: "Right", Right: "Left", auto: "Top" };
    return [opp[doorWall] || "Top", ...nonDoor];
  }
  // chairs, small items - free placement
  return allWalls;
}

function wallCandidates(wall, iw, ih, roomPxW, roomPxH, step) {
  const pts = [];
  if (wall === "Top") {
    for (let x = WALL_OFF; x + iw <= roomPxW - WALL_OFF; x += step)
      pts.push({ x, y: WALL_OFF });
  } else if (wall === "Bottom") {
    for (let x = WALL_OFF; x + iw <= roomPxW - WALL_OFF; x += step)
      pts.push({ x, y: roomPxH - WALL_OFF - ih });
  } else if (wall === "Left") {
    for (let y = WALL_OFF; y + ih <= roomPxH - WALL_OFF; y += step)
      pts.push({ x: WALL_OFF, y });
  } else {
    for (let y = WALL_OFF; y + ih <= roomPxH - WALL_OFF; y += step)
      pts.push({ x: roomPxW - WALL_OFF - iw, y });
  }
  return pts;
}

function roomScanCandidates(iw, ih, roomPxW, roomPxH, step) {
  const pts = [];
  for (let y = WALL_OFF; y + ih <= roomPxH - WALL_OFF; y += step)
    for (let x = WALL_OFF; x + iw <= roomPxW - WALL_OFF; x += step)
      pts.push({ x, y });
  return pts;
}

    isFiniteNum(room.width) &&
    room.length > 0 &&

// Core smart placement engine - returns { item, x, y, w, h } entries in px.
function placeItems(items, roomPxW, roomPxH, scale, doorWall, doorDistPx, doorPx,
                    winWall, winDistPx, winPx, winEnabled, roomType) {
  const placed = [];
  const dSwing = doorSwingRect(doorWall, doorDistPx, doorPx, roomPxW, roomPxH);
  const wClear = winEnabled ? windowClearRect(winWall, winDistPx, winPx, roomPxW, roomPxH) : null;
  const step = 6;

  function canPlace(ax, ay, aw, ah) {
    if (ax < WALL_OFF || ay < WALL_OFF) return false;
    if (ax + aw > roomPxW - WALL_OFF || ay + ah > roomPxH - WALL_OFF) return false;
    if (rectsOverlap(ax, ay, aw, ah, dSwing.x, dSwing.y, dSwing.w, dSwing.h, 0)) return false;
    if (wClear && rectsOverlap(ax, ay, aw, ah, wClear.x, wClear.y, wClear.w, wClear.h, 0)) return false;
    for (const p of placed) {
      if (rectsOverlap(ax, ay, aw, ah, p.x, p.y, p.w, p.h, WALK_CLR)) return false;
    }
    return true;
  }

  function tryOrientation(iw, ih, candidates) {
    for (const c of candidates) {
      if (canPlace(c.x, c.y, iw, ih)) return { x: c.x, y: c.y, w: iw, h: ih };
    }
    return null;
  }

  function tryItem(item) {
    const iw = toNum(item.length) * scale;
    const ih = toNum(item.width) * scale;
    const walls = preferredWalls(item.category, doorWall, roomType);

    for (const wall of walls) {
      const cands = wallCandidates(wall, iw, ih, roomPxW, roomPxH, step);
      const r = tryOrientation(iw, ih, cands);
      if (r) return { item, ...r };
      // rotated
      const cands2 = wallCandidates(wall, ih, iw, roomPxW, roomPxH, step);
      const r2 = tryOrientation(ih, iw, cands2);
      if (r2) return { item, ...r2 };
    }

    const scan = roomScanCandidates(iw, ih, roomPxW, roomPxH, step);
    const r3 = tryOrientation(iw, ih, scan);
    if (r3) return { item, ...r3 };
    const scan2 = roomScanCandidates(ih, iw, roomPxW, roomPxH, step);
    const r4 = tryOrientation(ih, iw, scan2);
    if (r4) return { item, ...r4 };

    return null;
  }

  // Sort: largest items first so they claim wall space before smaller ones
  const sorted = items
    .filter(i => i && (isPos(i.length) || isPos(i.width)))
    .sort((a, b) => (toNum(b.length) * toNum(b.width)) - (toNum(a.length) * toNum(a.width)));

  for (const item of sorted) {
    const p = tryItem(item);
    if (p) placed.push(p);
  }
  return placed;
}

    room.width  > 0

// Build the full normalized layout object.
function generateRoomLayout(payload) {
  const rawRoom = payload && payload.room ? payload.room : {};
  const rawExisting = payload && Array.isArray(payload.existing) ? payload.existing : [];
  const rawPlanned = payload && Array.isArray(payload.planned) ? payload.planned : [];
  const rawDoor = payload && payload.door ? payload.door : { enabled: false, wall: "auto", distance: "" };
  const rawWindow = payload && payload.window ? payload.window : { enabled: false, wall: "", distance: "" };

  const room = {
    name: rawRoom.name || "",
    type: rawRoom.type || "Room",
    length: toNum(rawRoom.length),
    width: toNum(rawRoom.width),
  };

  const existing = (rawExisting || []).map(i => ({
    id: i && i.id ? String(i.id) : "",
    name: i && i.name ? String(i.name) : String(i && i.category || "Furniture"),
    category: i && i.category ? String(i.category) : "Other",
    sizeMode: i && i.sizeMode || "standard",
    length: i && i.length ? String(i.length) : "1",
    width:  i && i.width  ? String(i.width)  : "1",
    status: i && i.status === "planned" ? "planned" : "existing",
  }));

  const planned = (rawPlanned || []).map(i => ({
    id: i && i.id ? String(i.id) : "",
    name: i && i.name ? String(i.name) : String(i && i.category || "Furniture"),
    category: i && i.category ? String(i.category) : "Other",
    sizeMode: i && i.sizeMode || "standard",
    length: i && i.length ? String(i.length) : "1",
    width:  i && i.width  ? String(i.width)  : "1",
    status: i && i.status === "planned" ? "planned" : "existing",
  }));

  const door = {
    enabled: Boolean(rawDoor.enabled),
    wall: ["Top", "Bottom", "Left", "Right"].includes(String(rawDoor.wall || "Bottom"))
      ? String(rawDoor.wall)
      : "Bottom",
    distance: String(rawDoor.distance || ""),
  };

  const window = {
    enabled: Boolean(rawWindow.enabled),
    wall: ["Top", "Bottom", "Left", "Right"].includes(String(rawWindow.wall || ""))
      ? String(rawWindow.wall)
      : "Top",
    distance: String(rawWindow.distance || ""),
  };

  const roomFtW = room.length || 10;
  const roomFtH = room.width  || 10;
  const BASE_SCALE = Math.min(480 / roomFtW, 380 / roomFtH, 36);
  const scale = BASE_SCALE;
  const roomPxW = roomFtW * scale;
  const roomPxH = roomFtH * scale;

  const allItems = existing.concat(planned);
  const placed = placeItems(
    allItems, roomPxW, roomPxH, scale,
    door.wall, (parseFloat(door.distance) || 2) * scale, DOOR_FT * scale,
    window.wall, (parseFloat(window.distance) || 3) * scale, 3.5 * scale,
    window.enabled, room.type
  );

  // Determine unplaced items + warnings
  const unplaced = [];
  const warnings = [];

  for (const item of allItems) {
    const iw = toNum(item.length) * scale;
    const ih = toNum(item.width) * scale;
    // quick rejection: exceeds room bounds even before carry-on checks
    if (iw > roomPxW - WALL_OFF * 2 || ih > roomPxH - WALL_OFF * 2) {
      unplaced.push({ item });
      warnings.push(item.name || item.category + " (" + (toNum(item.length) || 1).toFixed(1) + "x" + (toNum(item.width) || 1).toFixed(1) + " ft) is too large for this room at the current scale.");
      continue;
    }
    const hit = placed.some(p => p.item.id === item.id);
    if (!hit) unplaced.push({ item });
  }

  if (unplaced.length === 0 && allItems.length > 0) {
    // every item placed - nothing to do
  }

  if (door.enabled && door.wall) {
    // no warning by default - door handled in the SVG
  }
  if (!window.enabled) {
    // deliberately no window, no warning
  }

  // Room utilization (recompute exactly as the canvas does)
  const usedArea = placed.reduce((s, p) => s + (p.w / scale) * (p.h / scale), 0);
  const utilization = Math.min(99, Math.round((usedArea / (roomFtW * roomFtH)) * 100));
  const walkSqFt = Math.max(0, roomFtW * roomFtH - usedArea);

  if (walkSqFt < 8 && allItems.length > 0) {
    warnings.push("Walking space is tight (" + walkSqFt.toFixed(1) + " sq ft). Consider wider aisles or smaller pieces.");
  }
  if (utilization > 85) {
    warnings.push("Room is over 85% utilized (" + utilization + "%). Leave clear circulation space.");
  }
  if (utilization > 92) {
    warnings.push("Severely over-utilized (" + utilization + "%). The plan is not buildable as-is.");
  }

  return {
    room,
    door,
    window,
    roomPxW,
    roomPxH,
    scale,
    placed,
    unplaced,
    warnings,
    utilization,
    walkSqFt,
  };
}

module.exports = { generateRoomLayout, placeItems, doorSwingRect, windowClearRect, rectsOverlap };
