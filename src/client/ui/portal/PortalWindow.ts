export class PortalWindow {
	readonly element: HTMLDivElement;
	private portalId: string | null = null;
	private readonly confirmButton: HTMLButtonElement;

	constructor(private readonly onConfirm: (portalId: string) => boolean) {
		this.element = document.createElement("div");
		this.element.className = "portal-window";
		this.element.hidden = true;
		const title = document.createElement("h2"); title.textContent = "Portal";
		const message = document.createElement("p"); message.textContent = "Deseja atravessar este portal?";
		this.confirmButton = document.createElement("button"); this.confirmButton.type = "button"; this.confirmButton.textContent = "Entrar";
		const decline = document.createElement("button"); decline.type = "button"; decline.textContent = "Agora não";
		this.confirmButton.addEventListener("click", this.confirm);
		decline.addEventListener("click", this.close);
		this.element.append(title, message, this.confirmButton, decline);
	}

	private readonly confirm = () => {
		if (this.portalId && this.onConfirm(this.portalId)) { this.confirmButton.disabled = true; this.element.hidden = true; }
	};
	private readonly close = () => { this.element.hidden = true; };
	show(portalId: string): void { this.portalId = portalId; this.confirmButton.disabled = false; this.element.hidden = false; }
	dispose(): void { this.element.remove(); }
}
