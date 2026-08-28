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
import { type Player } from "./Player.js";
import { gridToIsometric } from "../engine/Isometric.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 48;
const PLAYER_FOOT_OFFSET_Y = TILE_FOOTPRINT_HEIGHT;
const PLAYER_TEXTURE_PATHS = [
	"/assets/textures/characters/hana/idle_left_down.png",
	"/assets/textures/characters/hana/idle_left_top.png",
	"/assets/textures/characters/hana/idle_right_down.png",
	"/assets/textures/characters/hana/idle_right_top.png",
] as const;

const lobbyMap: number[][] = Array.from({ length: 5 }, () => Array<number>(5).fill(1));

const loadImage = (path: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
	const image = new Image();

	image.addEventListener("load", () => resolve(image), { once: true });
	image.addEventListener("error", () => reject(new Error(`Unable to load image: ${path}.`)), { once: true });
	image.src = path;
});

export interface LobbyRenderer { render(players: readonly Player[], camera: Camera): void; }

/**
 * Lang: pt-BR
 * Carrega os assets necessários e devolve um renderer ligado ao CanvasSurface fornecido.
 * A ordem por diagonais e por row/column mantém o painter ordering de tiles e jogadores.
 *
 * Lang: en-US
 * Loads the required assets and returns a renderer bound to the provided CanvasSurface.
 * Diagonal and row/column ordering preserves painter ordering for tiles and players.
 */
export async function createLobbyRenderer({ element, context }: CanvasSurface): Promise<LobbyRenderer> {
	const [tileTexture, initialPlayerTexture] = await Promise.all([
		loadImage("/assets/textures/tiles/grass/tile1.png"),
		...PLAYER_TEXTURE_PATHS.map(loadImage),
	]);

	if (!tileTexture || !initialPlayerTexture) throw new Error("The lobby assets could not be loaded.");

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

			for (let depth = 0; depth < rows + columns - 1; depth += 1) {
				const firstRow = Math.max(0, depth - columns + 1);
				const lastRow = Math.min(rows - 1, depth);

				for (let row = firstRow; row <= lastRow; row += 1) {
					const column = depth - row;
					const world = gridToIsometric(column, row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
					const screen = toScreen(world.x, world.y);

					context.drawImage(tileTexture, Math.round(screen.x - TILE_WIDTH * camera.zoom / 2), Math.round(screen.y), TILE_WIDTH * camera.zoom, tileTexture.naturalHeight * camera.zoom);
				}

				const depthPlayers = players.filter((player) => player.row + player.column === depth).sort((a, b) => a.row - b.row || a.column - b.column);
				for (const player of depthPlayers) {
					const world = gridToIsometric(player.column, player.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
					const feet = toScreen(world.x, world.y + PLAYER_FOOT_OFFSET_Y);

					context.drawImage(initialPlayerTexture, 0, 0, PLAYER_FRAME_WIDTH, PLAYER_FRAME_HEIGHT, Math.round(feet.x - PLAYER_FRAME_WIDTH * camera.zoom / 2), Math.round(feet.y - PLAYER_FRAME_HEIGHT * camera.zoom), PLAYER_FRAME_WIDTH * camera.zoom, PLAYER_FRAME_HEIGHT * camera.zoom);
				}
			}
		},
	};
}
