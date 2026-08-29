/**
 * Lang: pt-BR
 * Implementa o renderer visual do mapa isométrico atual. Este módulo carrega e desenha assets,
 * mas não possui regras de channel, presença ou posição autoritativa.
 *
 * Lang: en-US
 * Implements the current isometric map renderer. This module loads and draws assets,
 * but owns no channel, presence, or authoritative-position rules.
 */
import { type Camera } from "../engine/Camera.js";
import { type CanvasSurface } from "../engine/Canvas.js";
import { type PlayerDirection, type VisualPlayer } from "./Player.js";
import { gridToIsometric } from "../engine/Isometric.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 48;
const PLAYER_FOOT_OFFSET_Y = TILE_FOOTPRINT_HEIGHT;
const PLAYER_FRAME_COUNT = 8;
const PLAYER_DIRECTIONS: PlayerDirection[] = ["left_down", "left_top", "right_down", "right_top"];

export interface RenderOrder {
	column: number;
	depth: number;
	layer: number;
	order: number;
	row: number;
}

interface PlayerDrawable extends RenderOrder {
	kind: "player";
	player: VisualPlayer;
}

interface TileDrawable extends RenderOrder {
	kind: "tile";
	x: number;
	y: number;
}

type Drawable = PlayerDrawable | TileDrawable;

export const compareRenderOrder = (a: RenderOrder, b: RenderOrder): number => a.depth - b.depth
	|| a.row - b.row
	|| a.column - b.column
	|| a.layer - b.layer
	|| a.order - b.order;

export const getPlayerSortingGrid = (player: Pick<VisualPlayer, "column" | "movement" | "row">) => {
	const movement = player.movement;

	if (movement && movement.progress < 0.5) {
		return { column: movement.fromColumn, row: movement.fromRow };
	}

	return { column: player.column, row: player.row };
};

const lobbyMap: number[][] = Array.from({ length: 5 }, () => Array<number>(5).fill(1));

const loadImage = (path: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
	const image = new Image();

	image.addEventListener("load", () => resolve(image), { once: true });
	image.addEventListener("error", () => reject(new Error(`Unable to load image: ${path}.`)), { once: true });
	image.src = path;
});

export interface LobbyRenderer { render(players: readonly VisualPlayer[], camera: Camera): void; }

/**
 * Lang: pt-BR
 * Carrega os assets necessários e devolve um renderer ligado ao CanvasSurface fornecido.
 * Grid, layer local e order mantêm o painter ordering de tiles e jogadores durante a interpolação.
 *
 * Lang: en-US
 * Loads the required assets and returns a renderer bound to the provided CanvasSurface.
 * Grid, local layer, and order preserve tile/player painter ordering during interpolation.
 */
export async function createLobbyRenderer({ element, context }: CanvasSurface): Promise<LobbyRenderer> {
	const tileTexture = await loadImage("/assets/textures/tiles/grass/tile1.png");
	const playerTextures = new Map<string, HTMLImageElement>();

	await Promise.all(PLAYER_DIRECTIONS.flatMap((direction) => ["idle", "walk"].map(async (animation) => {
		const key = `${animation}_${direction}`;
		playerTextures.set(key, await loadImage(`/assets/textures/characters/hana/${key}.png`));
	})));

	return {
		render(players, camera) {
			const rows = lobbyMap.length;
			const columns = lobbyMap[0]?.length ?? 0;

			// Lang: pt-BR
			// A Camera transforma coordenadas do mundo em pixels do canvas sem alterar o estado autoritativo.
			// Lang: en-US
			// Camera transforms world coordinates into canvas pixels without changing authoritative state.
			const toScreen = (worldX: number, worldY: number) => ({
				x: (worldX - camera.x) * camera.zoom + element.width / 2,
				y: (worldY - camera.y) * camera.zoom + element.height / 2,
			});

			context.clearRect(0, 0, element.width, element.height);
			context.imageSmoothingEnabled = false;

			const drawables: Drawable[] = [];

			for (let row = 0; row < rows; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					const world = gridToIsometric(column, row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
					drawables.push({ column, depth: row + column, kind: "tile", layer: 0, order: 0, row, x: world.x, y: world.y });
				}
			}

			for (const player of players) {
				const grid = getPlayerSortingGrid(player);
				drawables.push({ ...grid, depth: grid.row + grid.column, kind: "player", layer: 1, order: player.id, player });
			}

			drawables.sort(compareRenderOrder);

			for (const drawable of drawables) {
				if (drawable.kind === "tile") {
					const screen = toScreen(drawable.x, drawable.y);
					context.drawImage(tileTexture, Math.round(screen.x - TILE_WIDTH * camera.zoom / 2), Math.round(screen.y), TILE_WIDTH * camera.zoom, tileTexture.naturalHeight * camera.zoom);
					continue;
				}

				const player = drawable.player;
				const feet = toScreen(player.visualX, player.visualY + PLAYER_FOOT_OFFSET_Y);
				const texture = playerTextures.get(`${player.animation}_${player.direction}`);

				if (texture) {
					const frame = player.frame % PLAYER_FRAME_COUNT;
					context.drawImage(texture, frame * PLAYER_FRAME_WIDTH, 0, PLAYER_FRAME_WIDTH, PLAYER_FRAME_HEIGHT, Math.round(feet.x - PLAYER_FRAME_WIDTH * camera.zoom / 2), Math.round(feet.y - PLAYER_FRAME_HEIGHT * camera.zoom), PLAYER_FRAME_WIDTH * camera.zoom, PLAYER_FRAME_HEIGHT * camera.zoom);
				}
			}
		},
	};
}
