import assert from "node:assert/strict";
import test from "node:test";

import { addTileEntities, createZoomPersistence, executeGameFrame, startGame } from "./Game.js";
import { World } from "../ecs/World.js";

/** Lang: pt-BR - Implementa somente o carregamento assíncrono observado por RenderSystem. Lang: en-US - Implements only the asynchronous loading observed by RenderSystem. */
class FakeImage {
	naturalHeight = 16;
	private loadListener: (() => void) | undefined;
	addEventListener(type: string, listener: () => void): void { if (type === "load") this.loadListener = listener; }
	set src(_value: string) { queueMicrotask(() => this.loadListener?.()); }
}

/** Lang: pt-BR - Cria fakes mínimos e observáveis de window, canvas, RAF e contexto. Lang: en-US - Creates minimal observable fakes for window, canvas, RAF, and context. */
const createGameHarness = () => {
	const windowListeners = new Map<string, Set<EventListener>>();
	const canvasListeners = new Map<string, Set<EventListener>>();
	const frames = new Map<number, FrameRequestCallback>();
	const cancelled: number[] = [];
	const drawCalls: unknown[][] = [];
	let nextFrame = 1;
	/** Lang: pt-BR - Registra um listener funcional no store observado. Lang: en-US - Registers a functional listener in the observed store. */
	const add = (store: Map<string, Set<EventListener>>, type: string, listener: EventListenerOrEventListenerObject) => {
		if (typeof listener !== "function") return;
		const listeners = store.get(type) ?? new Set<EventListener>();
		listeners.add(listener);
		store.set(type, listeners);
	};
	/** Lang: pt-BR - Remove do store o mesmo listener registrado. Lang: en-US - Removes the same registered listener from the store. */
	const remove = (store: Map<string, Set<EventListener>>, type: string, listener: EventListenerOrEventListenerObject) => {
		if (typeof listener === "function") store.get(type)?.delete(listener);
	};
	const context = {
		clearRect() {}, drawImage(...args: unknown[]) { drawCalls.push(args); }, imageSmoothingEnabled: false,
	} as unknown as CanvasRenderingContext2D;
	const canvas = {
		addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => add(canvasListeners, type, listener),
		getBoundingClientRect: () => ({ bottom: 360, height: 360, left: 0, right: 640, top: 0, width: 640, x: 0, y: 0, toJSON() {} }),
		getContext: () => context,
		height: 360,
		style: {},
		removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => remove(canvasListeners, type, listener),
		width: 640,
	} as unknown as HTMLCanvasElement;
	const fakeWindow = {
		addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => add(windowListeners, type, listener),
		cancelAnimationFrame: (id: number) => { cancelled.push(id); frames.delete(id); },
		clearTimeout,
		innerHeight: 360,
		innerWidth: 640,
		removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => remove(windowListeners, type, listener),
		requestAnimationFrame: (callback: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, callback);

			return id; },
		setTimeout,
	};
	const fakeDocument = {
		addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => add(windowListeners, type, listener),
		removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => remove(windowListeners, type, listener),
		visibilityState: "visible",
	};

	return { cancelled, canvas, canvasListeners, drawCalls, fakeDocument, fakeWindow, frames, windowListeners };
};

test("fatal frame failure performs cleanup, reports once, and prevents continuation", () => {
	const failure = new Error("frame failed");
	let cleanups = 0;
	const reported: unknown[] = [];
	const completed = executeGameFrame(() => { throw failure; }, () => { cleanups += 1; }, (error) => reported.push(error));
	assert.equal(completed, false);
	assert.equal(cleanups, 1);
	assert.deepEqual(reported, [failure]);
});

test("successful frame continues without cleanup or fatal notification", () => {
	let ran = 0;
	let cleanups = 0;
	let reports = 0;
	const completed = executeGameFrame(() => { ran += 1; }, () => { cleanups += 1; }, () => { reports += 1; });
	assert.equal(completed, true);
	assert.equal(ran, 1);
	assert.equal(cleanups, 0);
	assert.equal(reports, 0);
});

test("zoom persistence serializes, coalesces, deduplicates, and continues after failure", async () => {
	const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
	const calls: number[] = [];
	const completions: Array<{ reject(error: Error): void; resolve(): void }> = [];
	const persistence = createZoomPersistence(2, (zoom) => new Promise<void>((resolve, reject) => {
		calls.push(zoom);
		completions.push({ reject, resolve });
	}));

	persistence.queue(2);
	assert.deepEqual(calls, []);
	persistence.queue(2.25);
	persistence.queue(2.5);
	persistence.queue(2.75);
	assert.deepEqual(calls, [2.25]);
	completions[0]?.resolve();
	await settle();
	assert.deepEqual(calls, [2.25, 2.75]);
	const previousConsoleError = console.error;
	console.error = () => {};
	completions[1]?.reject(new Error("controlled failure"));
	persistence.queue(3);
	await settle();
	console.error = previousConsoleError;
	assert.deepEqual(calls, [2.25, 2.75, 3]);
	completions[2]?.resolve();
	await settle();
	persistence.queue(3);
	assert.deepEqual(calls, [2.25, 2.75, 3]);
	persistence.dispose();
	persistence.queue(3.25);
	assert.deepEqual(calls, [2.25, 2.75, 3]);
});

test("Game creates one Tile Entity for every non-zero runtime map cell", () => {
	const map = {
		0: Array.from({ length: 11 }, () => Array<number>(11).fill(1)),
		1: Array.from({ length: 11 }, (_, row) => Array.from(
			{ length: 11 }, (_, column) => row >= 4 && row <= 6 && column >= 4 && column <= 6 ? 101 : 0,
		)),
	};
	const world = new World();
	addTileEntities(world, {
		map, mapId: "lobby", movement: { maxSteps: 5 }, tileDefinitions: { 1: true, 101: false },
		zoom: { max: 3, min: 1 }, zoomPreference: 1, inventoryColumns: 4, inventoryPosition: null, characterPosition: null,
	});
	const expectedTextureIds = Object.values(map).flat(2).filter((tileId) => tileId !== 0);
	assert.equal(world.tiles.size, expectedTextureIds.length);
	assert.deepEqual(
		[...world.tiles.values()].map(({ textureId }) => textureId).sort((a, b) => a - b),
		[...expectedTextureIds].sort((a, b) => a - b),
	);
});

test("Game integrates JOIN, duplicate replacement, LEFT, listeners, RAF, movement queue ownership, and dispose", async () => {
	const harness = createGameHarness();
	const previousImage = globalThis.Image;
	const previousWindow = globalThis.window;
	const previousDocument = globalThis.document;
	Object.assign(globalThis, { Image: FakeImage, document: harness.fakeDocument, window: harness.fakeWindow });
	try {
		let resyncRequests = 0;
		const savedZooms: number[] = [];
		const game = await startGame(
			harness.canvas,
			{ id: 1, name: "Local", row: 0, column: 0 },
			[{ id: 2, name: "Remote A", row: 0, column: 0 }],
			() => true,
			{ map: { 0: [[1]] }, mapId: "test", movement: { maxSteps: 2 }, tileDefinitions: { 1: true }, zoom: { max: 2, min: 1 }, zoomPreference: 1, inventoryColumns: 4, inventoryPosition: null, characterPosition: null },
			async (zoom) => { savedZooms.push(zoom); },
			() => {},
			() => { resyncRequests += 1;

				return true; },
		);
		game.start();
		assert.equal([...harness.windowListeners.values()].reduce((count, listeners) => count + listeners.size, 0), 2);
		assert.equal([...harness.canvasListeners.values()].reduce((count, listeners) => count + listeners.size, 0), 4);
		assert.equal(harness.frames.size, 1);
		const wheel = [...harness.canvasListeners.get("wheel") ?? []][0];
		assert.ok(wheel);
		wheel({ deltaY: -120, preventDefault() {} } as WheelEvent);
		wheel({ deltaY: -1, preventDefault() {} } as WheelEvent);
		await new Promise((resolve) => setTimeout(resolve, 350));
		assert.deepEqual(savedZooms, [1.5]);
		wheel({ deltaY: 80, preventDefault() {} } as WheelEvent);
		await new Promise((resolve) => setTimeout(resolve, 350));
		assert.deepEqual(savedZooms, [1.5, 1.25]);
		for (const listener of harness.windowListeners.get("visibilitychange") ?? []) listener(new Event("visibilitychange"));
		assert.equal(resyncRequests, 1);

		harness.drawCalls.length = 0;
		game.playerJoined({ id: 3, name: "Remote B", row: 0, column: 0 });
		assert.equal(harness.drawCalls.length, 4);
		harness.drawCalls.length = 0;
		game.playerJoined({ id: 3, name: "Remote B replacement", row: 0, column: 0 });
		assert.equal(harness.drawCalls.length, 4);
		harness.drawCalls.length = 0;
		game.playerLeft(2);
		assert.equal(harness.drawCalls.length, 3);
		game.playerMoved({ playerId: 3, fromRow: 0, fromColumn: 0, row: 0, column: 0, sequence: 1, startedAt: 0, endsAt: 500, serverTime: 0, finalStep: true });

		const scheduled = [...harness.frames.entries()][0];
		assert.ok(scheduled);
		game.dispose();
		assert.equal(harness.canvas.style.cursor, "default");
		assert.equal(harness.frames.size, 0);
		assert.deepEqual(harness.cancelled, [scheduled[0]]);
		assert.equal([...harness.windowListeners.values()].every((listeners) => listeners.size === 0), true);
		assert.equal([...harness.canvasListeners.values()].every((listeners) => listeners.size === 0), true);
		scheduled[1](1_000);
		assert.equal(harness.frames.size, 0);
		game.playerJoined({ id: 4, name: "After dispose", row: 0, column: 0 });
		assert.equal(harness.frames.size, 0);
	} finally {
		Object.assign(globalThis, { Image: previousImage, document: previousDocument, window: previousWindow });
	}
});
