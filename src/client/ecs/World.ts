/**
 * Lang: pt-BR
 * Armazena somente identidades e Components do runtime visual do client.
 *
 * Lang: en-US
 * Stores only identities and Components for the client visual runtime.
 */
import {
	type AnimationComponent,
	type Entity,
	type GridPosition,
	type MovementComponent,
	type PlayerComponent,
	type RenderableComponent,
	type SpriteComponent,
	type TileComponent,
	type VisualPosition,
} from "./Components.js";

export class World {
	readonly animations = new Map<Entity, AnimationComponent>();
	readonly entities = new Set<Entity>();
	readonly gridPositions = new Map<Entity, GridPosition>();
	readonly hoveredTiles = new Set<Entity>();
	readonly hintedTiles = new Set<Entity>();
	readonly localPlayers = new Set<Entity>();
	readonly movements = new Map<Entity, MovementComponent>();
	readonly movingPlayers = new Set<Entity>();
	readonly players = new Map<Entity, PlayerComponent>();
	readonly renderables = new Map<Entity, RenderableComponent>();
	readonly selectedTiles = new Set<Entity>();
	readonly sprites = new Map<Entity, SpriteComponent>();
	readonly tiles = new Map<Entity, TileComponent>();
	readonly visualPositions = new Map<Entity, VisualPosition>();

	#nextEntity = 1;

	createEntity(): Entity {
		const entity = this.#nextEntity;
		this.#nextEntity += 1;
		this.entities.add(entity);

		return entity;
	}

	removeEntity(entity: Entity): void {
		this.entities.delete(entity);
		this.animations.delete(entity);
		this.gridPositions.delete(entity);
		this.hoveredTiles.delete(entity);
		this.hintedTiles.delete(entity);
		this.localPlayers.delete(entity);
		this.movements.delete(entity);
		this.movingPlayers.delete(entity);
		this.players.delete(entity);
		this.renderables.delete(entity);
		this.selectedTiles.delete(entity);
		this.sprites.delete(entity);
		this.tiles.delete(entity);
		this.visualPositions.delete(entity);
	}

	clear(): void {
		for (const entity of this.entities) this.removeEntity(entity);
	}
}
