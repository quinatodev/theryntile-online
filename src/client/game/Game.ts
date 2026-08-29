/**
 * Lang: pt-BR
 * Orquestra World, Systems, lifecycle, RAF, input e integração dos eventos autoritativos do server.
 *
 * Lang: en-US
 * Orchestrates World, Systems, lifecycle, RAF, input, and authoritative server-event integration.
 */
import { type Entity, type PlayerSnapshot, type PointerPosition } from "../ecs/Components.js";
import { AnimationSystem } from "../ecs/systems/AnimationSystem.js";
import { CameraSystem } from "../ecs/systems/CameraSystem.js";
import { HoverSystem } from "../ecs/systems/HoverSystem.js";
import { MovementSystem } from "../ecs/systems/MovementSystem.js";
import { PLAYER_LAYER, PLAYER_ORDER, RenderSystem } from "../ecs/systems/RenderSystem.js";
import { SelectSystem } from "../ecs/systems/SelectSystem.js";
import { WalkHintSystem } from "../ecs/systems/WalkHintSystem.js";
import { World } from "../ecs/World.js";
import { changeCameraZoom, type Camera } from "../engine/Camera.js";
import { resizeCanvasToViewport } from "../engine/Canvas.js";
import { gridToIsometric } from "../engine/Isometric.js";
import { GAME_MAP, MAP_LAYERS } from "./Map.js";
import { findPath, MAX_MOVEMENT_STEPS } from "./Navigation.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 48;
const PLAYER_SPRITE_OFFSET_X = 0;
const PLAYER_SPRITE_OFFSET_Y = 0;

export interface PlayerMoved {
	column: number;
	fromColumn: number;
	fromRow: number;
	playerId: number;
	row: number;
	finalStep: boolean;
}

export interface Game {
	dispose(): void;
	playerJoined(player: PlayerSnapshot): void;
	playerLeft(playerId: number): void;
	playerMoved(message: PlayerMoved): void;
	start(): void;
}

const movementDirection = ({ column, fromColumn, fromRow, row }: PlayerMoved) => {
	if (column > fromColumn) return "right_down" as const;
	if (column < fromColumn) return "left_top" as const;
	if (row > fromRow) return "left_down" as const;

	return "right_top" as const;
};

const addTileEntities = (world: World): void => {
	for (const layer of MAP_LAYERS) {
		for (const [row, entries] of GAME_MAP[layer].entries()) {
			for (const [column, textureId] of entries.entries()) {
				if (textureId === 0) continue;
				const entity = world.createEntity();
				world.gridPositions.set(entity, { column, row });
				world.renderables.set(entity, { layer, order: 0 });
				world.tiles.set(entity, { textureId });
			}
		}
	}
};

const addPlayerEntity = (world: World, player: PlayerSnapshot, local: boolean): Entity => {
	const entity = world.createEntity();
	const visualPosition = gridToIsometric(player.column, player.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
	world.animations.set(entity, { direction: "left_down", frame: 0, state: "idle" });
	world.gridPositions.set(entity, { column: player.column, row: player.row });
	world.players.set(entity, { id: player.id, name: player.name });
	world.renderables.set(entity, { layer: PLAYER_LAYER, order: PLAYER_ORDER + player.id });
	world.sprites.set(entity, {
		feetOffsetY: TILE_FOOTPRINT_HEIGHT,
		frameHeight: PLAYER_FRAME_HEIGHT,
		frameWidth: PLAYER_FRAME_WIDTH,
		offsetX: PLAYER_SPRITE_OFFSET_X,
		offsetY: PLAYER_SPRITE_OFFSET_Y,
	});
	world.visualPositions.set(entity, visualPosition);
	if (local) world.localPlayers.add(entity);

	return entity;
};

/**
 * Lang: pt-BR
 * Inicializa o runtime multilayer, envia apenas intenção de destino e mantém input bloqueado durante a rota autoritativa.
 *
 * Lang: en-US
 * Initializes the multilayer runtime, sends destination intent only, and keeps input locked during the authoritative route.
 */
export async function startGame(
	canvas: HTMLCanvasElement,
	localPlayer: PlayerSnapshot,
	initialRemotePlayers: readonly PlayerSnapshot[],
	requestMove: (row: number, column: number) => boolean,
): Promise<Game> {
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas 2D is not available.");

	const surface = { element: canvas, context };
	const world = new World();
	const movementSystem = new MovementSystem();
	const animationSystem = new AnimationSystem();
	const cameraSystem = new CameraSystem();
	const hoverSystem = new HoverSystem();
	const selectSystem = new SelectSystem();
	const walkHintSystem = new WalkHintSystem();
	const renderSystem = await RenderSystem.create(surface);
	const playerEntities = new Map<number, Entity>();
	addTileEntities(world);
	const localPlayerEntity = addPlayerEntity(world, localPlayer, true);
	playerEntities.set(localPlayer.id, localPlayerEntity);
	for (const player of initialRemotePlayers) playerEntities.set(player.id, addPlayerEntity(world, player, false));

	const localVisualPosition = world.visualPositions.get(localPlayerEntity);
	if (!localVisualPosition) throw new Error("Local Player visual position is not available.");
	const camera: Camera = { x: localVisualPosition.x, y: localVisualPosition.y + TILE_FOOTPRINT_HEIGHT, zoom: 1 };
	let animationFrame: number | null = null;
	let disposed = false;
	let started = false;
	const pointer: PointerPosition = { canvasX: 0, canvasY: 0, inside: false };

	const render = () => { if (started && !disposed) renderSystem.render(world, camera, performance.now()); };
	const frame = (timestamp: number) => {
		animationFrame = null;
		if (!started || disposed) return;
		hoverSystem.update(world, camera, canvas.width, canvas.height, pointer);
		movementSystem.update(world, timestamp);
		animationSystem.update(world, timestamp);
		cameraSystem.update(world, camera);
		walkHintSystem.update(world, localPlayerEntity, timestamp);
		renderSystem.render(world, camera, timestamp);
		animationFrame = window.requestAnimationFrame(frame);
	};
	const ensureAnimationFrame = () => {
		if (started && !disposed && animationFrame === null) animationFrame = window.requestAnimationFrame(frame);
	};
	const resizeAndRender = () => { resizeCanvasToViewport(surface); render(); };
	const zoomAndRender = (event: WheelEvent) => { event.preventDefault(); changeCameraZoom(camera, event.deltaY); render(); };
	const updatePointer = (event: PointerEvent | MouseEvent) => {
		const bounds = canvas.getBoundingClientRect();
		pointer.canvasX = (event.clientX - bounds.left) * canvas.width / bounds.width;
		pointer.canvasY = (event.clientY - bounds.top) * canvas.height / bounds.height;
		pointer.inside = true;
	};
	const leaveCanvas = () => { pointer.inside = false; world.hoveredTiles.clear(); render(); };
	const selectClickedTile = (event: MouseEvent) => {
		updatePointer(event);
		if (world.movingPlayers.has(localPlayerEntity)) return;
		const hoveredEntity = hoverSystem.update(world, camera, canvas.width, canvas.height, pointer);
		const target = hoveredEntity === undefined ? undefined : world.gridPositions.get(hoveredEntity);
		const current = world.gridPositions.get(localPlayerEntity);
		if (!target || !current) return;
		const path = findPath(current, target);
		if (!path || path.length === 0 || path.length > MAX_MOVEMENT_STEPS || !requestMove(target.row, target.column)) return;
		const selectedEntity = selectSystem.select(world, hoveredEntity);
		if (selectedEntity === undefined) return;
		world.movingPlayers.add(localPlayerEntity);
		walkHintSystem.reset(world);
		render();
	};

	return {
		dispose() {
			if (disposed) return;
			disposed = true;
			window.removeEventListener("resize", resizeAndRender);
			canvas.removeEventListener("wheel", zoomAndRender);
			canvas.removeEventListener("pointermove", updatePointer);
			canvas.removeEventListener("pointerleave", leaveCanvas);
			canvas.removeEventListener("click", selectClickedTile);
			if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
			animationFrame = null;
			playerEntities.clear();
			walkHintSystem.reset(world);
			world.clear();
		},
		playerJoined(player) {
			if (disposed) return;
			const previousEntity = playerEntities.get(player.id);
			if (previousEntity !== undefined) world.removeEntity(previousEntity);
			playerEntities.set(player.id, addPlayerEntity(world, player, false));
			render();
		},
		playerLeft(playerId) {
			if (disposed || playerId === localPlayer.id) return;
			const entity = playerEntities.get(playerId);
			if (entity === undefined) return;
			playerEntities.delete(playerId);
			world.removeEntity(entity);
			render();
		},
		playerMoved(message) {
			if (disposed) return;
			const entity = playerEntities.get(message.playerId);
			if (entity === undefined) return;
			const gridPosition = world.gridPositions.get(entity);
			const visualPosition = world.visualPositions.get(entity);
			const animation = world.animations.get(entity);
			if (!gridPosition || !visualPosition || !animation) return;
			const target = gridToIsometric(message.column, message.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
			world.movingPlayers.add(entity);
			world.movements.set(entity, {
				finalStep: message.finalStep, fromColumn: message.fromColumn, fromRow: message.fromRow, progress: 0,
				startX: visualPosition.x, startY: visualPosition.y,
				targetColumn: message.column, targetRow: message.row, targetX: target.x, targetY: target.y,
			});
			gridPosition.column = message.column;
			gridPosition.row = message.row;
			animation.direction = movementDirection(message);
			animation.state = "walk";
			animation.frame = 0;
			delete animation.startedAt;
			ensureAnimationFrame();
		},
		start() {
			if (disposed || started) return;
			started = true;
			walkHintSystem.reset(world);
			window.addEventListener("resize", resizeAndRender);
			canvas.addEventListener("wheel", zoomAndRender, { passive: false });
			canvas.addEventListener("pointermove", updatePointer);
			canvas.addEventListener("pointerleave", leaveCanvas);
			canvas.addEventListener("click", selectClickedTile);
			resizeAndRender();
			ensureAnimationFrame();
		},
	};
}
