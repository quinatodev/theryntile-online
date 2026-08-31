const tileWalkability = new Map<number, boolean>();

/** Lang: pt-BR - Rejeita IDs incapazes de identificar Tiles persistentes. Lang: en-US - Rejects IDs unsuitable for persistent Tile identity. */
const assertTileId = (id: number): void => {
	if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Tile ID ${id} must be a positive safe integer.`);
};

/** Lang: pt-BR - Registra a walkability autoritativa de um Tile. Lang: en-US - Registers authoritative Tile walkability. */
export const registerTile = (id: number, walkable: boolean): void => {
	assertTileId(id);
	if (typeof walkable !== "boolean") throw new Error("Tile walkability must be boolean.");
	tileWalkability.set(id, walkable);
};

/** Lang: pt-BR - Registra um intervalo inclusivo de Tiles. Lang: en-US - Registers an inclusive Tile range. */
export const registerTiles = (startId: number, endId: number, walkable: boolean): void => {
	assertTileId(startId);
	assertTileId(endId);
	if (startId > endId) throw new Error("Tile range startId must be less than or equal to endId.");
	if (typeof walkable !== "boolean") throw new Error("Tile walkability must be boolean.");
	for (let id = startId; id <= endId; id += 1) tileWalkability.set(id, walkable);
};

/** Lang: pt-BR - Consulta walkability e falha para Tile desconhecido. Lang: en-US - Reads walkability and fails for an unknown Tile. */
export const isTileWalkable = (id: number): boolean => {
	assertTileId(id);
	const walkable = tileWalkability.get(id);
	if (walkable === undefined) throw new Error(`Tile ${id} is not registered.`);

	return walkable;
};

/** Lang: pt-BR - Expõe snapshot serializável do Registry. Lang: en-US - Exposes a serializable Registry snapshot. */
export const getTileDefinitions = (): Readonly<Record<number, boolean>> => Object.fromEntries(tileWalkability);

registerTile(1, true);
registerTile(501, true);

registerTiles(201, 211, true);

registerTiles(101, 105, false);
registerTiles(212, 224, false);
registerTiles(301, 315, false);
registerTiles(401, 418, false);
registerTiles(502, 517, false);
registerTiles(901, 920, false);
