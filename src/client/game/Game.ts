/**
 * Lang: pt-BR
 * Possui o runtime visual preparado e interpola eventos autoritativos de movimento recebidos do server.
 * Input envia apenas intenção; Game não decide membership nem posição lógica final.
 *
 * Lang: en-US
 * Owns the prepared visual runtime and interpolates authoritative movement events received from the server.
 * Input sends only intent; Game does not decide membership or final logical position.
 */
import { changeCameraZoom, type Camera } from "../engine/Camera.js";
import { resizeCanvasToViewport } from "../engine/Canvas.js";
import { gridToIsometric, worldToGrid } from "../engine/Isometric.js";
import { createLobbyRenderer } from "./Lobby.js";
import { type Player, type PlayerDirection, type VisualPlayer } from "./Player.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const MOVE_DURATION_MS = 500;
const IDLE_FRAMES_PER_SECOND = 8;
const IDLE_FRAME_COUNT = 8;
const WALK_FRAMES_PER_SECOND = 16;
const WALK_FRAME_COUNT = 8;
const DEFAULT_DIRECTION: PlayerDirection = "left_down";

export interface PlayerMoved {
	playerId: number;
	fromRow: number;
	fromColumn: number;
	row: number;
	column: number;
}

export interface Game {
	dispose(): void;
	playerJoined(player: Player): void;
	playerLeft(playerId: number): void;
	playerMoved(message: PlayerMoved): void;
	start(): void;
}

const movementDirection = ({ fromRow, fromColumn, row, column }: PlayerMoved): PlayerDirection => {
	if (column > fromColumn) return "right_down";
	if (column < fromColumn) return "left_top";
	if (row > fromRow) return "left_down";

	return "right_top";
};

const createVisualPlayer = (player: Player): VisualPlayer => {
	const world = gridToIsometric(player.column, player.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);

	return { ...player, visualX: world.x, visualY: world.y, direction: DEFAULT_DIRECTION, animation: "idle", frame: 0 };
};

/**
 * Lang: pt-BR
 * Prepara assets e estado interno sem registrar listeners, RAF ou renderizar.
 * O chamador valida a geração de Loading antes de start() ativar efeitos.
 *
 * Lang: en-US
 * Prepares assets and internal state without registering listeners, RAF, or rendering.
 * The caller validates the Loading generation before start() activates effects.
 */
export async function startGame(
	canvas: HTMLCanvasElement,
	localPlayer: Player,
	initialRemotePlayers: readonly Player[],
	requestMove: (row: number, column: number) => boolean,
): Promise<Game> {
	const context = canvas.getContext("2d");

	if (!context) throw new Error("Canvas 2D is not available.");

	const surface = { element: canvas, context };
	const lobby = await createLobbyRenderer(surface);
	const localVisualPlayer = createVisualPlayer(localPlayer);
	const camera: Camera = {
		x: localVisualPlayer.visualX,
		y: localVisualPlayer.visualY + TILE_FOOTPRINT_HEIGHT,
		zoom: 1,
	};
	const players = new Map<number, VisualPlayer>([[localPlayer.id, localVisualPlayer]]);

	let animationFrame: number | null = null;
	let disposed = false;
	let started = false;

	for (const player of initialRemotePlayers) players.set(player.id, createVisualPlayer(player));

	const render = () => {
		if (started && !disposed) lobby.render([...players.values()], camera);
	};

	/**
	 * Lang: pt-BR
	 * Atualiza animações, interpolações e câmera em um único RAF contínuo.
	 *
	 * Lang: en-US
	 * Updates animations, interpolations, and the camera in one continuous RAF.
	 */
	const updateMovements = (timestamp: number) => {
		animationFrame = null;

		for (const player of players.values()) {
			const movement = player.movement;

			player.animationStartedAt ??= timestamp;

			if (!movement) {
				const elapsed = Math.max(0, timestamp - player.animationStartedAt);
				player.frame = Math.floor(elapsed * IDLE_FRAMES_PER_SECOND / 1_000) % IDLE_FRAME_COUNT;
				continue;
			}

			// Lang: pt-BR
			// O primeiro timestamp do próprio RAF estabelece a única base temporal da interpolação e dos frames.
			// Lang: en-US
			// The first RAF timestamp establishes the single time base for interpolation and animation frames.
			movement.startedAt ??= timestamp;
			const elapsed = Math.max(0, timestamp - movement.startedAt);
			const progress = Math.min(1, elapsed / MOVE_DURATION_MS);
			movement.progress = progress;

			player.visualX = movement.startX + (movement.targetX - movement.startX) * progress;
			player.visualY = movement.startY + (movement.targetY - movement.startY) * progress;
			player.frame = Math.floor(elapsed * WALK_FRAMES_PER_SECOND / 1_000) % WALK_FRAME_COUNT;

			if (player.id === localPlayer.id) {
				camera.x = player.visualX;
				camera.y = player.visualY + TILE_FOOTPRINT_HEIGHT;
			}

			if (progress >= 1) {
				player.animation = "idle";
				player.animationStartedAt = timestamp;
				player.frame = 0;
				delete player.movement;
			}
		}

		render();

		if (started && !disposed) animationFrame = window.requestAnimationFrame(updateMovements);
	};

	const ensureAnimationFrame = () => {
		if (started && !disposed && animationFrame === null) {
			animationFrame = window.requestAnimationFrame(updateMovements);
		}
	};

	const resizeAndRender = () => { resizeCanvasToViewport(surface); render(); };
	const zoomAndRender = (event: WheelEvent) => { event.preventDefault(); changeCameraZoom(camera, event.deltaY); render(); };

	/**
	 * Lang: pt-BR
	 * Converte screen -> world -> grid com Camera/zoom atuais e envia um destino enquanto o local está parado.
	 *
	 * Lang: en-US
	 * Converts screen -> world -> grid using current Camera/zoom and sends a destination while the local player is idle.
	 */
	const requestClickedTile = (event: MouseEvent) => {
		if (localVisualPlayer.movement) return;

		const bounds = canvas.getBoundingClientRect();
		const canvasX = (event.clientX - bounds.left) * canvas.width / bounds.width;
		const canvasY = (event.clientY - bounds.top) * canvas.height / bounds.height;
		const worldX = (canvasX - canvas.width / 2) / camera.zoom + camera.x;
		const worldY = (canvasY - canvas.height / 2) / camera.zoom + camera.y;
		const target = worldToGrid(worldX, worldY, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);

		if (target) requestMove(target.row, target.column);
	};

	return {
		dispose() {
			if (disposed) return;

			disposed = true;
			window.removeEventListener("resize", resizeAndRender);
			canvas.removeEventListener("wheel", zoomAndRender);
			canvas.removeEventListener("click", requestClickedTile);

			if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);

			animationFrame = null;
			players.clear();
		},
		playerJoined(player) {
			if (!disposed) {
				players.set(player.id, createVisualPlayer(player));
				render();
			}
		},
		playerLeft(playerId) {
			if (!disposed && playerId !== localPlayer.id && players.delete(playerId)) render();
		},
		playerMoved(message) {
			const player = players.get(message.playerId);

			if (!player || disposed) return;

			const target = gridToIsometric(message.column, message.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);

			// Lang: pt-BR
			// Um evento novo parte da posição visual corrente para evitar teleport em eventos sobrepostos.
			// Lang: en-US
			// A new event starts at the current visual position to avoid teleporting on overlapping events.
			player.movement = {
				...message,
				startX: player.visualX,
				startY: player.visualY,
				targetX: target.x,
				targetY: target.y,
				progress: 0,
			};
			player.row = message.row;
			player.column = message.column;
			player.direction = movementDirection(message);
			player.animation = "walk";
			delete player.animationStartedAt;
			player.frame = 0;
			ensureAnimationFrame();
		},
		start() {
			if (disposed || started) return;

			started = true;
			window.addEventListener("resize", resizeAndRender);
			canvas.addEventListener("wheel", zoomAndRender, { passive: false });
			canvas.addEventListener("click", requestClickedTile);
			resizeAndRender();
			ensureAnimationFrame();
		},
	};
}
