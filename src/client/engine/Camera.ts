/**
 * Lang: pt-BR
 * Estado puramente visual usado para enquadrar e ampliar o mundo no canvas.
 *
 * Lang: en-US
 * Purely visual state used to frame and zoom the world on the canvas.
 */
export const ZOOM_LEVELS = [1, 2, 3] as const;

export interface Camera { x: number; y: number; zoom: number; }

/**
 * Lang: pt-BR
 * Move o zoom para o nível permitido adjacente e limita a mutação aos extremos configurados.
 *
 * Lang: en-US
 * Moves zoom to the adjacent allowed level and clamps the mutation to the configured bounds.
 */
export function changeCameraZoom(camera: Camera, wheelDelta: number): void {
	const currentIndex = ZOOM_LEVELS.indexOf(camera.zoom as typeof ZOOM_LEVELS[number]);
	const index = currentIndex === -1 ? 0 : currentIndex;
	const nextIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + (wheelDelta > 0 ? -1 : 1)));

	camera.zoom = ZOOM_LEVELS[nextIndex] ?? 1;
}
