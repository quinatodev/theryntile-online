import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";
import eslint from "@eslint/js";
import json from "@eslint/json";
import perfectionist from "eslint-plugin-perfectionist";

import { defineConfig } from "eslint/config";

const commonRules = {
	"@stylistic/indent": ["error", "tab"],
	"@stylistic/quotes": ["error", "double"],
	"@stylistic/semi": ["error", "always"],

	"@stylistic/object-curly-spacing": ["error", "always"],
	"@stylistic/array-bracket-spacing": ["error", "never"],
	"@stylistic/space-infix-ops": "error",
	"@stylistic/keyword-spacing": "error",
	"@stylistic/space-before-blocks": "error",
	"@stylistic/eol-last": ["error", "always"],

	"@stylistic/comma-spacing": [
		"error",
		{
			before: false,
			after: true,
		},
	],

	"@stylistic/no-multiple-empty-lines": [
		"error",
		{
			max: 1,
			maxBOF: 0,
			maxEOF: 0,
		},
	],

	"@stylistic/padding-line-between-statements": [
		"error",
		{
			blankLine: "always",
			prev: "import",
			next: "*",
		},
		{
			blankLine: "any",
			prev: "import",
			next: "import",
		},
		{
			blankLine: "always",
			prev: "*",
			next: "return",
		},
	],

	"perfectionist/sort-imports": [
		"error",
		{
			type: "unsorted",
			groups: [
				"default-import",
				{
					newlinesBetween: 1,
				},
				"named-import",
				"side-effect-import",
				"wildcard-import",
				"type-import",
				"unknown",
			],
		},
	],
};

export default defineConfig(
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"package-lock.json",
		],
	},

	{
		files: ["**/*.{js,mjs}"],

		...eslint.configs.recommended,

		plugins: {
			"@stylistic": stylistic,
			perfectionist,
		},

		rules: {
			...eslint.configs.recommended.rules,
			...commonRules,
		},
	},

	{
		files: ["**/*.ts"],

		extends: [
			eslint.configs.recommended,
			...tseslint.configs.recommended,
		],

		plugins: {
			"@stylistic": stylistic,
			perfectionist,
		},

		rules: {
			...commonRules,
		},
	},

	{
		files: ["**/*.json"],

		plugins: {
			json,
		},

		language: "json/json",

		rules: {
			"json/no-duplicate-keys": "error",
			"json/no-empty-keys": "error",
		},
	},

	{
		files: [".vscode/*.json"],

		plugins: {
			json,
		},

		language: "json/jsonc",

		rules: {
			"json/no-duplicate-keys": "error",
			"json/no-empty-keys": "error",
		},
	},
);
