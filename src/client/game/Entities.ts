import { type Entity, type PlayerSnapshot } from "../ecs/Components.js";
import { PLAYER_LAYER, PLAYER_ORDER } from "../ecs/systems/RenderSystem.js";
import { type World } from "../ecs/World.js";
import { gridToIsometric } from "../engine/Isometric.js";

const TILE_WIDTH = 32;
const TILE_FOOTPRINT_HEIGHT = 16;
const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 48;

export function createCreatureEntity(world: World, creature: { id: string; species: "stag"; row: number; column: number; sequence?: number }): Entity {
	const entity = world.createEntity();
	world.creatures.set(entity, { id: creature.id, species: creature.species });
	world.gridPositions.set(entity, { row: creature.row, column: creature.column });
	world.visualPositions.set(entity, gridToIsometric(creature.column, creature.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT));
	world.animations.set(entity, { direction: "left_down", frame: 0, frameCounts: { idle: 24, walk: 11 }, state: "idle" });
	world.renderables.set(entity, { layer: PLAYER_LAYER, order: PLAYER_ORDER - 1 });
	world.sprites.set(entity, { feetOffsetY: TILE_FOOTPRINT_HEIGHT, frameHeight: 48, frameWidth: 32, offsetX: 0, offsetY: 0 });
	world.movementSequences.set(entity, creature.sequence ?? 0);

	return entity;
}

export function createPortalEntity(world: World, portal: { id: string; row: number; column: number }): Entity {
	const entity = world.createEntity();
	world.portals.set(entity, { id: portal.id, frameWidth: 32, frameHeight: 32, frameCount: 6 });
	world.gridPositions.set(entity, { row: portal.row, column: portal.column });
	world.renderables.set(entity, { layer: 0, order: 2 });

	return entity;
}

/**
 * Lang: pt-BR
 * Cria uma Player Entity com todos os Components obrigatórios do runtime visual atual.
 *
 * Lang: en-US
 * Creates a Player Entity with every Component required by the current visual runtime.
 */
export function createPlayerEntity(world: World, player: PlayerSnapshot, local: boolean): Entity {
	const entity = world.createEntity();
	const visualPosition = gridToIsometric(player.column, player.row, TILE_WIDTH, TILE_FOOTPRINT_HEIGHT);
	world.animations.set(entity, { direction: "left_down", frame: 0, state: "idle" });
	world.gridPositions.set(entity, { column: player.column, row: player.row });
	world.players.set(entity, { id: player.id, name: player.name });
	world.renderables.set(entity, { layer: PLAYER_LAYER, order: PLAYER_ORDER });
	world.sprites.set(entity, {
		feetOffsetY: TILE_FOOTPRINT_HEIGHT,
		frameHeight: PLAYER_FRAME_HEIGHT,
		frameWidth: PLAYER_FRAME_WIDTH,
		offsetX: 0,
		offsetY: 0,
	});
	world.visualPositions.set(entity, visualPosition);
	if (local) world.localPlayers.add(entity);

	return entity;
}

/**
 * Lang: pt-BR
 * Cria uma Tile Entity com grid, textura e configuração estrutural de render da layer informada.
 *
 * Lang: en-US
 * Creates a Tile Entity with grid, texture, and structural render configuration for the supplied layer.
 */
export function createTileEntity(world: World, row: number, column: number, layer: number, textureId: number): Entity {
	const entity = world.createEntity();
	world.gridPositions.set(entity, { column, row });
	world.renderables.set(entity, { layer, order: 0 });
	world.tiles.set(entity, { textureId });

	return entity;
}
