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

	begin(owner: Owner): boolean {
		if (this.timers.has(owner)) return false;
		this.timers.set(owner, undefined);

		return true;
	}

	has(owner: Owner): boolean {
		return this.timers.has(owner);
	}

	setTimer(owner: Owner, timer: ReturnType<typeof setTimeout>): void {
		if (this.timers.has(owner)) this.timers.set(owner, timer);
	}

	cancel(owner: Owner): void {
		const timer = this.timers.get(owner);
		if (timer) clearTimeout(timer);
		this.timers.delete(owner);
	}

	clear(): void {
		for (const owner of this.timers.keys()) this.cancel(owner);
	}
}
