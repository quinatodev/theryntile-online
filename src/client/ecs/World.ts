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
	type MovementStep,
	type PlayerComponent,
	type RenderableComponent,
	type SpriteComponent,
	type TileComponent,
	type VisualPosition,
} from "./Components.js";
import { CLIENT_CONFIG } from "../game/ClientConfig.js";

/**
 * Lang: pt-BR
 * Mantém o armazenamento ECS do client e garante remoção integral de Components por Entity.
 *
 * Lang: en-US
 * Owns client ECS storage and guarantees complete Component removal for each Entity.
 */
export class World {
	readonly animations = new Map<Entity, AnimationComponent>();
	readonly entities = new Set<Entity>();
	readonly gridPositions = new Map<Entity, GridPosition>();
	readonly hoveredTiles = new Set<Entity>();
	readonly hintedTiles = new Set<Entity>();
	readonly hintedTileAlphas = new Map<Entity, number>();
	readonly localPlayers = new Set<Entity>();
	readonly movements = new Map<Entity, MovementComponent>();
	readonly movementQueues = new Map<Entity, MovementStep[]>();
	readonly movementSequences = new Map<Entity, number>();
	readonly movingPlayers = new Set<Entity>();
	readonly invalidHoveredTiles = new Set<Entity>();
	readonly pathPreviewTiles = new Set<Entity>();
	readonly players = new Map<Entity, PlayerComponent>();
	readonly renderables = new Map<Entity, RenderableComponent>();
	readonly selectedTiles = new Set<Entity>();
	readonly sprites = new Map<Entity, SpriteComponent>();
	readonly tiles = new Map<Entity, TileComponent>();
	readonly visualPositions = new Map<Entity, VisualPosition>();
	walkHintAlpha: number = CLIENT_CONFIG.hints.maxAlpha;

	#nextEntity = 1;

	/** Lang: pt-BR - Aloca uma identidade monotônica. Lang: en-US - Allocates a monotonic identity. */
	createEntity(): Entity {
		const entity = this.#nextEntity;
		this.#nextEntity += 1;
		this.entities.add(entity);

		return entity;
	}

	/** Lang: pt-BR - Remove a Entity de todos os stores. Lang: en-US - Removes the Entity from every store. */
	removeEntity(entity: Entity): void {
		this.entities.delete(entity);
		this.animations.delete(entity);
		this.gridPositions.delete(entity);
		this.hoveredTiles.delete(entity);
		this.hintedTiles.delete(entity);
		this.hintedTileAlphas.delete(entity);
		this.localPlayers.delete(entity);
		this.movements.delete(entity);
		this.movementQueues.delete(entity);
		this.movementSequences.delete(entity);
		this.movingPlayers.delete(entity);
		this.invalidHoveredTiles.delete(entity);
		this.pathPreviewTiles.delete(entity);
		this.players.delete(entity);
		this.renderables.delete(entity);
		this.selectedTiles.delete(entity);
		this.sprites.delete(entity);
		this.tiles.delete(entity);
		this.visualPositions.delete(entity);
	}

	/** Lang: pt-BR - Esvazia o World sem deixar Components órfãos. Lang: en-US - Empties the World without orphaned Components. */
	clear(): void {
		for (const entity of this.entities) this.removeEntity(entity);
	}
}
