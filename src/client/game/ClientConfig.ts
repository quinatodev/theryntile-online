/**
 * Lang: pt-BR
 * Centraliza somente valores visuais client-side deliberadamente ajustáveis; não contém autoridade de gameplay.
 *
 * Lang: en-US
 * Centralizes only deliberately adjustable client-side visual values; it contains no gameplay authority.
 */
export const CLIENT_CONFIG = {
	culling: {
		marginPixels: 0,
	},
	hints: {
		delayMs: 500,
		fadeDurationMs: 1000,
		fadeInDurationMs: 100,
		maxAlpha: 1,
		ringIntervalMs: 150,
	},
	interaction: {
		hintColor: "20, 251, 255",
		hoverColor: "rgba(15, 198, 239, 0.68)",
		invalidHoverColor: "rgba(225, 48, 48, 0.72)",
		pathPreviewColor: "rgba(49, 170, 238, 0.42)",
		selectedColor: "rgba(20, 251, 255, 0.7)",
	},
} as const;
