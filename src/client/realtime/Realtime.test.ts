import assert from "node:assert/strict";
import test from "node:test";

import { createRealtime } from "./Realtime.js";

/**
 * Lang: pt-BR
 * Simula somente o lifecycle necessário para verificar ownership e reconexão sem infraestrutura externa.
 *
 * Lang: en-US
 * Simulates only the lifecycle required to verify ownership and reconnection without external infrastructure.
 */
class FakeWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static instances: FakeWebSocket[] = [];
	readonly listeners = new Map<string, Array<(event: Event) => void>>();
	readyState = FakeWebSocket.OPEN;

	constructor() {
		FakeWebSocket.instances.push(this);
	}

	addEventListener(type: string, listener: (event: Event) => void): void {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	close(): void {
		this.readyState = 3;
		this.emit("close");
	}

	emit(type: string): void {
		for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
	}

	send(): void {}
}

const callbacks = {
	onChannelsState() {},
	onChannelPopulation() {},
	onDisconnected() {},
	onEnterChannelRejected() {},
	onEnterChannelSuccess() {},
	onPlayerJoined() {},
	onPlayerLeft() {},
	onPlayerMoved() {},
	onSessionReplaced() {},
	onSessionRevoked() {},
	onUnauthenticated() {},
};

test("an in-flight reconnect cannot reopen after explicit close", async () => {
	const originalFetch = globalThis.fetch;
	const originalWebSocket = globalThis.WebSocket;
	const originalWindow = globalThis.window;
	let reconnect: (() => Promise<void>) | undefined;
	let resolveFetch: ((response: Response) => void) | undefined;

	try {
		FakeWebSocket.instances = [];
		globalThis.window = {
			clearTimeout() {},
			location: { host: "localhost", protocol: "http:" },
			setTimeout(callback: TimerHandler) {
				reconnect = callback as () => Promise<void>;

				return 1;
			},
		} as unknown as Window & typeof globalThis;
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		globalThis.fetch = () => new Promise<Response>((resolve) => { resolveFetch = resolve; });

		const realtime = createRealtime(callbacks);
		realtime.connect();
		FakeWebSocket.instances[0]?.emit("close");
		const pendingReconnect = reconnect?.();
		realtime.close();
		resolveFetch?.({ ok: true, status: 200 } as Response);
		await pendingReconnect;

		assert.equal(FakeWebSocket.instances.length, 1);
	} finally {
		globalThis.fetch = originalFetch;
		globalThis.WebSocket = originalWebSocket;
		globalThis.window = originalWindow;
	}
});

test("an enabled realtime reconnects after session validation", async () => {
	const originalFetch = globalThis.fetch;
	const originalWebSocket = globalThis.WebSocket;
	const originalWindow = globalThis.window;
	let reconnect: (() => Promise<void>) | undefined;

	try {
		FakeWebSocket.instances = [];
		globalThis.window = {
			clearTimeout() {},
			location: { host: "localhost", protocol: "http:" },
			setTimeout(callback: TimerHandler) {
				reconnect = callback as () => Promise<void>;

				return 1;
			},
		} as unknown as Window & typeof globalThis;
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		globalThis.fetch = async () => ({ ok: true, status: 200 }) as Response;

		const realtime = createRealtime(callbacks);
		realtime.connect();
		FakeWebSocket.instances[0]?.emit("close");
		await reconnect?.();

		assert.equal(FakeWebSocket.instances.length, 2);
		realtime.close();
	} finally {
		globalThis.fetch = originalFetch;
		globalThis.WebSocket = originalWebSocket;
		globalThis.window = originalWindow;
	}
});
