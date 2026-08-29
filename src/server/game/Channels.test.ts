import assert from "node:assert/strict";
import test from "node:test";

import { closeSocketAfterSend, createInitializationGuard, isValidChannelCapacity } from "./ChannelLifecycle.js";

test("Channels initialization guard accepts the first claim and rejects the second", () => {
	const claim = createInitializationGuard();
	claim();
	assert.throws(() => claim(), /already been initialized/);
});

test("channel capacity accepts positive safe integers only", () => {
	assert.equal(isValidChannelCapacity(1), true);
	assert.equal(isValidChannelCapacity(100), true);
	assert.equal(isValidChannelCapacity(0), false);
	assert.equal(isValidChannelCapacity(-1), false);
	assert.equal(isValidChannelCapacity(1.5), false);
});

test("socket send callback closes once and cancels its fallback", () => {
	let callback: (() => void) | undefined;
	let fallback: (() => void) | undefined;
	let cancelled = 0;
	let closes = 0;
	const socket = {
		close() { closes += 1; },
		send(_data: string, next?: () => void) { callback = next; },
	};
	closeSocketAfterSend(socket, "message", 4001, "reason", 10, ((next: () => void) => {
		fallback = next;

		return 1;
	}) as typeof setTimeout, (() => { cancelled += 1; }) as typeof clearTimeout);
	callback?.();
	fallback?.();
	assert.equal(closes, 1);
	assert.equal(cancelled, 1);
});

test("socket fallback closes once when send callback is absent or late", () => {
	let callback: (() => void) | undefined;
	let fallback: (() => void) | undefined;
	let closes = 0;
	const socket = {
		close() { closes += 1; },
		send(_data: string, next?: () => void) { callback = next; },
	};
	closeSocketAfterSend(socket, "message", 4002, "reason", 10, ((next: () => void) => {
		fallback = next;

		return 1;
	}) as typeof setTimeout, (() => {}) as typeof clearTimeout);
	fallback?.();
	callback?.();
	assert.equal(closes, 1);
});
