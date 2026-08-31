/**
 * Lang: pt-BR
 * Possui o lock mínimo com timer das rotas autoritativas, indexado pelo socket owner.
 * begin impede rotas concorrentes; cancel/clear encerram timers no fim da rota e no cleanup de lifecycle.
 *
 * Lang: en-US
 * Owns the minimal timer-backed authoritative-route lock indexed by its socket owner.
 * begin prevents concurrent routes; cancel/clear stop timers at route completion and lifecycle cleanup.
 */
export class RouteState<Owner extends object> {
	private readonly timers = new Map<Owner, ReturnType<typeof setTimeout> | undefined>();

	/** Lang: pt-BR - Adquire o lock se o owner estiver livre. Lang: en-US - Acquires the lock when the owner is free. */
	begin(owner: Owner): boolean {
		if (this.timers.has(owner)) return false;
		this.timers.set(owner, undefined);

		return true;
	}

	/** Lang: pt-BR - Informa se o owner possui rota ativa. Lang: en-US - Reports whether the owner has an active route. */
	has(owner: Owner): boolean {
		return this.timers.has(owner);
	}

	/** Lang: pt-BR - Vincula o timer somente a um lock existente. Lang: en-US - Attaches a timer only to an existing lock. */
	setTimer(owner: Owner, timer: ReturnType<typeof setTimeout>): void {
		if (this.timers.has(owner)) this.timers.set(owner, timer);
	}

	/** Lang: pt-BR - Cancela timer e libera o owner. Lang: en-US - Cancels the timer and releases the owner. */
	cancel(owner: Owner): void {
		const timer = this.timers.get(owner);
		if (timer) clearTimeout(timer);
		this.timers.delete(owner);
	}

	/** Lang: pt-BR - Libera todos os locks e timers. Lang: en-US - Releases every lock and timer. */
	clear(): void {
		for (const owner of this.timers.keys()) this.cancel(owner);
	}
}
