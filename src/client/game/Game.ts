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
import { enqueueMovementStep, MovementSystem, reconcileMovement } from "../ecs/systems/MovementSystem.js";
import { RenderSystem } from "../ecs/systems/RenderSystem.js";
import { canSelectTile, SelectSystem } from "../ecs/systems/SelectSystem.js";
import { WalkHintSystem } from "../ecs/systems/WalkHintSystem.js";
import { World } from "../ecs/World.js";
import { changeCameraZoom, type Camera } from "../engine/Camera.js";
import { resizeCanvasToViewport } from "../engine/Canvas.js";
import { createCreatureEntity, createPlayerEntity, createPortalEntity, createTileEntity } from "./Entities.js";
import { getMapBounds, getMapLayers, getMapTileIds, isCellWalkable } from "./Map.js";
import { findPath } from "./Navigation.js";
import { type GameRuntimeConfig } from "./MapConfig.js";

const TILE_FOOTPRINT_HEIGHT = 16;

export interface PlayerMoved {
	column: number;
	fromColumn: number;
	fromRow: number;
	playerId: number;
	row: number;
	finalStep: boolean;
	sequence: number;
	startedAt: number;
	endsAt: number;
	serverTime: number;
}

export interface PlayersResync { serverTime: number; players: Array<PlayerSnapshot & { sequence: number; movement: Omit<PlayerMoved, "playerId" | "serverTime"> | null }>; }

export interface Game {
	dispose(): void;
	playerJoined(player: PlayerSnapshot): void;
	playerLeft(playerId: number): void;
	playerMoved(message: PlayerMoved): void;
	playersResync(message: PlayersResync): void;
	start(): void;
	getZoom(): number;
	creatureMoved(message: { creatureId: string; fromRow: number; fromColumn: number; row: number; column: number; sequence: number; startedAt: number; endsAt: number; serverTime: number }): void;
}

/**
 * Lang: pt-BR
 * Trata uma exceção de frame como fatal: limpa a instância, notifica seu owner e impede continuação parcial.
 *
 * Lang: en-US
 * Treats a frame exception as fatal: cleans the instance, notifies its owner, and prevents partial continuation.
 */
export function executeGameFrame(run: () => void, cleanup: () => void, onFatalError: (error: unknown) => void): boolean {
	try {
		run();

		return true;
	} catch (error) {
		cleanup();
		onFatalError(error);

		return false;
	}
}

export interface ZoomPersistence {
	dispose(): void;
	queue(zoom: number): void;
}

/**
 * Lang: pt-BR
 * Serializa e agrupa gravações de zoom para que somente o valor confirmado mais recente permaneça persistido.
 *
 * Lang: en-US
 * Serializes and coalesces zoom writes so only the latest confirmed value remains persisted.
 */
export function createZoomPersistence(initialZoom: number, saveZoom: (zoom: number) => Promise<void>): ZoomPersistence {
	let confirmedZoom = initialZoom;
	let desiredZoom: number | null = null;
	let saving = false;
	let disposed = false;

	const flush = () => {
		if (disposed || saving || desiredZoom === null) return;
		if (desiredZoom === confirmedZoom) {
			desiredZoom = null;

			return;
		}

		const zoom = desiredZoom;
		desiredZoom = null;
		saving = true;
		void saveZoom(zoom).then(() => {
			if (!disposed) confirmedZoom = zoom;
		}).catch((error: unknown) => {
			if (!disposed) console.error("Unable to persist camera zoom.", error);
		}).finally(() => {
			saving = false;
			if (!disposed) flush();
		});
	};

	return {
		dispose() {
			disposed = true;
			desiredZoom = null;
		},
		queue(zoom) {
			if (disposed) return;
			desiredZoom = zoom;
			flush();
		},
	};
}

/**
 * Lang: pt-BR
 * Materializa somente Tile IDs não vazios do mapa runtime validado usando a factory concreta existente.
 *
 * Lang: en-US
 * Materializes only non-empty Tile IDs from the validated runtime map through the existing concrete factory.
 */
export const addTileEntities = (world: World, config: GameRuntimeConfig): void => {
	for (const layer of getMapLayers(config.map)) {
		for (const [row, entries] of (config.map[layer] ?? []).entries()) {
			for (const [column, textureId] of entries.entries()) {
				if (textureId === 0) continue;
				createTileEntity(world, row, column, layer, textureId);
			}
		}
	}
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
	config: GameRuntimeConfig,
	saveZoom: (zoom: number) => Promise<void>,
	onFatalError: (error: unknown) => void = () => {},
	requestPlayersResync: () => boolean = () => false,
	initialCreatures: readonly { id: string; species: "stag"; row: number; column: number; sequence: number }[] = [],
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
	const walkHintSystem = new WalkHintSystem(config.map, config.tileDefinitions, config.movement.maxSteps);
	const renderSystem = await RenderSystem.create(surface, getMapTileIds(config.map));
	const playerEntities = new Map<number, Entity>();
	const creatureEntities = new Map<string, Entity>();
	addTileEntities(world, config);
	for (const portal of (config.portals ?? []).filter(({ mapId }) => mapId === config.mapId)) createPortalEntity(world, portal);
	for (const creature of initialCreatures) creatureEntities.set(creature.id, createCreatureEntity(world, creature));
	const mapBounds = getMapBounds(config.map);
	for (const player of [localPlayer, ...initialRemotePlayers]) {
		if (player.row < 0 || player.row >= mapBounds.rows || player.column < 0 || player.column >= mapBounds.columns) {
			throw new Error(`Player ${player.id} is outside runtime map bounds.`);
		}
	}
	const localPlayerEntity = createPlayerEntity(world, localPlayer, true);
	world.movementSequences.set(localPlayerEntity, localPlayer.sequence ?? 0);
	playerEntities.set(localPlayer.id, localPlayerEntity);
	for (const player of initialRemotePlayers) {
		const entity = createPlayerEntity(world, player, false);
		world.movementSequences.set(entity, player.sequence ?? 0);
		playerEntities.set(player.id, entity);
	}

	const localVisualPosition = world.visualPositions.get(localPlayerEntity);
	if (!localVisualPosition) throw new Error("Local Player visual position is not available.");
	const camera: Camera = { x: localVisualPosition.x, y: localVisualPosition.y + TILE_FOOTPRINT_HEIGHT, zoom: config.zoomPreference };
	let animationFrame: number | null = null;
	let disposed = false;
	let started = false;
	let fatalHandled = false;
	/** Lang: pt-BR - Referência antecipada para cleanup fatal idempotente. Lang: en-US - Forward reference for idempotent fatal cleanup. */
	let disposeRuntime = () => {};
	let zoomSaveTimer: number | null = null;
	const zoomPersistence = createZoomPersistence(config.zoomPreference, saveZoom);
	const pointer: PointerPosition = { canvasX: 0, canvasY: 0, inside: false };
	let serverTimeOffset = 0;
	const observeServerTime = (serverTime: number) => { serverTimeOffset = serverTime - performance.now(); };

	/** Lang: pt-BR - Renderiza somente um runtime iniciado e vivo. Lang: en-US - Renders only a started, live runtime. */
	const render = () => { if (started && !disposed) renderSystem.render(world, camera, performance.now()); };
	/** Lang: pt-BR - Executa um frame e encerra atomicamente após falha fatal. Lang: en-US - Runs one frame and shuts down atomically after a fatal failure. */
	const frame = (timestamp: number) => {
		animationFrame = null;
		if (!started || disposed) return;
		const completed = executeGameFrame(() => {
			updateHoverAndPath();
			movementSystem.update(world, timestamp + serverTimeOffset, timestamp);
			animationSystem.update(world, timestamp);
			cameraSystem.update(world, camera);
			walkHintSystem.update(world, localPlayerEntity, timestamp);
			renderSystem.render(world, camera, timestamp);
		}, () => {
			if (fatalHandled) return;
			fatalHandled = true;
			disposeRuntime();
		}, (error) => {
			if (fatalHandled) onFatalError(error);
		});
		if (!completed) return;
		animationFrame = window.requestAnimationFrame(frame);
	};
	/** Lang: pt-BR - Garante no máximo uma RAF pendente. Lang: en-US - Ensures at most one pending RAF. */
	const ensureAnimationFrame = () => {
		if (started && !disposed && animationFrame === null) animationFrame = window.requestAnimationFrame(frame);
	};
	/** Lang: pt-BR - Sincroniza canvas e redesenha a viewport. Lang: en-US - Synchronizes canvas and redraws the viewport. */
	const resizeAndRender = () => { resizeCanvasToViewport(surface); render(); };
	/** Lang: pt-BR - Aplica zoom limitado e persiste-o com debounce. Lang: en-US - Applies bounded zoom and persists it with debounce. */
	const zoomAndRender = (event: WheelEvent) => {
		event.preventDefault();
		const previous = camera.zoom;
		changeCameraZoom(camera, event.deltaY, config.zoom.min, config.zoom.max);
		if (camera.zoom !== previous) {
			if (zoomSaveTimer !== null) window.clearTimeout(zoomSaveTimer);
			zoomSaveTimer = window.setTimeout(() => {
				zoomSaveTimer = null;
				zoomPersistence.queue(camera.zoom);
			}, 300);
		}
		render();
	};
	/** Lang: pt-BR - Converte coordenadas CSS para coordenadas lógicas do canvas. Lang: en-US - Converts CSS coordinates into logical canvas coordinates. */
	const updatePointer = (event: PointerEvent | MouseEvent) => {
		const bounds = canvas.getBoundingClientRect();
		pointer.canvasX = (event.clientX - bounds.left) * canvas.width / bounds.width;
		pointer.canvasY = (event.clientY - bounds.top) * canvas.height / bounds.height;
		pointer.inside = true;
	};
	/** Lang: pt-BR - Localiza exclusivamente o ground Tile da célula. Lang: en-US - Locates only the cell's ground Tile. */
	const tileAt = (row: number, column: number) => [...world.tiles.keys()].find((entity) => {
		const grid = world.gridPositions.get(entity);

		return grid?.row === row && grid.column === column && world.renderables.get(entity)?.layer === 0;
	});
	/** Lang: pt-BR - Recalcula hover e preview sem enviar intenção. Lang: en-US - Recomputes hover and preview without sending intent. */
	const updateHoverAndPath = () => {
		world.pathPreviewTiles.clear();
		world.invalidHoveredTiles.clear();
		const hoveredEntity = hoverSystem.update(world, config.map, config.tileDefinitions, camera, canvas.width, canvas.height, pointer);
		canvas.style.cursor = "default";
		if (hoveredEntity === undefined || world.movingPlayers.has(localPlayerEntity)) return hoveredEntity;
		const target = world.gridPositions.get(hoveredEntity);
		const current = world.gridPositions.get(localPlayerEntity);
		if (!target || !current) return hoveredEntity;
		const path = findPath(config.map, config.tileDefinitions, current, target);
		if (!path || path.length === 0) return hoveredEntity;
		if (path.length > config.movement.maxSteps) {
			world.invalidHoveredTiles.add(hoveredEntity);

			return hoveredEntity;
		}
		for (const position of path) {
			const entity = tileAt(position.row, position.column);
			if (entity !== undefined) world.pathPreviewTiles.add(entity);
		}
		if (canSelectTile(world, config.map, config.tileDefinitions, hoveredEntity, path.length, config.movement.maxSteps, false)) canvas.style.cursor = "pointer";

		return hoveredEntity;
	};
	/** Lang: pt-BR - Limpa feedback transitório ao sair do canvas. Lang: en-US - Clears transient feedback when leaving the canvas. */
	const leaveCanvas = () => {
		pointer.inside = false;
		world.hoveredTiles.clear();
		world.invalidHoveredTiles.clear();
		world.pathPreviewTiles.clear();
		canvas.style.cursor = "default";
		render();
	};
	/** Lang: pt-BR - Envia MOVE somente após validar o destino. Lang: en-US - Sends MOVE only after validating the target. */
	const selectClickedTile = (event: MouseEvent) => {
		updatePointer(event);
		if (world.movingPlayers.has(localPlayerEntity)) return;
		const hoveredEntity = updateHoverAndPath();
		const target = hoveredEntity === undefined ? undefined : world.gridPositions.get(hoveredEntity);
		const current = world.gridPositions.get(localPlayerEntity);
		if (!target || !current) return;
		const path = findPath(config.map, config.tileDefinitions, current, target);
		if (!path || path.length === 0 || path.length > config.movement.maxSteps) return;
		if (!requestMove(target.row, target.column)) return;
		const selectedEntity = selectSystem.select(
			world, config.map, config.tileDefinitions, hoveredEntity, path.length, config.movement.maxSteps, world.movingPlayers.has(localPlayerEntity),
		);
		if (selectedEntity === undefined) return;
		world.movingPlayers.add(localPlayerEntity);
		canvas.style.cursor = "default";
		world.pathPreviewTiles.clear();
		world.invalidHoveredTiles.clear();
		walkHintSystem.reset(world);
		render();
	};
	/** Lang: pt-BR - Ao voltar visível solicita uma única fonte atual, sem replay do backlog local. Lang: en-US - On becoming visible requests one current source of truth without replaying local backlog. */
	const handleVisibilityChange = () => {
		if (!disposed && document.visibilityState === "visible") {
			canvas.style.cursor = "default";
			requestPlayersResync();
		}
	};
	/** Lang: pt-BR - Remove listeners, timers, RAF e estado ECS. Lang: en-US - Removes listeners, timers, RAF, and ECS state. */
	disposeRuntime = () => {
		if (disposed) return;
		disposed = true;
		zoomPersistence.dispose();
		window.removeEventListener("resize", resizeAndRender);
		canvas.removeEventListener("wheel", zoomAndRender);
		canvas.removeEventListener("pointermove", updatePointer);
		canvas.removeEventListener("pointerleave", leaveCanvas);
		canvas.removeEventListener("click", selectClickedTile);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		canvas.style.cursor = "default";
		if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
		if (zoomSaveTimer !== null) window.clearTimeout(zoomSaveTimer);
		animationFrame = null;
		zoomSaveTimer = null;
		playerEntities.clear();
		walkHintSystem.reset(world);
		world.clear();
	};

	return {
		getZoom() { return camera.zoom; },
		creatureMoved(message) {
			if (disposed || !isCellWalkable(config.map, config.tileDefinitions, message.row, message.column)) return;
			const entity = creatureEntities.get(message.creatureId); if (entity === undefined) return;
			observeServerTime(message.serverTime);
			enqueueMovementStep(world, entity, { ...message, column: message.column, finalStep: true });
			ensureAnimationFrame();
		},
		/** Lang: pt-BR - Expõe o cleanup idempotente. Lang: en-US - Exposes idempotent cleanup. */
		dispose() {
			disposeRuntime();
		},
		/** Lang: pt-BR - Cria ou substitui a Entity remota. Lang: en-US - Creates or replaces the remote Entity. */
		playerJoined(player) {
			if (disposed) return;
			const previousEntity = playerEntities.get(player.id);
			if (previousEntity !== undefined) world.removeEntity(previousEntity);
			const entity = createPlayerEntity(world, player, false);
			world.movementSequences.set(entity, player.sequence ?? 0);
			playerEntities.set(player.id, entity);
			render();
		},
		/** Lang: pt-BR - Remove somente o Player remoto indicado. Lang: en-US - Removes only the indicated remote Player. */
		playerLeft(playerId) {
			if (disposed || playerId === localPlayer.id) return;
			const entity = playerEntities.get(playerId);
			if (entity === undefined) return;
			playerEntities.delete(playerId);
			world.removeEntity(entity);
			render();
		},
		/** Lang: pt-BR - Enfileira apenas steps autoritativos válidos. Lang: en-US - Queues only valid authoritative steps. */
		playerMoved(message) {
			if (disposed) return;
			if (!isCellWalkable(config.map, config.tileDefinitions, message.row, message.column)) return;
			const entity = playerEntities.get(message.playerId);
			if (entity === undefined) return;
			observeServerTime(message.serverTime);
			enqueueMovementStep(world, entity, message);
			ensureAnimationFrame();
		},
		/** Lang: pt-BR - Reconcilia somente snapshots monotonicamente atuais. Lang: en-US - Reconciles only monotonically current snapshots. */
		playersResync(message) {
			if (disposed) return;
			observeServerTime(message.serverTime);
			for (const player of message.players) {
				const entity = playerEntities.get(player.id);
				if (entity !== undefined) reconcileMovement(world, entity, player.row, player.column, player.sequence, player.movement);
			}
			canvas.style.cursor = "default";
			ensureAnimationFrame();
		},
		/** Lang: pt-BR - Instala lifecycle e inicia uma RAF. Lang: en-US - Installs lifecycle and starts one RAF. */
		start() {
			if (disposed || started) return;
			started = true;
			walkHintSystem.reset(world);
			window.addEventListener("resize", resizeAndRender);
			canvas.addEventListener("wheel", zoomAndRender, { passive: false });
			canvas.addEventListener("pointermove", updatePointer);
			canvas.addEventListener("pointerleave", leaveCanvas);
			canvas.addEventListener("click", selectClickedTile);
			document.addEventListener("visibilitychange", handleVisibilityChange);
			resizeAndRender();
			ensureAnimationFrame();
		},
	};
}
