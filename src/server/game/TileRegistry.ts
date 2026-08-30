const tileWalkability = new Map<number, boolean>();

const assertTileId = (id: number): void => {
	if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Tile ID ${id} must be a positive safe integer.`);
};

export const registerTile = (id: number, walkable: boolean): void => {
	assertTileId(id);
	if (typeof walkable !== "boolean") throw new Error("Tile walkability must be boolean.");
	tileWalkability.set(id, walkable);
};

export const registerTiles = (startId: number, endId: number, walkable: boolean): void => {
	assertTileId(startId);
	assertTileId(endId);
	if (startId > endId) throw new Error("Tile range startId must be less than or equal to endId.");
	if (typeof walkable !== "boolean") throw new Error("Tile walkability must be boolean.");
	for (let id = startId; id <= endId; id += 1) tileWalkability.set(id, walkable);
};

export const isTileWalkable = (id: number): boolean => {
	assertTileId(id);
	const walkable = tileWalkability.get(id);
	if (walkable === undefined) throw new Error(`Tile ${id} is not registered.`);

	return walkable;
};

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
