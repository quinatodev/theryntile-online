import assert from "node:assert/strict";
import test from "node:test";

import { LoginSchema } from "./LoginSchema.js";

test("login boundary trims username while preserving password bytes", () => {
	assert.deepEqual(LoginSchema.parse({ username: "  theryn  ", password: "  secret  " }), {
		username: "theryn",
		password: "  secret  ",
	});
});

test("login boundary rejects empty, oversized, non-string, and additional input", () => {
	for (const input of [
		{ username: "", password: "secret" },
		{ username: "theryn", password: "" },
		{ username: "x".repeat(65), password: "secret" },
		{ username: "theryn", password: "x".repeat(129) },
		{ username: 7, password: "secret" },
		{ username: "theryn", password: "secret", accountId: 1 },
	]) assert.equal(LoginSchema.safeParse(input).success, false);
});
