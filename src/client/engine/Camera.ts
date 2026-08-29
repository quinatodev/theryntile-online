/**
 * Lang: pt-BR
 * Estado puramente visual usado para enquadrar e ampliar o mundo no canvas.
 *
 * Lang: en-US
 * Purely visual state used to frame and zoom the world on the canvas.
 */
export interface Camera { x: number; y: number; zoom: number; }

/**
 * Lang: pt-BR
 * Move o zoom para o nível permitido adjacente e limita a mutação aos extremos configurados.
 *
 * Lang: en-US
 * Moves zoom to the adjacent allowed level and clamps the mutation to the configured bounds.
 */
export function changeCameraZoom(camera: Camera, wheelDelta: number, min: number, max: number): void {
	const direction = wheelDelta > 0 ? -1 : 1;
	camera.zoom = Math.max(min, Math.min(max, Math.round(camera.zoom) + direction));
}
