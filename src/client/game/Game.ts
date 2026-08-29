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
import { getNextRequestedStep, MovementSystem } from "../ecs/systems/MovementSystem.js";
import { RenderSystem } from "../ecs/systems/RenderSystem.js";
import { SelectSystem } from "../ecs/systems/SelectSystem.js";
import { World } from "../ecs/World.js";
import { changeCameraZoom, type Camera } from "../engine/Camera.js";
import { resizeCanvasToViewport } from "../engine/Canvas.js";
import { gridToIsometric } from "../engine/Isometric.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 48;
const PLAYER_SPRITE_OFFSET_X = 0;
const PLAYER_SPRITE_OFFSET_Y = 0;
const MAP_ROWS = 5;
const MAP_COLUMNS = 5;

export interface PlayerMoved {
	column: number;
	fromColumn: number;
	fromRow: number;
	playerId: number;
	row: number;
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
	for (let row = 0; row < MAP_ROWS; row += 1) {
		for (let column = 0; column < MAP_COLUMNS; column += 1) {
			const entity = world.createEntity();
			world.gridPositions.set(entity, { column, row });
			world.renderables.set(entity, { layer: 0, order: 0 });
			world.tiles.set(entity, { textureId: 1 });
		}
	}
};

const addPlayerEntity = (world: World, player: PlayerSnapshot, local: boolean): Entity => {
	const entity = world.createEntity();
	const visualPosition = gridToIsometric(player.column, player.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
	world.animations.set(entity, { direction: "left_down", frame: 0, state: "idle" });
	world.gridPositions.set(entity, { column: player.column, row: player.row });
	world.players.set(entity, { id: player.id, name: player.name });
	world.renderables.set(entity, { layer: 2, order: player.id });
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

	const render = () => { if (started && !disposed) renderSystem.render(world, camera); };
	const requestNextMove = () => {
		const moveTarget = world.moveTargets.get(localPlayerEntity);
		const gridPosition = world.gridPositions.get(localPlayerEntity);

		if (!moveTarget || !gridPosition) return;
		if (gridPosition.row === moveTarget.row && gridPosition.column === moveTarget.column) {
			world.moveTargets.delete(localPlayerEntity);

			return;
		}
		const nextStep = getNextRequestedStep(gridPosition, moveTarget, world.movements.has(localPlayerEntity));

		if (!nextStep) return;

		if (requestMove(nextStep.row, nextStep.column)) moveTarget.awaitingStep = true;
	};
	const frame = (timestamp: number) => {
		animationFrame = null;
		if (!started || disposed) return;
		hoverSystem.update(world, camera, canvas.width, canvas.height, pointer);
		movementSystem.update(world, timestamp);
		requestNextMove();
		animationSystem.update(world, timestamp);
		cameraSystem.update(world, camera);
		renderSystem.render(world, camera);
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
		const hoveredEntity = hoverSystem.update(world, camera, canvas.width, canvas.height, pointer);
		const selectedEntity = selectSystem.select(world, hoveredEntity);
		if (selectedEntity === undefined) return;
		const target = world.gridPositions.get(selectedEntity);
		if (!target) return;
		const awaitingStep = world.moveTargets.get(localPlayerEntity)?.awaitingStep ?? false;
		world.moveTargets.set(localPlayerEntity, { ...target, awaitingStep });
		requestNextMove();
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
			if (entity === localPlayerEntity) {
				const moveTarget = world.moveTargets.get(entity);
				if (moveTarget) moveTarget.awaitingStep = false;
			}
			const target = gridToIsometric(message.column, message.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
			world.movements.set(entity, {
				fromColumn: message.fromColumn, fromRow: message.fromRow, progress: 0,
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
