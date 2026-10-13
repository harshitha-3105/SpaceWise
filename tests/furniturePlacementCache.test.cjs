const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/utils/furniturePlacement.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const placementModule = { exports: {} };
new Function("exports", "require", "module", compiled)(placementModule.exports, require, placementModule);
const { calculateFurniturePlacement } = placementModule.exports;

const sofa = { id: "sofa", name: "Sofa", category: "sofa", length: "7", width: "3", status: "existing" };
const diningTable = { id: "dining-table", name: "Dining table", category: "dining table", length: "5", width: "3", status: "planned" };
const fullBedroomFurniture = [
  { id: "queen-bed", name: "Queen Bed", category: "bed", length: "6.5", width: "5", status: "existing" },
  { id: "wardrobe", name: "Wardrobe", category: "wardrobe", length: "4", width: "2", status: "existing" },
  { id: "dressing-table", name: "Dressing Table", category: "dressing table", length: "3", width: "1.5", status: "existing" },
  { id: "study-table", name: "Study Table", category: "study table", length: "3.5", width: "2", status: "planned" },
  { id: "bookshelf", name: "Bookshelf", category: "bookshelf", length: "3", width: "1", status: "planned" },
  { ...sofa, status: "planned" },
  diningTable,
];

function roomPlan(generatedLayout) {
  return {
    room: { name: "Master bedroom", type: "Master bedroom", length: "12", width: "10" },
    existing: [sofa],
    planned: [diningTable],
    door: { enabled: true, wall: "Bottom", distance: "0.5", width: 3, swingDirection: "inward", hinge: "start", autoPlaced: true },
    window: { enabled: false, wall: "", distance: "" },
    generatedLayout,
  };
}

test("version-3 partial cache triggers the current search for all furniture", () => {
  const result = calculateFurniturePlacement(roomPlan({
    placementVersion: 3,
    placed: [{ itemId: sofa.id, x: 18, y: 11, width: 252, height: 108, rotation: 0 }],
    unplaced: [{ itemId: diningTable.id, reason: "stale prior search result" }],
  }));

  assert.deepEqual(result.unplacedItems, []);
  assert.deepEqual(new Set(result.placed.map(({ item }) => item.id)), new Set([sofa.id, diningTable.id]));
  assert.equal(result.checks.collisions.passed, true);
  assert.equal(result.checks.boundaries.passed, true);
  assert.equal(result.checks.doorSwing.passed, true);
  assert.equal(result.checks.walkingRoutes.passed, true);
});

test("complete version-3 cache remains reusable", () => {
  const cachedSofa = { itemId: sofa.id, x: 313, y: 11, width: 108, height: 252, rotation: 90 };
  const cachedDiningTable = { itemId: diningTable.id, x: 18, y: 11, width: 180, height: 108, rotation: 0 };
  const result = calculateFurniturePlacement(roomPlan({
    placementVersion: 3,
    placed: [cachedSofa, cachedDiningTable],
    unplaced: [],
  }));

  assert.deepEqual(result.unplacedItems, []);
  assert.deepEqual(result.placed.map(({ item, x, y, rotation }) => ({ itemId: item.id, x, y, rotation })), [
    { itemId: sofa.id, x: cachedSofa.x, y: cachedSofa.y, rotation: 90 },
    { itemId: diningTable.id, x: cachedDiningTable.x, y: cachedDiningTable.y, rotation: 0 },
  ]);
  assert.equal(result.checks.collisions.passed, true);
  assert.equal(result.checks.boundaries.passed, true);
  assert.equal(result.checks.doorSwing.passed, true);
  assert.equal(result.checks.walkingRoutes.passed, true);
});

test("the previous sofa and dining-table-only bedroom case still places both", () => {
  const result = calculateFurniturePlacement(roomPlan(null));
  assert.deepEqual(new Set(result.placed.map(({ item }) => item.id)), new Set([sofa.id, diningTable.id]));
  assert.deepEqual(result.unplacedItems, []);
  assert.equal(result.checks.collisions.passed, true);
  assert.equal(result.checks.boundaries.passed, true);
  assert.equal(result.checks.doorSwing.passed, true);
  assert.equal(result.checks.walkingRoutes.passed, true);
});

test("complete 12 by 10 master bedroom inputs reproduce the five placed and two unplaced result", () => {
  const input = {
    room: { name: "Master bedroom", type: "Master bedroom", length: "12", width: "10" },
    existing: fullBedroomFurniture.filter((item) => item.status === "existing"),
    planned: fullBedroomFurniture.filter((item) => item.status === "planned"),
    door: { enabled: false, wall: "", distance: "", width: 3 },
    window: { enabled: false, wall: "", distance: "" },
    // Models the saved version-3 partial result from the report. It must be
    // discarded and freshly searched because two furniture IDs are unplaced.
    generatedLayout: {
      placementVersion: 3,
      placed: [
        { itemId: "queen-bed", x: 241, y: 11, width: 180, height: 234, rotation: 90 },
        { itemId: "wardrobe", x: 11, y: 11, width: 72, height: 144, rotation: 90 },
        { itemId: "study-table", x: 151, y: 65, width: 72, height: 126, rotation: 90 },
        { itemId: "bookshelf", x: 101, y: 11, width: 108, height: 36, rotation: 0 },
        { itemId: "dressing-table", x: 11, y: 173, width: 108, height: 54, rotation: 0 },
      ],
      unplaced: [
        { itemId: "sofa", reason: "stale partial search result" },
        { itemId: "dining-table", reason: "stale partial search result" },
      ],
    },
  };
  const result = calculateFurniturePlacement(input);
  assert.equal(result.placed.length, 5);
  assert.deepEqual(new Set(result.placed.map(({ item }) => item.id)), new Set([
    "queen-bed", "wardrobe", "dressing-table", "study-table", "bookshelf",
  ]));
  assert.deepEqual(new Set(result.unplacedItems.map(({ id }) => id)), new Set(["sofa", "dining-table"]));
  assert.equal(result.furnitureAreaSqFt, 55);
  assert.equal(result.unplacedFurnitureAreaSqFt, 36);
  assert.equal(result.door?.autoPlaced, true);
  assert.equal(result.checks.collisions.passed, true);
  assert.equal(result.checks.boundaries.passed, true);
  assert.equal(result.checks.doorSwing.passed, true);
  assert.equal(result.checks.entranceAccess.passed, true);
  assert.equal(result.checks.walkingRoutes.passed, true);
  assert.match(result.unplacedReasons.get("sofa"), /bounded multi-order search/);
  assert.match(result.unplacedReasons.get("dining-table"), /bounded multi-order search/);
});
