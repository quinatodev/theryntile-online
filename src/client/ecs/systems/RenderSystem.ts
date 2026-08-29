/**
 * Lang: pt-BR
 * Carrega assets e desenha Tile/Player Entities em uma única fila GRID -> LAYER -> ORDER.
 *
 * Lang: en-US
 * Loads assets and draws Tile/Player Entities in one GRID -> LAYER -> ORDER queue.
 */
import { type Camera } from "../../engine/Camera.js";
import { type CanvasSurface } from "../../engine/Canvas.js";
import { gridToIsometric, TILE_VISUAL_GROUND_OFFSET_Y } from "../../engine/Isometric.js";
import { type Entity, type GridPosition, type MovementComponent, type SpriteComponent } from "../Components.js";
import { type World } from "../World.js";
import { ANIMATION_FRAME_COUNT } from "./AnimationSystem.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const HIGHLIGHT_INSET_X = 2;
const HIGHLIGHT_INSET_Y = 1;

export interface Point {
	x: number;
	y: number;
}

export interface RenderOrder extends GridPosition {
	depth: number;
	layer: number;
	order: number;
}

interface PlayerDrawable extends RenderOrder {
	entity: Entity;
	kind: "player";
}

interface TileDrawable extends RenderOrder {
	entity: Entity;
	kind: "tile";
}

interface HighlightDrawable extends RenderOrder {
	entity: Entity;
	kind: "highlight";
	state: "hovered" | "selected";
}

type Drawable = HighlightDrawable | PlayerDrawable | TileDrawable;

export const compareRenderOrder = (a: RenderOrder, b: RenderOrder): number => a.depth - b.depth
	|| a.row - b.row
	|| a.column - b.column
	|| a.layer - b.layer
	|| a.order - b.order;

export const getMovementSortingGrid = (
	gridPosition: GridPosition,
	movement: MovementComponent | undefined,
): GridPosition => movement && movement.progress < 0.5
	? { column: movement.fromColumn, row: movement.fromRow }
	: gridPosition;

export const getHighlightRenderOrder = (gridPosition: GridPosition): RenderOrder => ({
	...gridPosition,
	depth: gridPosition.row + gridPosition.column,
	layer: 0,
	order: 1,
});

export const applySpriteOffset = (basePosition: Point, sprite: Pick<SpriteComponent, "offsetX" | "offsetY">): Point => ({
	x: basePosition.x + sprite.offsetX,
	y: basePosition.y + sprite.offsetY,
});

export const getTileHighlightState = (selected: boolean, hovered: boolean): "hovered" | "selected" | undefined => selected
	? "selected"
	: hovered ? "hovered" : undefined;

export const getHighlightDiamond = (worldPosition: Point): [Point, Point, Point, Point] => {
	const centerY = worldPosition.y + TILE_VISUAL_GROUND_OFFSET_Y + TILE_FOOTPRINT_HEIGHT / 2;
	const halfWidth = TILE_WIDTH / 2 - HIGHLIGHT_INSET_X;
	const halfHeight = TILE_FOOTPRINT_HEIGHT / 2 - HIGHLIGHT_INSET_Y;

	return [
		{ x: worldPosition.x, y: centerY - halfHeight },
		{ x: worldPosition.x + halfWidth, y: centerY },
		{ x: worldPosition.x, y: centerY + halfHeight },
		{ x: worldPosition.x - halfWidth, y: centerY },
	];
};

const loadImage = (path: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
	const image = new Image();

	image.addEventListener("load", () => resolve(image), { once: true });
	image.addEventListener("error", () => reject(new Error(`Unable to load image: ${path}.`)), { once: true });
	image.src = path;
});

export class RenderSystem {
	private constructor(
		private readonly surface: CanvasSurface,
		private readonly tileTexture: HTMLImageElement,
		private readonly playerTextures: ReadonlyMap<string, HTMLImageElement>,
	) {}

	static async create(surface: CanvasSurface): Promise<RenderSystem> {
		const tileTexture = await loadImage("/assets/textures/tiles/grass/tile1.png");
		const playerTextures = new Map<string, HTMLImageElement>();
		const directions = ["left_down", "left_top", "right_down", "right_top"] as const;

		await Promise.all(directions.flatMap((direction) => ["idle", "walk"].map(async (state) => {
			const key = `${state}_${direction}`;
			playerTextures.set(key, await loadImage(`/assets/textures/characters/hana/${key}.png`));
		})));

		return new RenderSystem(surface, tileTexture, playerTextures);
	}

	render(world: World, camera: Camera): void {
		const { context, element } = this.surface;
		const drawables: Drawable[] = [];

		for (const [entity] of world.tiles) {
			const gridPosition = world.gridPositions.get(entity);
			const renderable = world.renderables.get(entity);

			if (!gridPosition || !renderable) continue;
			drawables.push({
				...gridPosition,
				...renderable,
				depth: gridPosition.row + gridPosition.column,
				entity,
				kind: "tile",
			});

			const selected = world.selectedTiles.has(entity);
			const highlightState = getTileHighlightState(selected, world.hoveredTiles.has(entity));
			if (highlightState) {
				drawables.push({
					...getHighlightRenderOrder(gridPosition),
					entity,
					kind: "highlight",
					state: highlightState,
				});
			}
		}

		for (const [entity] of world.players) {
			const gridPosition = world.gridPositions.get(entity);
			const visualPosition = world.visualPositions.get(entity);
			const sprite = world.sprites.get(entity);
			const animation = world.animations.get(entity);
			const renderable = world.renderables.get(entity);

			if (!gridPosition || !visualPosition || !sprite || !animation || !renderable) continue;
			const sortingGrid = getMovementSortingGrid(gridPosition, world.movements.get(entity));
			drawables.push({
				...sortingGrid,
				...renderable,
				depth: sortingGrid.row + sortingGrid.column,
				entity,
				kind: "player",
			});
		}

		drawables.sort(compareRenderOrder);
		context.clearRect(0, 0, element.width, element.height);
		context.imageSmoothingEnabled = false;

		const toScreen = (worldX: number, worldY: number) => ({
			x: (worldX - camera.x) * camera.zoom + element.width / 2,
			y: (worldY - camera.y) * camera.zoom + element.height / 2,
		});

		for (const drawable of drawables) {
			if (drawable.kind === "tile") {
				const worldPosition = gridToIsometric(drawable.column, drawable.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
				const screen = toScreen(worldPosition.x, worldPosition.y);
				context.drawImage(this.tileTexture, Math.round(screen.x - TILE_WIDTH * camera.zoom / 2), Math.round(screen.y), TILE_WIDTH * camera.zoom, this.tileTexture.naturalHeight * camera.zoom);
				continue;
			}

			if (drawable.kind === "highlight") {
				const worldPosition = gridToIsometric(drawable.column, drawable.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
				const [top, right, bottom, left] = getHighlightDiamond(worldPosition).map(({ x, y }) => toScreen(x, y));
				context.save();
				context.beginPath();
				context.moveTo(top.x, top.y);
				context.lineTo(right.x, right.y);
				context.lineTo(bottom.x, bottom.y);
				context.lineTo(left.x, left.y);
				context.closePath();
				context.fillStyle = drawable.state === "selected" ? "rgba(255, 190, 40, 0.30)" : "rgba(64, 220, 255, 0.22)";
				context.strokeStyle = drawable.state === "selected" ? "#ffd15a" : "#7ae8ff";
				context.lineWidth = Math.max(1.5, camera.zoom * 1.5);
				context.fill();
				context.stroke();
				context.restore();
				continue;
			}

			const visualPosition = world.visualPositions.get(drawable.entity);
			const sprite = world.sprites.get(drawable.entity);
			const animation = world.animations.get(drawable.entity);

			if (!visualPosition || !sprite || !animation) continue;
			const texture = this.playerTextures.get(`${animation.state}_${animation.direction}`);

			if (!texture) continue;
			const feet = toScreen(visualPosition.x, visualPosition.y + sprite.feetOffsetY);
			const frame = animation.frame % ANIMATION_FRAME_COUNT;
			const drawPosition = applySpriteOffset({
				x: feet.x - sprite.frameWidth * camera.zoom / 2,
				y: feet.y - sprite.frameHeight * camera.zoom,
			}, sprite);

			context.drawImage(
				texture,
				frame * sprite.frameWidth,
				0,
				sprite.frameWidth,
				sprite.frameHeight,
				Math.round(drawPosition.x),
				Math.round(drawPosition.y),
				sprite.frameWidth * camera.zoom,
				sprite.frameHeight * camera.zoom,
			);
		}
	}
}
