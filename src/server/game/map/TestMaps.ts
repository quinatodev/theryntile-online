import { type MapDefinition } from "../Map.js";

const createPlainMap = (): MapDefinition => ({
	0: Array.from({ length: 10 }, () => Array<number>(10).fill(1)),
});

export const SingleplayerTest = createPlainMap();
export const MultiplayerTest = createPlainMap();
