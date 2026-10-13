export interface FurnitureItem {
  id: string; name: string; category: string;
  length: string; width: string; status: "existing" | "planned";
}
export interface RoomData {
  room: { name: string; type: string; length: string; width: string };
  existing: FurnitureItem[];
  planned: FurnitureItem[];
  door: { enabled: boolean; wall: string; distance: string; width?: number; swingDirection?: "inward"; hinge?: "start"; autoPlaced?: boolean; warning?: string };
  window: { enabled: boolean; wall: string; distance: string };
  generatedLayout?: unknown;
}
export interface DoorGeometry {
  enabled: true;
  wall: "Top" | "Bottom" | "Left" | "Right";
  distance: string;
  width: number;
  swingDirection: "inward";
  hinge: "start";
  autoPlaced: boolean;
}
export interface PlacedItem {
  item: FurnitureItem; x: number; y: number; w: number; h: number; rotation: 0 | 90;
}
export interface FurniturePlacement {
  placed: PlacedItem[];
  placedItems: Set<FurnitureItem>;
  unplacedItems: FurnitureItem[];
  unplacedReasons: Map<string, string>;
  criticalObstructionItemIds: string[];
  roomKnown: boolean;
  door: DoorGeometry | null;
  doorWarning: string | null;
  checks: {
    collisions: { evaluated: true; passed: boolean };
    boundaries: { evaluated: boolean; passed: boolean };
    doorSwing: { evaluated: boolean; passed: boolean } | null;
    entranceAccess: { evaluated: boolean; passed: boolean } | null;
    walkingRoutes: { evaluated: boolean; passed: boolean };
    windows: { evaluated: boolean; passed: boolean } | null;
  };
  roomAreaSqFt: number | null;
  furnitureAreaSqFt: number;
  unplacedFurnitureAreaSqFt: number;
  utilizationPct: number | null;
  walkingAreaSqFt: number | null;
}
export const WALL_T   = 7;   // wall thickness px
const WALK_CLR = 18;  // minimum walking clearance px between items
const WALL_OFF = WALL_T + 4; // offset from inner wall face
export const DEFAULT_DOOR_WIDTH_FT = 3;
export const DEFAULT_WALKING_WIDTH_FT = 2;
const DEFAULT_WINDOW_WIDTH_FT = 3.5;

type Rect = { x: number; y: number; w: number; h: number };
type Candidate = { x: number; y: number; w: number; h: number; rotation: 0 | 90; wallRank: number };
type DoorSwing = { wall: string; distance: number; width: number; roomW: number; roomH: number };

function validPositive(value: string | number | undefined): number | null {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validNonNegative(value: string | number | undefined): number | null {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Resolve a saved door or choose a deterministic, wall-fitting entrance near a corner. */
export function resolveDoorGeometry(
  room: RoomData["room"],
  requested: RoomData["door"] | undefined,
  window: RoomData["window"] | undefined
): { door: DoorGeometry | null; warning: string | null } {
  const roomLength = validPositive(room?.length);
  const roomWidth = validPositive(room?.width);
  if (!roomLength || !roomWidth) return { door: null, warning: "A door could not be positioned because the room dimensions are missing or invalid." };

  const wallLength = (wall: string) => wall === "Top" || wall === "Bottom" ? roomLength : roomWidth;
  const windowWall = window?.wall;
  const windowStart = window?.enabled ? validNonNegative(window.distance) : null;
  const windowSpan = window?.enabled && ["Top", "Bottom", "Left", "Right"].includes(windowWall ?? "")
    ? wallLength(windowWall!) : 0;
  const windowValid = Boolean(window?.enabled && windowStart !== null && windowStart + DEFAULT_WINDOW_WIDTH_FT <= windowSpan);
  const width = validPositive(requested?.width) ?? DEFAULT_DOOR_WIDTH_FT;

  const overlapsWindow = (wall: string, start: number, doorWidth: number) => {
    if (!window?.enabled) return false;
    // If an enabled window has invalid dimensions, keep the doorway off its stated wall.
    if (!windowValid) return wall === windowWall;
    if (wall !== windowWall) return false;
    const gap = 0.25;
    return start < windowStart! + DEFAULT_WINDOW_WIDTH_FT + gap && start + doorWidth + gap > windowStart!;
  };
  const makeDoor = (wall: string, distance: number, autoPlaced: boolean): DoorGeometry => ({
    enabled: true,
    wall: wall as DoorGeometry["wall"],
    distance: String(Number(distance.toFixed(2))),
    width,
    swingDirection: "inward",
    hinge: "start",
    autoPlaced,
  });

  const requestedDistance = validNonNegative(requested?.distance);
  if (requested?.enabled && ["Top", "Bottom", "Left", "Right"].includes(requested.wall) && requestedDistance !== null &&
      requestedDistance + width <= wallLength(requested.wall) && !overlapsWindow(requested.wall, requestedDistance, width)) {
    return { door: makeDoor(requested.wall, requestedDistance, Boolean(requested.autoPlaced)), warning: null };
  }

  const walls: DoorGeometry["wall"][] = ["Bottom", "Left", "Top", "Right"];
  // Prefer walls away from a window, while retaining deterministic corner-first selection.
  walls.sort((a, b) => Number(b === windowWall) - Number(a === windowWall));
  for (const wall of walls) {
    const maxStart = wallLength(wall) - width;
    if (maxStart < 0) continue;
    const cornerMargin = Math.min(0.5, maxStart / 2);
    const offsets = new Set<number>();
    for (let d = cornerMargin; d <= maxStart - cornerMargin + 1e-9; d += 0.5) offsets.add(Number(d.toFixed(2)));
    offsets.add(cornerMargin);
    offsets.add(maxStart - cornerMargin);
    if (windowValid && wall === windowWall) {
      offsets.add(Number((windowStart! - width - 0.25).toFixed(2)));
      offsets.add(Number((windowStart! + DEFAULT_WINDOW_WIDTH_FT + 0.25).toFixed(2)));
    }
    const candidates = [...offsets].filter(d => d >= cornerMargin && d <= maxStart - cornerMargin && !overlapsWindow(wall, d, width))
      .sort((a, b) => Math.min(a, maxStart - a) - Math.min(b, maxStart - b) || a - b);
    if (candidates.length) return { door: makeDoor(wall, candidates[0], true), warning: null };
  }
  return { door: null, warning: `No ${width} ft entrance door can fit along the room walls without overlapping the configured window.` };
}

function polygonsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  const points = (r: Rect) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    // The only supported rotation is 90°. Its actual rectangle footprint is stored with swapped axes.
    const angle = 0;
    const c = Math.cos(angle), s = Math.sin(angle);
    return [[-r.w/2,-r.h/2],[r.w/2,-r.h/2],[r.w/2,r.h/2],[-r.w/2,r.h/2]].map(([x,y]) => [cx+x*c-y*s, cy+x*s+y*c]);
  };
  const ap = points(a), bp = points(b);
  const axes: number[][] = [];
  for (const poly of [ap, bp]) for (let i=0;i<4;i++) {
    const p=poly[i], q=poly[(i+1)%4], dx=q[0]-p[0], dy=q[1]-p[1];
    axes.push([-dy,dx]);
  }
  for (const [ax,ay] of axes) {
    const len = Math.hypot(ax,ay) || 1, nx=ax/len, ny=ay/len;
    const pa=ap.map(([x,y])=>x*nx+y*ny), pb=bp.map(([x,y])=>x*nx+y*ny);
    if (Math.max(...pa)+gap <= Math.min(...pb) || Math.max(...pb)+gap <= Math.min(...pa)) return false;
  }
  return true;
}

/** Door leaf sweeps a quarter-circle. Collision adds the configured walkway buffer to its radius. */
function intersectsDoorSwing(item: Rect, door: DoorSwing): boolean {
  const radius = door.width + WALK_CLR;
  let x1: number, y1: number, x2: number, y2: number;
  if (door.wall === "Top") {
    x1 = Math.max(item.x, door.distance); y1 = Math.max(item.y, 0);
    x2 = item.x + item.w; y2 = item.y + item.h;
  } else if (door.wall === "Bottom") {
    x1 = Math.max(item.x, door.distance); y1 = item.y;
    x2 = item.x + item.w; y2 = Math.min(item.y + item.h, door.roomH);
  } else if (door.wall === "Left") {
    x1 = Math.max(item.x, 0); y1 = Math.max(item.y, door.distance);
    x2 = item.x + item.w; y2 = item.y + item.h;
  } else {
    x1 = item.x; y1 = Math.max(item.y, door.distance);
    x2 = Math.min(item.x + item.w, door.roomW); y2 = item.y + item.h;
  }
  if (x1 > x2 || y1 > y2) return false;
  const hingeX = door.wall === "Left" ? 0 : door.wall === "Right" ? door.roomW : door.distance;
  const hingeY = door.wall === "Top" ? 0 : door.wall === "Bottom" ? door.roomH : door.distance;
  const closestX = Math.max(x1, Math.min(hingeX, x2));
  const closestY = Math.max(y1, Math.min(hingeY, y2));
  return (closestX - hingeX) ** 2 + (closestY - hingeY) ** 2 < radius ** 2;
}

/** Returns window keep-clear rect */
function windowClearRect(
  wall: string, distPx: number, winPx: number, roomPxW: number, roomPxH: number
): { x: number; y: number; w: number; h: number } {
  const clr = winPx + 10;
  if (wall === "Top")    return { x: distPx, y: 0, w: winPx, h: clr };
  if (wall === "Bottom") return { x: distPx, y: roomPxH - clr, w: winPx, h: clr };
  if (wall === "Left")   return { x: 0, y: distPx, w: clr, h: winPx };
  /* Right */            return { x: roomPxW - clr, y: distPx, w: clr, h: winPx };
}

/** Wall-zone candidates: returns candidate (x,y) positions along a wall */
function wallCandidates(
  wall: "Top" | "Bottom" | "Left" | "Right",
  iw: number, ih: number,
  roomPxW: number, roomPxH: number,
  step: number
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
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

/** Full-room scan fallback */
function roomScanCandidates(
  iw: number, ih: number, roomPxW: number, roomPxH: number, step: number
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let y = WALL_OFF; y + ih <= roomPxH - WALL_OFF; y += step)
    for (let x = WALL_OFF; x + iw <= roomPxW - WALL_OFF; x += step)
      pts.push({ x, y });
  return pts;
}

function readSavedPlacement(
  data: RoomData,
  items: FurnitureItem[],
  scale: number,
  roomW: number,
  roomH: number,
  door: DoorSwing | null,
  window: Rect | null
): PlacedItem[] | null {
  const saved=data.generatedLayout;
  if(!saved||typeof saved!=="object"||(saved as {placementVersion?:unknown}).placementVersion!==2)return null;
  const placedRaw=(saved as {placed?:unknown}).placed;
  const unplacedRaw=(saved as {unplaced?:unknown}).unplaced;
  if(!Array.isArray(placedRaw)||!Array.isArray(unplacedRaw))return null;
  const byId=new Map(items.map(item=>[item.id,item]));
  const seen=new Set<string>();
  const placed:PlacedItem[]=[];
  for(const raw of placedRaw){
    if(!raw||typeof raw!=="object")return null;
    const entry=raw as {itemId?:unknown;x?:unknown;y?:unknown;width?:unknown;height?:unknown;rotation?:unknown};
    if(typeof entry.itemId!=="string"||seen.has(entry.itemId))return null;
    const item=byId.get(entry.itemId),x=entry.x,y=entry.y,w=entry.width,h=entry.height;
    if(!item||![x,y,w,h].every(value=>typeof value==="number"&&Number.isFinite(value))||Number(w)<=0||Number(h)<=0)return null;
    const length=validPositive(item.length)!*scale,itemWidth=validPositive(item.width)!*scale;
    const rotation=entry.rotation===90?90:entry.rotation===0?0:Math.abs(Number(w)-length)<0.1?0:90;
    const expectedW=rotation===0?length:itemWidth,expectedH=rotation===0?itemWidth:length;
    if(Math.abs(Number(w)-expectedW)>0.1||Math.abs(Number(h)-expectedH)>0.1)return null;
    const rect={x:Number(x),y:Number(y),w:Number(w),h:Number(h)};
    if(rect.x<WALL_OFF||rect.y<WALL_OFF||rect.x+rect.w>roomW-WALL_OFF||rect.y+rect.h>roomH-WALL_OFF||
      (door&&intersectsDoorSwing(rect,door))||(window&&polygonsOverlap(rect,window))||placed.some(other=>polygonsOverlap(rect,other,WALK_CLR)))return null;
    seen.add(entry.itemId);
    placed.push({item,x:rect.x,y:rect.y,w:rect.w,h:rect.h,rotation});
  }
  for(const raw of unplacedRaw){
    if(!raw||typeof raw!=="object")return null;
    const itemId=(raw as {itemId?:unknown}).itemId;
    if(typeof itemId!=="string"||!byId.has(itemId)||seen.has(itemId))return null;
    seen.add(itemId);
  }
  return seen.size===items.length?placed:null;
}

/** Category → preferred walls (ordered) */
function preferredWalls(
  category: string,
  doorWall: string,
  roomType: string,
  windowWall: string
): Array<"Top" | "Bottom" | "Left" | "Right"> {
  const cat = category.trim().toLowerCase();
  const type = roomType.trim().toLowerCase();
  const allWalls: Array<"Top" | "Bottom" | "Left" | "Right"> = ["Top", "Bottom", "Left", "Right"];
  // walls that are NOT the door wall
  const nonDoor = allWalls.filter(w => w !== doorWall) as Array<"Top" | "Bottom" | "Left" | "Right">;

  if (cat === "bed") {
    // bed prefers the wall opposite the door
    const opp: Record<string, "Top" | "Bottom" | "Left" | "Right"> = {
      Bottom: "Top", Top: "Bottom", Left: "Right", Right: "Left", auto: "Top"
    };
    const oppWall = opp[doorWall] || "Top";
    return [oppWall, ...nonDoor.filter(w => w !== oppWall)];
  }
  if (cat === "wardrobe" || cat === "bookshelf") return nonDoor;
  if (cat === "study table" || cat === "dressing table" || cat === "desk") {
    const windowFirst: Array<typeof allWalls[number]> = type.includes("study") && allWalls.includes(windowWall as typeof allWalls[number]) ? [windowWall as typeof allWalls[number]] : [];
    return [...windowFirst, ...nonDoor.filter(w => !windowFirst.includes(w))];
  }
  if (cat === "sofa") {
    const opp: Record<string, "Top" | "Bottom" | "Left" | "Right"> = {
      Bottom: "Top", Top: "Bottom", Left: "Right", Right: "Left", auto: "Top"
    };
    return [opp[doorWall] || "Top", ...nonDoor];
  }
  if (cat === "dining table") return nonDoor;
  // chairs, small items — free placement
  return allWalls;
}

function furnitureKind(item:FurnitureItem):string{
  const category=item.category.trim().toLowerCase();
  return category&&category!=="other"?category:item.name.trim().toLowerCase();
}

function isBedsideTable(item:FurnitureItem):boolean{
  const kind=furnitureKind(item);
  return ["bedside table","nightstand","night stand","night table","side table"].some(name=>kind.includes(name));
}

function furniturePriority(item: FurnitureItem, roomType: string): number {
  const type = roomType.trim().toLowerCase();
  const category = furnitureKind(item);
  const bedroom = type.includes("bedroom") || type === "bed";
  const living = type.includes("living");
  const study = type.includes("study");
  const dining = type.includes("dining");
  const bedside = isBedsideTable(item);
  const desk = ["study table", "desk"].includes(category);
  if (bedroom) {
    if (category === "bed") return 0;
    if (category === "wardrobe") return 1;
    if (bedside) return 2;
    if (desk) return 3;
    if (category === "bookshelf") return 4;
    return 5;
  }
  if (living) {
    if (category === "sofa") return 0;
    if (category === "tv") return 1;
    if (bedside) return 2;
    if (category === "bookshelf") return 3;
    if (category === "chair") return 4;
    return 5;
  }
  if (study) {
    if (desk) return 0;
    if (category === "chair") return 1;
    if (category === "bookshelf") return 2;
    return 3;
  }
  if (dining) {
    if (category === "dining table") return 0;
    if (category === "chair") return 1;
    return 2;
  }
  return 0;
}

function primaryFurnitureCategory(roomType: string): string[] {
  const type = roomType.trim().toLowerCase();
  if (type.includes("bedroom")) return ["bed"];
  if (type.includes("living")) return ["sofa"];
  if (type.includes("study")) return ["study table", "desk"];
  if (type.includes("dining")) return ["dining table"];
  return [];
}

export function placeItems(
  items: FurnitureItem[],
  roomPxW: number,
  roomPxH: number,
  scale: number,
  doorWall: string,
  doorDistPx: number,
  doorPx: number,
  winWall: string,
  winDistPx: number,
  winPx: number,
  winEnabled: boolean,
  roomType: string
): PlacedItem[] {
  const dSwing: DoorSwing | null = doorPx > 0 ? { wall: doorWall, distance: doorDistPx, width: doorPx, roomW: roomPxW, roomH: roomPxH } : null;
  const wClear = winEnabled ? windowClearRect(winWall, winDistPx, winPx, roomPxW, roomPxH) : null;
  const step = Math.max(4, Math.round(scale * 0.2));
  const priorityOrder = items.filter(i=>validPositive(i.length)!==null&&validPositive(i.width)!==null)
    .sort((a,b) => furniturePriority(a,roomType)-furniturePriority(b,roomType) ||
      Number(b.status === "existing")-Number(a.status === "existing") ||
      (validPositive(b.length)??0)*(validPositive(b.width)??0)-(validPositive(a.length)??0)*(validPositive(a.width)??0));
  const orders = [priorityOrder,
    [...priorityOrder].sort((a,b) => furniturePriority(a,roomType)-furniturePriority(b,roomType) || validPositive(a.length)!-validPositive(b.length)!),
    [...priorityOrder].sort((a,b) => furniturePriority(a,roomType)-furniturePriority(b,roomType) || validPositive(a.width)!-validPositive(b.width)!)];
  const beamWidth = 32;
  const candidatesPerState = 16;
  type State = { placed: PlacedItem[]; next: number };
  const arrangements: PlacedItem[][] = [];
  const doorEntry = dSwing ? doorEntryPoint(doorWall, doorDistPx, doorPx, roomPxW, roomPxH) : null;
  const routeCache=new Map<string,number>();
  const routeScore=(placed:PlacedItem[])=>{
    if(!doorEntry)return 0;
    const key=placed.map(p=>`${p.item.id}:${Math.round(p.x)},${Math.round(p.y)},${p.rotation}`).sort().join("|");
    const cached=routeCache.get(key);
    if(cached!==undefined)return cached;
    const score=hasWalkingRoute(roomPxW,roomPxH,placed,doorEntry,scale,roomType)?1:0;
    routeCache.set(key,score);
    return score;
  };
  const priorities=[...new Set(priorityOrder.map(item=>furniturePriority(item,roomType)))].sort((a,b)=>a-b);
  const priorityCounts=(placed:PlacedItem[],priority:number)=>placed.filter(p=>furniturePriority(p.item,roomType)===priority).length;
  const wallAlignmentCost=(item:FurnitureItem,p:Rect)=>{
    const walls=preferredWalls(furnitureKind(item),doorWall,roomType,winWall);
    const distances:Record<string,number>={
      Top:Math.max(0,p.y-WALL_OFF), Bottom:Math.max(0,roomPxH-WALL_OFF-(p.y+p.h)),
      Left:Math.max(0,p.x-WALL_OFF), Right:Math.max(0,roomPxW-WALL_OFF-(p.x+p.w)),
    };
    return Math.min(...walls.map((wall,index)=>index*scale*8+distances[wall]));
  };
  const wallAlignmentScore=(placed:PlacedItem[])=>placed.reduce((sum,p)=>sum+wallAlignmentCost(p.item,p),0);
  const relationshipScore=(placed:PlacedItem[])=>{
    const type=roomType.trim().toLowerCase();
    const rectGap=(a:Rect,b:Rect)=>Math.hypot(Math.max(0,a.x-(b.x+b.w),b.x-(a.x+a.w)),Math.max(0,a.y-(b.y+b.h),b.y-(a.y+a.h)));
    let score=0;
    for(const piece of placed){
      let anchors:string[]=[];
      const category=furnitureKind(piece.item);
      if(isBedsideTable(piece.item)&&type.includes("bedroom"))anchors=["bed"];
      else if(category==="chair")anchors=type.includes("living")?["sofa"]:type.includes("study")?["study table","desk"]:type.includes("dining")?["dining table"]:[];
      if(!anchors.length)continue;
      const nearby=placed.filter(other=>anchors.includes(furnitureKind(other.item)));
      score+=nearby.length?Math.min(...nearby.map(other=>rectGap(piece,other))):scale*4;
    }
    return score;
  };
  // Among layouts with the same placement/route validity, reward breathing room
  // between pieces. Cap each pair's contribution so a distant item cannot
  // dominate the score or outweigh the required/planned placement priorities.
  const separationScore=(placed:PlacedItem[])=>{
    let score=0;
    for(let i=0;i<placed.length;i++) for(let j=i+1;j<placed.length;j++){
      const a=placed[i], b=placed[j];
      const dx=Math.max(0,a.x-(b.x+b.w),b.x-(a.x+a.w));
      const dy=Math.max(0,a.y-(b.y+b.h),b.y-(a.y+a.h));
      score+=Math.min(Math.hypot(dx,dy),scale);
    }
    return score;
  };
  const compareStates=(a:State,b:State)=>{
    for(const priority of priorities){const diff=priorityCounts(b.placed,priority)-priorityCounts(a.placed,priority);if(diff)return diff;}
    if(a.placed.length!==b.placed.length)return b.placed.length-a.placed.length;
    const existingA=a.placed.filter(p=>p.item.status==="existing").length, existingB=b.placed.filter(p=>p.item.status==="existing").length;
    if(existingA!==existingB)return existingB-existingA;
    const route=routeScore(b.placed)-routeScore(a.placed);
    if(route)return route;
    const wall=wallAlignmentScore(a.placed)-wallAlignmentScore(b.placed);
    if(Math.abs(wall)>0.01)return wall;
    const relationship=relationshipScore(a.placed)-relationshipScore(b.placed);
    if(Math.abs(relationship)>0.01)return relationship;
    const separation=separationScore(b.placed)-separationScore(a.placed);
    if(Math.abs(separation)>0.01)return separation;
    return a.next-b.next;
  };
  const selectCandidates=(candidates:Candidate[])=>{
    if(candidates.length<=candidatesPerState)return candidates;
    const buckets=new Map<string,Candidate[]>();
    for(const candidate of candidates){
      const wallGroup=Math.floor(candidate.wallRank/(scale*8||1));
      const key=`${wallGroup}:${candidate.rotation}`;
      buckets.set(key,[...(buckets.get(key)??[]),candidate]);
    }
    const selected:Candidate[]=[];
    for(const key of [...buckets.keys()].sort((a,b)=>{
      const [aw,ar]=a.split(":").map(Number),[bw,br]=b.split(":").map(Number);
      return aw-bw||ar-br;
    }))selected.push(buckets.get(key)![0]);
    const remainder=candidates.filter(candidate=>!selected.includes(candidate));
    const slots=Math.min(candidatesPerState-selected.length,remainder.length);
    for(let i=0;i<slots;i++)selected.push(remainder[Math.floor((i+0.5)*remainder.length/slots)]);
    return selected.slice(0,candidatesPerState);
  };
  for (const order of orders) {
    let beam:State[]=[{placed:[],next:0}];
    for (const item of order) {
      const length = validPositive(item.length), width = validPositive(item.width);
      if (!length || !width) continue;
      const dims: Array<{w:number;h:number;rotation:0|90}> = [{w:length*scale,h:width*scale,rotation:0},{w:width*scale,h:length*scale,rotation:90}];
      const walls = preferredWalls(furnitureKind(item), doorWall, roomType, winWall);
      const candidates: Candidate[] = [];
      for (const dim of dims) {
        for (const [wallRank,wall] of walls.entries()) {
          for (const point of wallCandidates(wall,dim.w,dim.h,roomPxW,roomPxH,step)) candidates.push({...point,...dim,wallRank:wallRank*scale*8});
        }
        for (const point of roomScanCandidates(dim.w,dim.h,roomPxW,roomPxH,step)) {
          const distances=[point.y-WALL_OFF,roomPxH-WALL_OFF-(point.y+dim.h),point.x-WALL_OFF,roomPxW-WALL_OFF-(point.x+dim.w)];
          const wallRank=Math.min(...walls.map((wall,index)=>index*scale*8+Math.max(0,distances[["Top","Bottom","Left","Right"].indexOf(wall)])));
          candidates.push({...point,...dim,wallRank});
        }
      }
      candidates.sort((a,b)=>a.wallRank-b.wallRank || a.y-b.y || a.x-b.x || a.rotation-b.rotation);
      const expanded:State[]=[];
      for(const state of beam){
        expanded.push({placed:state.placed,next:state.next+1});
        const adjacent:Candidate[]=[];
        if(isBedsideTable(item)){
          for(const bed of state.placed.filter(p=>furnitureKind(p.item)==="bed"))for(const dim of dims){
            adjacent.push(
              {x:bed.x-dim.w-WALK_CLR,y:bed.y+(bed.h-dim.h)/2,...dim,wallRank:0},
              {x:bed.x+bed.w+WALK_CLR,y:bed.y+(bed.h-dim.h)/2,...dim,wallRank:0},
              {x:bed.x+(bed.w-dim.w)/2,y:bed.y-dim.h-WALK_CLR,...dim,wallRank:0},
              {x:bed.x+(bed.w-dim.w)/2,y:bed.y+bed.h+WALK_CLR,...dim,wallRank:0},
            );
          }
        }
        const allCandidates=[...candidates,...adjacent];
        const valid=allCandidates.filter(c=>c.x>=WALL_OFF&&c.y>=WALL_OFF&&c.x+c.w<=roomPxW-WALL_OFF&&c.y+c.h<=roomPxH-WALL_OFF&&
          !(dSwing&&intersectsDoorSwing(c,dSwing))&&!(wClear&&polygonsOverlap(c,wClear))&&state.placed.every(p=>!polygonsOverlap(c,p,WALK_CLR)));
        const uniqueCandidates=[...new Map(valid.map(c=>[`${c.x},${c.y},${c.w},${c.h}`,c])).values()];
        uniqueCandidates.sort((a,b)=>a.wallRank-b.wallRank||a.y-b.y||a.x-b.x);
        const chosen=selectCandidates(uniqueCandidates);
        for(const candidate of adjacent)if(valid.includes(candidate)&&!chosen.some(c=>c.x===candidate.x&&c.y===candidate.y&&c.w===candidate.w&&c.h===candidate.h)&&chosen.length<candidatesPerState+4)chosen.push(candidate);
        for(const candidate of chosen) expanded.push({placed:[...state.placed,{item,...candidate}],next:state.next+1});
      }
      const unique=new Map<string,State>();
      expanded.sort(compareStates);
      for(const state of expanded){
        const key=state.placed.map(p=>`${p.item.id}:${Math.round(p.x)},${Math.round(p.y)},${p.rotation}`).sort().join("|");
        if(!unique.has(key))unique.set(key,state);
        if(unique.size>=beamWidth)break;
      }
      beam=[...unique.values()];
    }
    arrangements.push(...beam.map(state=>state.placed));
  }
  arrangements.sort((a,b)=>compareStates({placed:a,next:0},{placed:b,next:0}));
  return arrangements[0] ?? [];
}

export function calculateFurniturePlacement(data: RoomData, zoom = 1): FurniturePlacement {
  const roomFtW = validPositive(data.room.length);
  const roomFtH = validPositive(data.room.width);
  const allItems = [...data.existing, ...data.planned];
  const empty = !roomFtW || !roomFtH;
  if (empty) return { placed: [], placedItems: new Set(), unplacedItems: allItems, unplacedReasons: new Map(allItems.map(i=>[i.id,"Room dimensions are missing or invalid; placement cannot be evaluated."])),criticalObstructionItemIds:[],roomKnown:false,
    door:null,doorWarning:"A door could not be positioned because the room dimensions are missing or invalid.",
    checks:{collisions:{evaluated:true,passed:false},boundaries:{evaluated:false,passed:false},doorSwing:null,entranceAccess:null,walkingRoutes:{evaluated:false,passed:false},windows:data.window?.enabled?{evaluated:false,passed:false}:null}, roomAreaSqFt:null, furnitureAreaSqFt:0, unplacedFurnitureAreaSqFt:sumFurnitureArea(allItems), utilizationPct:null, walkingAreaSqFt:null };
  const scale = Math.min(480 / roomFtW, 380 / roomFtH, 36) * zoom;
  const roomPxW = roomFtW * scale;
  const roomPxH = roomFtH * scale;
  const resolvedDoor = resolveDoorGeometry(data.room, data.door, data.window);
  const doorKnown = Boolean(resolvedDoor.door);
  const door = resolvedDoor.door;
  const doorWall = door?.wall ?? "Bottom";
  const doorDistPx = door ? Number.parseFloat(door.distance) * scale : 0;
  const doorPx = door ? door.width * scale : 0;
  const winWall = data.window?.wall ?? "";
  const winStart = data.window?.enabled ? validNonNegative(data.window.distance) : null;
  const winWallLength = winWall === "Top" || winWall === "Bottom" ? roomFtW : roomFtH;
  const windowKnown = Boolean(data.window?.enabled && ["Top","Bottom","Left","Right"].includes(winWall) &&
    winStart !== null && winStart + DEFAULT_WINDOW_WIDTH_FT <= winWallLength);
  const winDistPx = (winStart ?? 3) * scale;
  const winPx = DEFAULT_WINDOW_WIDTH_FT * scale;
  const dSwing: DoorSwing | null=door ? { wall:door.wall,distance:doorDistPx,width:doorPx,roomW:roomPxW,roomH:roomPxH } : null;
  const wClear=windowKnown ? windowClearRect(winWall,winDistPx,winPx,roomPxW,roomPxH) : null;
  const savedPlacement=readSavedPlacement(data,allItems,scale,roomPxW,roomPxH,dSwing,wClear);
  const placed=savedPlacement??placeItems(
    allItems, roomPxW, roomPxH, scale,
    doorWall, doorDistPx, doorPx,
    winWall || "Top", winDistPx, winPx,
    windowKnown,
    data.room.type
  );
  const placedItems = new Set(placed.map(({ item }) => item));
  const unplacedItems = allItems.filter(item => !placedItems.has(item));
  const unplacedReasons = new Map<string, string>();
  const doorEntry=dSwing && door ? doorEntryPoint(door.wall,doorDistPx,doorPx,roomPxW,roomPxH):null;
  const routePass=doorEntry ? hasWalkingRoute(roomPxW,roomPxH,placed,doorEntry,scale,data.room.type):false;
  const destinationCategory=primaryFurnitureCategory(data.room.type)[0];
  const criticalObstructionItemIds=!routePass&&doorEntry?placed.filter(p=>p.item.status==="planned"&&hasWalkingRoute(roomPxW,roomPxH,placed.filter(other=>other.item.id!==p.item.id),doorEntry,scale,data.room.type,destinationCategory)).map(p=>p.item.id):[];
  const collisionsPass=placed.every((a,i)=>placed.slice(i+1).every(b=>!polygonsOverlap(a,b)));
  const boundsPass=placed.every(p=>p.x>=WALL_OFF&&p.y>=WALL_OFF&&p.x+p.w<=roomPxW-WALL_OFF&&p.y+p.h<=roomPxH-WALL_OFF);
  const doorPass=dSwing ? placed.every(p=>!intersectsDoorSwing(p,dSwing)):false;
  const windowPass=wClear ? placed.every(p=>!polygonsOverlap(p,wClear)):false;
  for (const item of unplacedItems) {
    if (!validPositive(item.length) || !validPositive(item.width)) {
      unplacedReasons.set(item.id, "Furniture dimensions are missing or invalid, so a safe fit cannot be checked.");
      continue;
    }
    const withoutOpenings = placeItems([item], roomPxW, roomPxH, scale, "Bottom", 0, 0, "Top", 0, 0, false, data.room.type);
    if (withoutOpenings.length === 0) {
      unplacedReasons.set(item.id, "The item is larger than the usable room area, even after rotation.");
      continue;
    }
    const withOpenings = placeItems([item], roomPxW, roomPxH, scale, doorWall, doorDistPx, doorPx, winWall || "Top", winDistPx, winPx, windowKnown, data.room.type);
    unplacedReasons.set(item.id, withOpenings.length === 0
      ? "The item fits the room by itself, but every candidate position conflicts with the saved door swing or window clearance."
      : "The item fits by itself, but no position was found in this arrangement while preserving furniture spacing and the entrance route. A different arrangement may fit it.");
  }
  const furnitureAreaSqFt=sumFurnitureArea(placed.map(p=>p.item));
  const unplacedFurnitureAreaSqFt=sumFurnitureArea(unplacedItems);
  const roomAreaSqFt=roomFtW*roomFtH;
  return { placed, placedItems, unplacedItems, unplacedReasons,criticalObstructionItemIds,roomKnown:true,
    door,doorWarning:resolvedDoor.warning,
    checks:{collisions:{evaluated:true,passed:collisionsPass},boundaries:{evaluated:true,passed:boundsPass},doorSwing:dSwing?{evaluated:true,passed:doorPass}:null,
      entranceAccess:{evaluated:doorKnown&&placed.length>0,passed:doorKnown&&placed.length>0&&routePass},walkingRoutes:{evaluated:doorKnown&&placed.length>0,passed:doorKnown&&placed.length>0&&routePass},windows:data.window?.enabled?{evaluated:windowKnown,passed:windowKnown&&windowPass}:null},
    roomAreaSqFt,furnitureAreaSqFt,unplacedFurnitureAreaSqFt,utilizationPct:Math.min(100,Math.round(furnitureAreaSqFt/roomAreaSqFt*100)),walkingAreaSqFt:Math.max(0,roomAreaSqFt-furnitureAreaSqFt) };
}

function sumFurnitureArea(items:FurnitureItem[]):number { return items.reduce((sum,item)=>sum+(validPositive(item.length)??0)*(validPositive(item.width)??0),0); }

function doorEntryPoint(wall:string,dist:number,width:number,roomW:number,roomH:number){
  const mid=dist+width/2;
  const penetration=Math.min(width/2+WALK_CLR/2,(wall==="Top"||wall==="Bottom"?roomH:roomW)/2);
  if(wall==="Top") return {x:mid,y:penetration};
  if(wall==="Left") return {x:penetration,y:mid};
  if(wall==="Right") return {x:roomW-penetration,y:mid};
  return {x:mid,y:roomH-penetration};
}

function hasWalkingRoute(roomW:number,roomH:number,placed:PlacedItem[],entry:{x:number;y:number},scale:number,roomType:string,destinationCategory?:string):boolean{
  const halfWidth=DEFAULT_WALKING_WIDTH_FT*scale/2;
  const step=Math.max(2,scale*0.5);
  const minX=WALL_OFF+halfWidth, maxX=roomW-WALL_OFF-halfWidth;
  const minY=WALL_OFF+halfWidth, maxY=roomH-WALL_OFF-halfWidth;
  if(minX>maxX||minY>maxY)return false;
  const cols=Math.floor((maxX-minX)/step)+1, rows=Math.floor((maxY-minY)/step)+1;
  const point=(x:number,y:number)=>({x:minX+x*step,y:minY+y*step});
  const toCell=(x:number,y:number)=>({x:Math.max(0,Math.min(cols-1,Math.round((x-minX)/step))),y:Math.max(0,Math.min(rows-1,Math.round((y-minY)/step)))});
  const walkable=(x:number,y:number)=>{
    const p=point(x,y);
    return placed.every(f=>p.x<=f.x-halfWidth||p.x>=f.x+f.w+halfWidth||p.y<=f.y-halfWidth||p.y>=f.y+f.h+halfWidth);
  };
  const targets=new Set<string>();
  const primaryNames=destinationCategory?[destinationCategory]:primaryFurnitureCategory(roomType);
  const primary=placed.filter(p=>primaryNames.includes(p.item.category.trim().toLowerCase()));
  if(destinationCategory&&!primary.length)return false;
  if(primary.length){
    const offset=halfWidth+step*0.6;
    for(const p of primary){
      const candidates=[
        {x:p.x-offset,y:p.y+p.h/2},{x:p.x+p.w+offset,y:p.y+p.h/2},
        {x:p.x+p.w/2,y:p.y-offset},{x:p.x+p.w/2,y:p.y+p.h+offset},
      ];
      for(const candidate of candidates){if(candidate.x<minX||candidate.x>maxX||candidate.y<minY||candidate.y>maxY)continue;const c=toCell(candidate.x,candidate.y);if(walkable(c.x,c.y))targets.add(`${c.x},${c.y}`);}
    }
    if(!targets.size)return false;
  } else {
    // If the room's focal item is not present, require reaching a genuinely open central area.
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const p=point(x,y);
      if(p.x>=roomW*0.3&&p.x<=roomW*0.7&&p.y>=roomH*0.3&&p.y<=roomH*0.7&&walkable(x,y))targets.add(`${x},${y}`);
    }
    if(!targets.size)return false;
  }
  if(entry.x<minX||entry.x>maxX||entry.y<minY||entry.y>maxY)return false;
  const start=toCell(entry.x,entry.y);
  if(!walkable(start.x,start.y))return false;
  const queue:[number,number][]=[[start.x,start.y]], seen=new Set([`${start.x},${start.y}`]);
  for(let head=0;head<queue.length;head++){
    const [x,y]=queue[head],key=`${x},${y}`;
    if(targets.has(key))return true;
    for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
      const nextKey=`${nx},${ny}`;
      if(nx>=0&&ny>=0&&nx<cols&&ny<rows&&!seen.has(nextKey)&&walkable(nx,ny)){seen.add(nextKey);queue.push([nx,ny]);}
    }
  }
  return false;
}

/* ─────────────────────────────────────────────
   FURNITURE SYMBOLS
   ───────────────────────────────────────────── */
