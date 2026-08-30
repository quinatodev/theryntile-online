import assert from "node:assert/strict";
import test from "node:test";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Newbie } from "../../server/game/map/Newbie.js";
import { isTileWalkable } from "../../server/game/TileRegistry.js";
import { getMapTileIds, getTileTextureSource } from "./Map.js";

const EXPECTED_DIRECTORIES: Readonly<Record<number, string>> = {
	1: "grass",
	101: "ice",
	201: "sand",
	301: "grass",
	501: "rock",
	901: "decorations",
};

test("every Tile used by Newbie is registered and resolves to an existing exact-case asset", () => {
	for (const tileId of getMapTileIds(Newbie)) {
		assert.doesNotThrow(() => isTileWalkable(tileId));
		const source = getTileTextureSource(tileId);
		assert.equal(existsSync(resolve("public", source.slice(1))), true, `Missing asset for Tile ${tileId}: ${source}`);
	}
});

test("sparse Tile families resolve deterministically without cache-key collisions", () => {
	const sources = Object.entries(EXPECTED_DIRECTORIES).map(([rawId, directory]) => {
		const tileId = Number(rawId);
		const source = getTileTextureSource(tileId);
		assert.equal(source, `/assets/textures/tiles/${directory}/tile${tileId}.png`);

		return source;
	});
	assert.equal(new Set(sources).size, sources.length);
});

test("unmapped and invalid Tile IDs fail explicitly instead of using a fallback", () => {
	assert.throws(() => getTileTextureSource(600), /No texture directory.*600/);
	assert.throws(() => getTileTextureSource(0), /Invalid Tile ID.*0/);
});
