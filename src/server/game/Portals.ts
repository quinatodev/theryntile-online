import { CHUNK_SIZE } from "./map/ComposeMapChunks.js";

export type PortalDestination = "singleplayer-test" | "multiplayer-test";

export interface PortalDefinition {
	id: string;
	mapId: "lobby";
	row: number;
	column: number;
	destinationMapId: PortalDestination;
	mode: "private" | "shared";
}

const SPAWN_CHUNK = { row: 1, column: 1 } as const;

const fromSpawnChunk = (id: string, localRow: number, localColumn: number, destinationMapId: PortalDestination, mode: PortalDefinition["mode"]): PortalDefinition => ({
	id,
	mapId: "lobby",
	row: SPAWN_CHUNK.row * CHUNK_SIZE + localRow,
	column: SPAWN_CHUNK.column * CHUNK_SIZE + localColumn,
	destinationMapId,
	mode,
});

/** Lang: pt-BR - Mantém coordenadas locais do editor como fonte de verdade dos portais do SPAWN. Lang: en-US - Keeps editor-local coordinates as the source of truth for SPAWN portals. */
export const PORTALS = [
	fromSpawnChunk("private-test", 3, 17, "singleplayer-test", "private"),
	fromSpawnChunk("shared-test", 2, 2, "multiplayer-test", "shared"),
] as const;

export const findPortal = (mapId: string, row: number, column: number) => PORTALS.find((portal) => portal.mapId === mapId && portal.row === row && portal.column === column);

export const authorizePortalUse = (mapId: string, row: number, column: number, requestedPortalId: string) => {
	const portal = findPortal(mapId, row, column);

	return portal?.id === requestedPortalId ? portal : undefined;
};

export const resolvePortalInstanceId = (portal: PortalDefinition, playerId: number): string => portal.mode === "private" ? `private:${playerId}` : "shared:test";

export const getRoamingCandidates = (row: number, column: number, rows: number, columns: number) => [
	{ row: row - 1, column }, { row, column: column - 1 }, { row, column: column + 1 }, { row: row + 1, column },
].filter((position) => position.row >= 0 && position.row < rows && position.column >= 0 && position.column < columns);
