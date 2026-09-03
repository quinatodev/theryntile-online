import assert from "node:assert/strict";
import test from "node:test";

import { type MovementComponent } from "../Components.js";
import { World } from "../World.js";
import { CLIENT_CONFIG } from "../../game/ClientConfig.js";
import {
	applySpriteOffset,
	compareRenderOrder,
	getHighlightDiamond,
	getHighlightFillStyle,
	getHighlightRenderOrder,
	getHorizontalFrameSource,
	getMovementSortingGrid,
	getRenderableRenderOrder,
	getTileFeedbackState,
	getTileVisualPosition,
	isAabbVisible,
	RenderSystem,
	type RenderOrder,
	worldToScreen,
} from "./RenderSystem.js";

test("horizontal source rectangles retain physical Portal and Stag frame dimensions", () => {
	assert.deepEqual(getHorizontalFrameSource(0, 32, 32, 6), { x: 0, y: 0, width: 32, height: 32 });
	assert.deepEqual(getHorizontalFrameSource(5, 32, 32, 6), { x: 160, y: 0, width: 32, height: 32 });
	assert.deepEqual(getHorizontalFrameSource(6, 32, 32, 6), { x: 0, y: 0, width: 32, height: 32 });
	assert.deepEqual(getHorizontalFrameSource(23, 32, 48, 24), { x: 736, y: 0, width: 32, height: 48 });
	assert.deepEqual(getHorizontalFrameSource(10, 32, 48, 11), { x: 320, y: 0, width: 32, height: 48 });
});

interface NamedRenderOrder extends RenderOrder { name: string; }

/**
 * Lang: pt-BR
 * Ordena fixtures nomeadas pela mesma chave pública do renderer para tornar a precedência observável.
 *
 * Lang: en-US
 * Sorts named fixtures through the renderer's public key so precedence remains observable.
 */
const orderedNames = (items: NamedRenderOrder[]) => items.sort(compareRenderOrder).map(({ name }) => name);

test("grid order takes precedence over layer and order", () => {
	const previous = { column: 0, depth: 0, layer: 999, name: "previous", order: 999_999, row: 0, tieBreaker: 1 };
	const next = { column: 0, depth: 1, layer: 0, name: "next", order: -999_999, row: 1, tieBreaker: 2 };
	assert.deepEqual(orderedNames([next, previous]), ["previous", "next"]);
});

test("layer orders drawables only inside the same grid", () => {
	const ground = { column: 0, depth: 0, layer: 0, name: "ground", order: 10, row: 0, tieBreaker: 1 };
	const player = { column: 0, depth: 0, layer: 1, name: "player", order: 0, row: 0, tieBreaker: 2 };
	assert.deepEqual(orderedNames([player, ground]), ["ground", "player"]);
});

test("order breaks ties only inside the same layer of the same grid", () => {
	const first = { column: 0, depth: 0, layer: 1, name: "first", order: 0, row: 0, tieBreaker: 2 };
	const second = { column: 0, depth: 0, layer: 1, name: "second", order: 1, row: 0, tieBreaker: 1 };
	assert.deepEqual(orderedNames([second, first]), ["first", "second"]);
});

test("isometric grids stay grouped before their local layers are sorted", () => {
	/** Lang: pt-BR - Cria uma chave nomeada para observar a ordenação. Lang: en-US - Creates a named key to observe ordering. */
	const item = (row: number, column: number, layer: number, order: number, name: string): NamedRenderOrder => ({
		column, depth: row + column, layer, name, order, row, tieBreaker: 0,
	});
	const shuffled = [
		item(0, 2, 0, 0, "0,2 tile"), item(0, 0, 2, 0, "0,0 top"),
		item(1, 0, 1, 1, "1,0 player"), item(1, 1, 0, 0, "1,1 tile"),
		item(0, 1, 0, 0, "0,1 tile"), item(2, 0, 0, 0, "2,0 tile"),
		item(0, 0, 0, 0, "0,0 tile"), item(1, 0, 0, 0, "1,0 tile"),
	];
	assert.deepEqual(orderedNames(shuffled), [
		"0,0 tile", "0,0 top", "0,1 tile", "1,0 tile", "1,0 player",
		"0,2 tile", "1,1 tile", "2,0 tile",
	]);
});

test("moving players switch sorting grid once at the shared tile boundary in every direction", () => {
	const transitions = [
		{ fromColumn: 2, fromRow: 2, column: 3, row: 2 },
		{ fromColumn: 2, fromRow: 2, column: 1, row: 2 },
		{ fromColumn: 2, fromRow: 2, column: 2, row: 3 },
		{ fromColumn: 2, fromRow: 2, column: 2, row: 1 },
	];
	for (const transition of transitions) {
		const movement: MovementComponent = {
			finalStep: true,
			fromColumn: transition.fromColumn, fromRow: transition.fromRow, progress: 0.499,
			startX: 0, startY: 0, targetColumn: transition.column, targetRow: transition.row, targetX: 0, targetY: 0,
		};
		const gridPosition = { column: transition.fromColumn, row: transition.fromRow };
		assert.deepEqual(getMovementSortingGrid(gridPosition, movement), { column: transition.fromColumn, row: transition.fromRow });
		movement.progress = 0.5;
		assert.deepEqual(getMovementSortingGrid(gridPosition, movement), { column: transition.column, row: transition.row });
		movement.progress = 0.9;
		assert.deepEqual(getMovementSortingGrid(gridPosition, movement), { column: transition.column, row: transition.row });
		assert.deepEqual(gridPosition, { column: transition.fromColumn, row: transition.fromRow });
	}
});

test("moving Player joins the destination grid painter order after midpoint without mutating logical grid", () => {
	const logicalGrid = { row: 0, column: 0 };
	const movement: MovementComponent = {
		finalStep: true, fromRow: 0, fromColumn: 0, progress: 0.9,
		startX: 0, startY: 0, targetRow: 1, targetColumn: 0, targetX: -16, targetY: 8,
	};
	const player = { ...getRenderableRenderOrder(getMovementSortingGrid(logicalGrid, movement), { layer: 1, order: 100 }, 7), name: "player" };
	const destinationTile = { ...getRenderableRenderOrder({ row: 1, column: 0 }, { layer: 1, order: 0 }, 1), name: "destination tile" };
	assert.deepEqual(orderedNames([player, destinationTile]), ["destination tile", "player"]);
	assert.deepEqual(logicalGrid, { row: 0, column: 0 });
});

test("highlight ordering remains local to its Tile grid", () => {
	const earlierHighlight = { ...getHighlightRenderOrder({ column: 0, row: 0 }), name: "highlight" };
	const laterTile = { column: 0, depth: 1, layer: 0, name: "later tile", order: 0, row: 1, tieBreaker: 1 };
	assert.deepEqual(orderedNames([laterTile, earlierHighlight]), ["highlight", "later tile"]);
});

test("Tile and highlight share layer zero while order draws the highlight above the Tile", () => {
	const tile = { column: 2, depth: 3, layer: 0, name: "tile", order: 0, row: 1, tieBreaker: 1 };
	const highlight = { ...getHighlightRenderOrder({ column: 2, row: 1 }), name: "highlight" };
	const player = { column: 2, depth: 3, layer: 2, name: "player", order: 7, row: 1, tieBreaker: 2 };
	assert.equal(highlight.layer, 0);
	assert.ok(tile.order < highlight.order);
	assert.deepEqual(orderedNames([player, highlight, tile]), ["tile", "highlight", "player"]);
});

test("Hover and Selected highlights both use the same local order above the Tile", () => {
	const gridPosition = { column: 3, row: 4 };
	assert.deepEqual(getHighlightRenderOrder(gridPosition), { ...gridPosition, depth: 7, layer: 0, order: 1, tieBreaker: 0 });
});

test("highlight diamond matches the complete visual ground footprint with its 8px vertical offset", () => {
	assert.deepEqual(getHighlightDiamond({ x: 16, y: 24 }), [
		{ x: 16, y: 32 },
		{ x: 32, y: 40 },
		{ x: 16, y: 48 },
		{ x: 0, y: 40 },
	]);
});

test("sprite offsets translate only the final drawing position", () => {
	assert.deepEqual(applySpriteOffset({ x: 100, y: 50 }, { offsetX: 3, offsetY: -4 }), { x: 103, y: 46 });
	assert.deepEqual(applySpriteOffset({ x: 100, y: 50 }, { offsetX: 0, offsetY: 0 }), { x: 100, y: 50 });
});

test("Player priority wins its own layer but never crosses an upper layer", () => {
	const tile = { column: 5, depth: 10, layer: 1, name: "tile", order: 0, row: 5, tieBreaker: 1 };
	const effect = { column: 5, depth: 10, layer: 1, name: "effect", order: 50, row: 5, tieBreaker: 2 };
	const player = { column: 5, depth: 10, layer: 1, name: "player", order: 1_000_000, row: 5, tieBreaker: 7 };
	const upperTile = { column: 5, depth: 10, layer: 2, name: "upper tile", order: 0, row: 5, tieBreaker: 1 };
	assert.deepEqual(orderedNames([upperTile, player, effect, tile]), ["tile", "effect", "player", "upper tile"]);
});

test("multiple Players use their IDs as deterministic tie-break after normal layer drawables", () => {
	const tile = { column: 1, depth: 2, layer: 1, name: "tile", order: 999, row: 1, tieBreaker: 99 };
	const first = { column: 1, depth: 2, layer: 1, name: "player 2", order: 1_000_000, row: 1, tieBreaker: 2 };
	const second = { column: 1, depth: 2, layer: 1, name: "player 9", order: 1_000_000, row: 1, tieBreaker: 9 };
	assert.deepEqual(orderedNames([second, tile, first]), ["tile", "player 2", "player 9"]);
	assert.deepEqual(orderedNames([first, tile, second]), ["tile", "player 2", "player 9"]);
});

test("explicit tie-break orders drawables that share every previous render key", () => {
	const first = { column: 2, depth: 4, layer: 1, name: "first", order: 3, row: 2, tieBreaker: 10 };
	const second = { ...first, name: "second", tieBreaker: 20 };
	assert.deepEqual(orderedNames([second, first]), ["first", "second"]);
});

test("Tile layer height moves each visual origin upward by 8px", () => {
	assert.deepEqual(getTileVisualPosition({ column: 2, row: 2 }, 0), { x: 0, y: 32 });
	assert.deepEqual(getTileVisualPosition({ column: 2, row: 2 }, 1), { x: 0, y: 24 });
	assert.deepEqual(getTileVisualPosition({ column: 2, row: 2 }, 2), { x: 0, y: 16 });
});

test("viewport culling keeps inside, partial, and touching AABBs", () => {
	const margin = CLIENT_CONFIG.culling.marginPixels;
	assert.equal(isAabbVisible({ maxX: 20, maxY: 20, minX: 10, minY: 10 }, 100, 80), true);
	assert.equal(isAabbVisible({ maxX: 5, maxY: 20, minX: -5, minY: 10 }, 100, 80), true);
	assert.equal(isAabbVisible({ maxX: -margin, maxY: 20, minX: -10, minY: 10 }, 100, 80), true);
	assert.equal(isAabbVisible({ maxX: 110, maxY: 20, minX: 100 + margin, minY: 10 }, 100, 80), true);
});

test("viewport culling rejects AABBs fully outside each edge", () => {
	const outside = CLIENT_CONFIG.culling.marginPixels + 1;
	assert.equal(isAabbVisible({ maxX: -outside, maxY: 20, minX: -10, minY: 10 }, 100, 80), false);
	assert.equal(isAabbVisible({ maxX: 111, maxY: 20, minX: 100 + outside, minY: 10 }, 100, 80), false);
	assert.equal(isAabbVisible({ maxX: 20, maxY: -outside, minX: 10, minY: -10 }, 100, 80), false);
	assert.equal(isAabbVisible({ maxX: 20, maxY: 91, minX: 10, minY: 80 + outside }, 100, 80), false);
});

test("highlight fill styles come from client interaction configuration", () => {
	assert.equal(getHighlightFillStyle("selected", 0, 1), CLIENT_CONFIG.interaction.selectedColor);
	assert.equal(getHighlightFillStyle("invalid", 0, 1), CLIENT_CONFIG.interaction.invalidHoverColor);
	assert.equal(getHighlightFillStyle("hovered", 0, 1), CLIENT_CONFIG.interaction.hoverColor);
	assert.equal(getHighlightFillStyle("path", 0, 1), CLIENT_CONFIG.interaction.pathPreviewColor);
	assert.equal(getHighlightFillStyle("hinted", 0, 1), `rgba(${CLIENT_CONFIG.interaction.hintColor}, 0.33)`);
});

test("highlight renderer fills the Tile overlay without drawing an outline", () => {
	let fills = 0;
	let strokes = 0;
	const context = {
		beginPath() {}, clearRect() {}, closePath() {}, drawImage() {}, fill() { fills += 1; }, fillStyle: "", imageSmoothingEnabled: true,
		lineTo() {}, moveTo() {}, restore() {}, save() {}, stroke() { strokes += 1; },
	} as unknown as CanvasRenderingContext2D;
	const renderer = Reflect.construct(RenderSystem, [{ context, element: { height: 80, width: 100 } }, new Map([[1, { naturalHeight: 16 }]]), new Map()]) as RenderSystem;
	const world = new World();
	const tile = world.createEntity();
	world.tiles.set(tile, { textureId: 1 });
	world.gridPositions.set(tile, { column: 0, row: 0 });
	world.renderables.set(tile, { layer: 0, order: 0 });
	world.hoveredTiles.add(tile);
	renderer.render(world, { x: 0, y: 0, zoom: 1 });
	assert.equal(fills, 1);
	assert.equal(strokes, 0);
});

test("world projection derives viewport position from Camera zoom and logical canvas size", () => {
	assert.deepEqual(worldToScreen({ x: 10, y: 5 }, { x: 0, y: 0, zoom: 2 }, 640, 360), { x: 340, y: 190 });
	assert.deepEqual(worldToScreen({ x: 10, y: 5 }, { x: 0, y: 0, zoom: 5 }, 640, 360), { x: 370, y: 205 });
	assert.deepEqual(worldToScreen({ x: 10, y: 5 }, { x: 10, y: 5, zoom: 5 }, 800, 600), { x: 400, y: 300 });
});

test("sprite offsets participate in visual bounds without mutating Player entities", () => {
	const world = new World();
	const player = world.createEntity();
	world.players.set(player, { id: 7, name: "Player" });
	const position = applySpriteOffset({ x: -40, y: 10 }, { offsetX: 12, offsetY: 3 });
	assert.equal(isAabbVisible({ maxX: position.x + 32, maxY: position.y + 48, minX: position.x, minY: position.y }, 100, 80), true);
	assert.equal(world.entities.has(player), true);
	assert.equal(world.players.has(player), true);
});

test("culling removes only invisible items and preserves visible render ordering", () => {
	const outsideLeft = -CLIENT_CONFIG.culling.marginPixels - 1;
	const items = [
		{ bounds: { maxX: 20, maxY: 20, minX: 10, minY: 10 }, column: 0, depth: 2, layer: 0, name: "last", order: 0, row: 2, tieBreaker: 3 },
		{ bounds: { maxX: outsideLeft, maxY: 20, minX: outsideLeft - 10, minY: 10 }, column: 1, depth: 1, layer: 0, name: "hidden", order: 0, row: 0, tieBreaker: 2 },
		{ bounds: { maxX: 20, maxY: 20, minX: 10, minY: 10 }, column: 0, depth: 0, layer: 0, name: "first", order: 0, row: 0, tieBreaker: 1 },
	];
	const visible = items.filter(({ bounds }) => isAabbVisible(bounds, 100, 80));
	assert.deepEqual(orderedNames(visible), ["first", "last"]);
});

test("RenderSystem skips offscreen draw calls while retaining partial and inside Tile entities", () => {
	const drawImages: unknown[][] = [];
	const context = {
		clearRect() {},
		drawImage(...args: unknown[]) { drawImages.push(args); },
		imageSmoothingEnabled: true,
	} as unknown as CanvasRenderingContext2D;
	const element = { height: 80, width: 100 } as HTMLCanvasElement;
	const textures = new Map<number, HTMLImageElement>([1, 201, 301].map((tileId) => [
		tileId,
		{ naturalHeight: 32, tileId } as unknown as HTMLImageElement,
	]));
	const renderer = Reflect.construct(RenderSystem, [{ context, element }, textures, new Map()]) as RenderSystem;
	const world = new World();
	for (const [row, textureId] of [[0, 1], [3, 201], [100, 301]] as const) {
		const entity = world.createEntity();
		world.tiles.set(entity, { textureId });
		world.gridPositions.set(entity, { column: 0, row });
		world.renderables.set(entity, { layer: 0, order: 0 });
	}

	renderer.render(world, { x: 0, y: 0, zoom: 1 });

	assert.equal(drawImages.length, 2);
	assert.deepEqual(drawImages.map(([texture]) => (texture as { tileId: number }).tileId), [1, 201]);
	assert.equal(world.tiles.size, 3);
	assert.equal(world.entities.size, 3);
});

test("feedback precedence remains Selected, Hover, Hint, Tile", () => {
	assert.equal(getTileFeedbackState(true, true, true, true, true), "selected");
	assert.equal(getTileFeedbackState(false, true, true, true, true), "invalid");
	assert.equal(getTileFeedbackState(false, false, true, true, true), "hovered");
	assert.equal(getTileFeedbackState(false, false, false, true, true), "path");
	assert.equal(getTileFeedbackState(false, false, false, false, true), "hinted");
	assert.equal(getTileFeedbackState(false, false, false, false, false), undefined);
});
