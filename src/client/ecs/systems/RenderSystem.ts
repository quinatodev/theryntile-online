/**
 * Lang: pt-BR
 * Carrega assets e desenha Tiles multilayer, feedback e Players em uma única fila GRID -> LAYER -> ORDER.
 *
 * Lang: en-US
 * Loads assets and draws multilayer Tiles, feedback, and Players in one GRID -> LAYER -> ORDER queue.
 */
import { type Camera } from "../../engine/Camera.js";
import { type CanvasSurface } from "../../engine/Canvas.js";
import { gridToIsometric, TILE_VISUAL_GROUND_OFFSET_Y } from "../../engine/Isometric.js";
import { type Entity, type GridPosition, type MovementComponent, type RenderableComponent, type SpriteComponent } from "../Components.js";
import { type World } from "../World.js";
import { ANIMATION_FRAME_COUNT } from "./AnimationSystem.js";
import { getLayerVisualOffsetY, getTileTextureSource } from "../../game/Map.js";
import { CLIENT_CONFIG } from "../../game/ClientConfig.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;

/**
 * Lang: pt-BR
 * Mantém o Player na layer estrutural 1 para que layers 2+ continuem vencendo antes que order seja comparado.
 *
 * Lang: en-US
 * Keeps the Player on structural layer 1 so layers 2+ still win before order is compared.
 */
export const PLAYER_LAYER = 1;

/**
 * Lang: pt-BR
 * Reserva prioridade visual para Players após drawables normais do mesmo grid/layer; Player ID desempata o stacking.
 * O order permanece local: um drawable na layer 2 ainda é desenhado depois de qualquer Player na layer 1.
 *
 * Lang: en-US
 * Reserves visual priority for Players after normal drawables in the same grid/layer; Player ID breaks stacking ties.
 * Order remains local: a drawable on layer 2 is still drawn after every Player on layer 1.
 */
export const PLAYER_ORDER = 1_000_000;

export interface Point {
	x: number;
	y: number;
}

export interface ScreenAabb {
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
}

/** Lang: pt-BR - Projeta world space na viewport com câmera e zoom. Lang: en-US - Projects world space onto the viewport with camera and zoom. */
export const worldToScreen = (point: Point, camera: Camera, viewportWidth: number, viewportHeight: number): Point => ({
	x: (point.x - camera.x) * camera.zoom + viewportWidth / 2,
	y: (point.y - camera.y) * camera.zoom + viewportHeight / 2,
});

/**
 * Lang: pt-BR
 * Mantém qualquer AABB que toque a viewport; somente drawables completamente externos são descartados.
 *
 * Lang: en-US
 * Keeps any AABB touching the viewport; only fully external drawables are discarded.
 */
export const isAabbVisible = (bounds: ScreenAabb, viewportWidth: number, viewportHeight: number): boolean => !(
	bounds.maxX < -CLIENT_CONFIG.culling.marginPixels
	|| bounds.minX > viewportWidth + CLIENT_CONFIG.culling.marginPixels
	|| bounds.maxY < -CLIENT_CONFIG.culling.marginPixels
	|| bounds.minY > viewportHeight + CLIENT_CONFIG.culling.marginPixels
);

export interface RenderOrder extends GridPosition {
	depth: number;
	layer: number;
	order: number;
	tieBreaker: number;
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
	state: "hinted" | "path" | "hovered" | "invalid" | "selected";
}

export type HighlightState = HighlightDrawable["state"];

type Drawable = HighlightDrawable | PlayerDrawable | TileDrawable;

/**
 * Lang: pt-BR
 * Ordena por grid, layer e categoria local; tieBreaker independente encerra empates sem depender da inserção.
 * Layer precede order, portanto Player layer 1 nunca ultrapassa um drawable layer 2.
 *
 * Lang: en-US
 * Orders by grid, layer, and local category; an independent tieBreaker resolves ties without insertion order.
 * Layer precedes order, so a layer-1 Player never crosses a layer-2 drawable.
 */
export const compareRenderOrder = (a: RenderOrder, b: RenderOrder): number => a.depth - b.depth
	|| a.row - b.row
	|| a.column - b.column
	|| a.layer - b.layer
	|| a.order - b.order
	|| a.tieBreaker - b.tieBreaker;

/** Lang: pt-BR - Materializa a chave determinística de ordenação. Lang: en-US - Materializes the deterministic render-order key. */
export const getRenderableRenderOrder = (
	gridPosition: GridPosition,
	renderable: RenderableComponent,
	tieBreaker: number,
): RenderOrder => ({
	...gridPosition,
	...renderable,
	depth: gridPosition.row + gridPosition.column,
	tieBreaker,
});

/** Lang: pt-BR - Troca a célula de sorting somente após metade do step. Lang: en-US - Switches the sorting cell only after half a step. */
export const getMovementSortingGrid = (
	gridPosition: GridPosition,
	movement: MovementComponent | undefined,
): GridPosition => movement && movement.progress < 0.5
	? { column: movement.fromColumn, row: movement.fromRow }
	: gridPosition;

/** Lang: pt-BR - Coloca feedback imediatamente acima do ground. Lang: en-US - Places feedback immediately above ground. */
export const getHighlightRenderOrder = (gridPosition: GridPosition, tieBreaker = 0): RenderOrder => ({
	...gridPosition,
	depth: gridPosition.row + gridPosition.column,
	layer: 0,
	order: 1,
	tieBreaker,
});

/**
 * Lang: pt-BR
 * Projeta o grid e aplica a altura da layer sem contaminar GridPosition ou a chave estrutural de sorting.
 *
 * Lang: en-US
 * Projects the grid and applies layer height without contaminating GridPosition or the structural sorting key.
 */
export const getTileVisualPosition = (gridPosition: GridPosition, layer: number): Point => {
	const position = gridToIsometric(gridPosition.column, gridPosition.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);

	return { x: position.x, y: position.y + getLayerVisualOffsetY(layer) };
};

/** Lang: pt-BR - Aplica offset estritamente visual ao sprite. Lang: en-US - Applies a strictly visual sprite offset. */
export const applySpriteOffset = (basePosition: Point, sprite: Pick<SpriteComponent, "offsetX" | "offsetY">): Point => ({
	x: basePosition.x + sprite.offsetX,
	y: basePosition.y + sprite.offsetY,
});

/** Lang: pt-BR - Preserva a prioridade histórica entre seleção e hover. Lang: en-US - Preserves historical selection-versus-hover priority. */
export const getTileHighlightState = (selected: boolean, hovered: boolean): "hovered" | "selected" | undefined => selected
	? "selected"
	: hovered ? "hovered" : undefined;

/**
 * Lang: pt-BR
 * Escolhe um único feedback por Tile na prioridade Selected > Invalid > Hover > Path > Hint.
 *
 * Lang: en-US
 * Chooses one feedback state per Tile with Selected > Invalid > Hover > Path > Hint priority.
 */
export const getTileFeedbackState = (
	selected: boolean,
	invalid: boolean,
	hovered: boolean,
	path: boolean,
	hinted: boolean,
): HighlightDrawable["state"] | undefined => selected ? "selected"
	: invalid ? "invalid"
		: hovered ? "hovered"
			: path ? "path"
				: hinted ? "hinted" : undefined;

/** Lang: pt-BR - Resolve a cor configurada e a pulsação exclusiva do hint. Lang: en-US - Resolves configured color and hint-only pulse. */
export const getHighlightFillStyle = (state: HighlightState, timestamp: number, walkHintAlpha: number): string => {
	const interaction = CLIENT_CONFIG.interaction;
	if (state === "selected") return interaction.selectedColor;
	if (state === "invalid") return interaction.invalidHoverColor;
	if (state === "hovered") return interaction.hoverColor;
	if (state === "path") return interaction.pathPreviewColor;
	const hintAlpha = (0.25 + (Math.sin(timestamp / 250) + 1) * 0.08) * walkHintAlpha;

	return `rgba(${interaction.hintColor}, ${hintAlpha})`;
};

/** Lang: pt-BR - Constrói o diamante sobre o chão visual do Tile. Lang: en-US - Builds the diamond over the Tile's visual ground. */
export const getHighlightDiamond = (worldPosition: Point): [Point, Point, Point, Point] => {
	const centerY = worldPosition.y + TILE_VISUAL_GROUND_OFFSET_Y + TILE_FOOTPRINT_HEIGHT / 2;
	const halfWidth = TILE_WIDTH / 2;
	const halfHeight = TILE_FOOTPRINT_HEIGHT / 2;

	return [
		{ x: worldPosition.x, y: centerY - halfHeight },
		{ x: worldPosition.x + halfWidth, y: centerY },
		{ x: worldPosition.x, y: centerY + halfHeight },
		{ x: worldPosition.x - halfWidth, y: centerY },
	];
};

/** Lang: pt-BR - Carrega textura e propaga falha de asset. Lang: en-US - Loads a texture and propagates asset failure. */
const loadImage = (path: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
	const image = new Image();

	image.addEventListener("load", () => resolve(image), { once: true });
	image.addEventListener("error", () => reject(new Error(`Unable to load image: ${path}.`)), { once: true });
	image.src = path;
});

/** Lang: pt-BR - Compõe, ordena, faz culling e desenha o frame ECS. Lang: en-US - Composes, orders, culls, and draws the ECS frame. */
export class RenderSystem {
	private constructor(
		private readonly surface: CanvasSurface,
		private readonly tileTextures: ReadonlyMap<number, HTMLImageElement>,
		private readonly playerTextures: ReadonlyMap<string, HTMLImageElement>,
	) {}

	/** Lang: pt-BR - Pré-carrega somente os assets exigidos pelo runtime. Lang: en-US - Preloads only assets required by the runtime. */
	static async create(surface: CanvasSurface, tileIds: readonly number[]): Promise<RenderSystem> {
		const tileTextures = new Map<number, HTMLImageElement>();
		const playerTextures = new Map<string, HTMLImageElement>();
		const directions = ["left_down", "left_top", "right_down", "right_top"] as const;

		await Promise.all([
			...tileIds.map(async (tileId) => tileTextures.set(tileId, await loadImage(getTileTextureSource(tileId)))),
			...directions.flatMap((direction) => ["idle", "walk"].map(async (state) => {
				const key = `${state}_${direction}`;
				playerTextures.set(key, await loadImage(`/assets/textures/characters/hana/${key}.png`));
			})),
		]);

		return new RenderSystem(surface, tileTextures, playerTextures);
	}

	/** Lang: pt-BR - Desenha um frame sem mutar identidade ou posição lógica. Lang: en-US - Draws one frame without mutating identity or logical position. */
	render(world: World, camera: Camera, timestamp = 0): void {
		const { context, element } = this.surface;
		const drawables: Drawable[] = [];

		for (const [entity] of world.tiles) {
			const gridPosition = world.gridPositions.get(entity);
			const renderable = world.renderables.get(entity);

			if (!gridPosition || !renderable) continue;
			drawables.push({
				...getRenderableRenderOrder(gridPosition, renderable, entity),
				entity,
				kind: "tile",
				tieBreaker: entity,
			});

			const selected = world.selectedTiles.has(entity);
			const highlightState = getTileFeedbackState(
				selected,
				world.invalidHoveredTiles.has(entity),
				world.hoveredTiles.has(entity),
				world.pathPreviewTiles.has(entity),
				world.hintedTiles.has(entity),
			);
			if (highlightState) {
				drawables.push({
					...getHighlightRenderOrder(gridPosition, entity),
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
			const player = world.players.get(entity);
			const renderable = world.renderables.get(entity);

			if (!gridPosition || !visualPosition || !sprite || !animation || !player || !renderable) continue;
			const sortingGrid = getMovementSortingGrid(gridPosition, world.movements.get(entity));
			drawables.push({
				...getRenderableRenderOrder(sortingGrid, renderable, player.id),
				entity,
				kind: "player",
				tieBreaker: player.id,
			});
		}

		drawables.sort(compareRenderOrder);
		context.clearRect(0, 0, element.width, element.height);
		context.imageSmoothingEnabled = false;

		/** Lang: pt-BR - Vincula projeções do frame à viewport atual. Lang: en-US - Binds frame projections to the current viewport. */
		const toScreen = (worldX: number, worldY: number) => worldToScreen(
			{ x: worldX, y: worldY }, camera, element.width, element.height,
		);

		for (const drawable of drawables) {
			if (drawable.kind === "tile") {
				const tile = world.tiles.get(drawable.entity);
				const texture = tile ? this.tileTextures.get(tile.textureId) : undefined;
				if (!texture) continue;
				const worldPosition = getTileVisualPosition(drawable, drawable.layer);
				const screen = toScreen(worldPosition.x, worldPosition.y);
				const minX = screen.x - TILE_WIDTH * camera.zoom / 2;
				const width = TILE_WIDTH * camera.zoom;
				const height = texture.naturalHeight * camera.zoom;
				if (!isAabbVisible({ maxX: minX + width, maxY: screen.y + height, minX, minY: screen.y }, element.width, element.height)) continue;
				context.drawImage(texture, Math.round(minX), Math.round(screen.y), width, height);
				continue;
			}

			if (drawable.kind === "highlight") {
				const worldPosition = getTileVisualPosition(drawable, drawable.layer);
				const [top, right, bottom, left] = getHighlightDiamond(worldPosition).map(({ x, y }) => toScreen(x, y));
				if (!isAabbVisible({ maxX: right.x, maxY: bottom.y, minX: left.x, minY: top.y }, element.width, element.height)) continue;
				context.save();
				context.beginPath();
				context.moveTo(top.x, top.y);
				context.lineTo(right.x, right.y);
				context.lineTo(bottom.x, bottom.y);
				context.lineTo(left.x, left.y);
				context.closePath();
				const hintAlpha = drawable.state === "hinted"
					? Math.min(world.walkHintAlpha, world.hintedTileAlphas.get(drawable.entity) ?? 0)
					: world.walkHintAlpha;
				context.fillStyle = getHighlightFillStyle(drawable.state, timestamp, hintAlpha);
				context.fill();
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
			const width = sprite.frameWidth * camera.zoom;
			const height = sprite.frameHeight * camera.zoom;
			if (!isAabbVisible({
				maxX: drawPosition.x + width,
				maxY: drawPosition.y + height,
				minX: drawPosition.x,
				minY: drawPosition.y,
			}, element.width, element.height)) continue;

			context.drawImage(
				texture,
				frame * sprite.frameWidth,
				0,
				sprite.frameWidth,
				sprite.frameHeight,
				Math.round(drawPosition.x),
				Math.round(drawPosition.y),
				width,
				height,
			);
		}
	}
}
