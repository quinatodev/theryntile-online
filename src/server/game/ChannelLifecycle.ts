export interface ClosableSocket {
	close(code?: number, reason?: string): void;
	send(data: string, callback?: (error?: Error) => void): void;
}

/**
 * Lang: pt-BR
 * Cria a proteção one-shot usada pelo bootstrap de Channels para rejeitar reinicialização process-local.
 *
 * Lang: en-US
 * Creates the one-shot guard used by Channels bootstrap to reject process-local reinitialization.
 */
export function createInitializationGuard(): () => void {
	let initialized = false;

	return () => {
		if (initialized) throw new Error("Channels have already been initialized in this process.");
		initialized = true;
	};
}

export const isValidChannelCapacity = (capacity: unknown): capacity is number => Number.isSafeInteger(capacity)
	&& Number(capacity) > 0;

/**
 * Lang: pt-BR
 * Tenta entregar a mensagem e garante um único close por callback normal ou fallback curto.
 *
 * Lang: en-US
 * Attempts message delivery and guarantees one close through either the normal callback or a short fallback.
 */
export function closeSocketAfterSend(
	socket: ClosableSocket,
	message: string,
	code: number,
	reason: string,
	delayMs = 1_000,
	schedule: typeof setTimeout = setTimeout,
	cancel: typeof clearTimeout = clearTimeout,
): void {
	let closed = false;
	const closeOnce = () => {
		if (closed) return;
		closed = true;
		cancel(timer);
		socket.close(code, reason);
	};
	const timer = schedule(closeOnce, delayMs);
	try {
		socket.send(message, closeOnce);
	} catch {
		closeOnce();
	}
}
