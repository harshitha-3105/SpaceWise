// geometryChecks.js
// Pure geometry utilities for SpaceWise room layout validation.
// All measurements are in feet. No side effects, no DOM dependencies.

// ─── helpers ────────────────────────────────────────────────────────────────

/** Returns true when value is a finite number (not NaN, not Infinity). */
function isFiniteNum(v) {
  return typeof v === "number" && isFinite(v);
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
    item.width > 0
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

// ─── 1. isInsideRoom ────────────────────────────────────────────────────────

/**
 * Checks whether the entire furniture rectangle lies within the room boundary.
 * item: { x, y, length, width }  — x/y is the top-left corner in feet.
 * room: { length, width }        — room origin is (0, 0).
 * Returns false for any invalid or missing values.
 */
export function isInsideRoom(item, room) {
  if (!isValidItem(item) || !isValidRoom(room)) return false;

  return (
    item.x >= 0 &&
    item.y >= 0 &&
    item.x + item.length <= room.length &&
    item.y + item.width <= room.width
  );
}

// ─── 2. isOverlapping ───────────────────────────────────────────────────────

/**
 * Checks whether two furniture rectangles overlap.
 * Items that only share an edge are NOT considered overlapping.
 * Returns false for invalid input.
 */
export function isOverlapping(itemA, itemB) {
  if (!isValidItem(itemA) || !isValidItem(itemB)) return false;

  // Strict inequality: touching edges → false, actual overlap → true
  return (
    itemA.x < itemB.x + itemB.length &&
    itemA.x + itemA.length > itemB.x &&
    itemA.y < itemB.y + itemB.width &&
    itemA.y + itemA.width > itemB.y
  );
}

// ─── 3. getDistanceBetweenRectangles ────────────────────────────────────────

/**
 * Returns the shortest straight-line distance (in feet) between two
 * non-overlapping rectangles.
 * Returns 0 when the items touch or overlap.
 * Returns 0 for invalid input instead of throwing.
 */
export function getDistanceBetweenRectangles(itemA, itemB) {
  if (!isValidItem(itemA) || !isValidItem(itemB)) return 0;

  // Gap on each axis (negative means overlap on that axis)
  const dx = Math.max(
    0,
    itemB.x - (itemA.x + itemA.length),   // B is to the right of A
    itemA.x - (itemB.x + itemB.length)    // A is to the right of B
  );
  const dy = Math.max(
    0,
    itemB.y - (itemA.y + itemA.width),    // B is below A
    itemA.y - (itemB.y + itemB.width)     // A is below B
  );

  return Math.sqrt(dx * dx + dy * dy);
}

// ─── 4. addClearanceBuffer ──────────────────────────────────────────────────

/**
 * Returns a new rectangle expanded by `buffer` feet on every side.
 * The original item object is not mutated.
 * All other properties on the item are preserved.
 */
export function addClearanceBuffer(item, buffer) {
  if (!isValidItem(item) || !isFiniteNum(buffer)) return { ...item };

  return {
    ...item,
    x: item.x - buffer,
    y: item.y - buffer,
    length: item.length + buffer * 2,
    width: item.width + buffer * 2,
  };
}

// ─── 5. doesBlockDoor ───────────────────────────────────────────────────────

/**
 * Checks whether a furniture item overlaps the clearance zone in front of a door.
 * door: { wall: "top"|"bottom"|"left"|"right", offset, width }
 *   - offset: distance from the room's near corner to the door's start edge (feet)
 *   - width:  door opening width (feet)
 * clearance: how far into the room the keep-clear zone extends (feet).
 * Returns false for invalid or missing door data.
 */
export function doesBlockDoor(item, door, clearance) {
  if (!isValidItem(item)) return false;
  if (
    door == null ||
    !["top", "bottom", "left", "right"].includes(door.wall) ||
    !isFiniteNum(door.offset) ||
    !isFiniteNum(door.width) ||
    !isFiniteNum(clearance)
  ) {
    return false;
  }

  let zone; // { x, y, length, width } of the clearance rectangle

  switch (door.wall) {
    case "top":
      zone = { x: door.offset, y: 0, length: door.width, width: clearance };
      break;
    case "bottom":
      // zone starts at (room bottom - clearance); we don't need room height here
      // because we only check overlap with the item, not room bounds
      zone = { x: door.offset, y: -clearance, length: door.width, width: clearance };
      break;
    case "left":
      zone = { x: 0, y: door.offset, length: clearance, width: door.width };
      break;
    case "right":
      zone = { x: -clearance, y: door.offset, length: clearance, width: door.width };
      break;
    default:
      return false;
  }

  return isOverlapping(item, zone);
}

// ─── 6. doesBlockWindow ─────────────────────────────────────────────────────

/**
 * Checks whether a furniture item overlaps the window zone on a wall.
 * window: { wall: "top"|"bottom"|"left"|"right", offset, width }
 *   - offset: distance from the room's near corner to the window's start edge (feet)
 *   - width:  window opening width (feet)
 * Returns false if no window is provided or data is invalid.
 */
export function doesBlockWindow(item, window) {
  if (!isValidItem(item)) return false;
  if (
    window == null ||
    !["top", "bottom", "left", "right"].includes(window.wall) ||
    !isFiniteNum(window.offset) ||
    !isFiniteNum(window.width)
  ) {
    return false;
  }

  // Window zone is a thin strip (1 ft deep) along the wall face
  const DEPTH = 1;
  let zone;

  switch (window.wall) {
    case "top":
      zone = { x: window.offset, y: 0, length: window.width, width: DEPTH };
      break;
    case "bottom":
      zone = { x: window.offset, y: -DEPTH, length: window.width, width: DEPTH };
      break;
    case "left":
      zone = { x: 0, y: window.offset, length: DEPTH, width: window.width };
      break;
    case "right":
      zone = { x: -DEPTH, y: window.offset, length: DEPTH, width: window.width };
      break;
    default:
      return false;
  }

  return isOverlapping(item, zone);
}

// ─── 7. calculateRoomArea ───────────────────────────────────────────────────

/**
 * Returns the total floor area of the room in square feet.
 * Returns 0 for invalid or missing room values.
 */
export function calculateRoomArea(room) {
  if (!isValidRoom(room)) return 0;
  return room.length * room.width;
}

// ─── 8. calculateFurnitureArea ──────────────────────────────────────────────

/**
 * Returns the combined floor area of all valid furniture items in square feet.
 * Invalid items in the array are silently skipped.
 */
export function calculateFurnitureArea(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    if (!isValidItem(item)) return total;
    return total + item.length * item.width;
  }, 0);
}
