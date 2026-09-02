const LOCKED_SLOT_COUNT = 1;
const MAXIMUM_COLUMNS = 6;
const MINIMUM_COLUMNS = 4;
const NORMAL_SLOT_COUNT = 16;
const GRID_SLOT_SOURCE = "/assets/textures/hud/generals/grid_36.png";
const LOCKED_GRID_SLOT_SOURCE = "/assets/textures/hud/generals/grid_36_plus.png";

export interface InventoryPosition {
	x: number;
	y: number;
}

interface BackpackOptions {
	initialColumns: number;
	initialPosition: InventoryPosition | null;
	onColumnsChange: (columns: number) => void;
	onPositionChange: (position: InventoryPosition) => void;
}

export class Backpack {
	readonly content: HTMLDivElement;
	readonly element: HTMLElement;
	private readonly closeButton: HTMLButtonElement;
	private columns: number;
	private readonly decreaseColumnsButton: HTMLButtonElement;
	private readonly header: HTMLElement;
	private readonly headerActions: HTMLDivElement;
	private readonly increaseColumnsButton: HTMLButtonElement;
	private dragOffsetX = 0;
	private dragOffsetY = 0;
	private dragStartX = 0;
	private dragStartY = 0;
	private draggingPointerId: number | null = null;
	private hasExplicitPosition = false;
	private isOpen = false;
	private readonly initialPosition: InventoryPosition | null;
	private readonly onColumnsChange: (columns: number) => void;
	private readonly onPositionChange: (position: InventoryPosition) => void;
	private readonly closeFromButton = (): void => {
		this.close();
	};
	private readonly decreaseColumns = (): void => {
		this.changeColumns(this.columns - 1);
	};
	private readonly increaseColumns = (): void => {
		this.changeColumns(this.columns + 1);
	};
	private readonly keepHeaderActionsOutOfDrag = (event: PointerEvent): void => {
		event.stopPropagation();
	};
	private readonly keepInsideViewportAfterResize = (): void => {
		if (!this.hasExplicitPosition || this.element.hidden) return;
		this.keepInsideViewport();
	};
	private readonly moveWhileDragging = (event: PointerEvent): void => {
		if (event.pointerId !== this.draggingPointerId) return;
		this.placeInsideViewport(
			event.clientX - this.dragOffsetX,
			event.clientY - this.dragOffsetY,
		);
	};
	private readonly startDragging = (event: PointerEvent): void => {
		if (event.button !== 0 || this.draggingPointerId !== null) return;
		const bounds = this.element.getBoundingClientRect();
		this.dragOffsetX = event.clientX - bounds.left;
		this.dragOffsetY = event.clientY - bounds.top;
		this.dragStartX = Math.round(bounds.left);
		this.dragStartY = Math.round(bounds.top);
		this.draggingPointerId = event.pointerId;
		this.hasExplicitPosition = true;
		this.element.style.position = "fixed";
		this.element.style.right = "auto";
		this.element.style.bottom = "auto";
		this.placeInsideViewport(bounds.left, bounds.top);
		this.element.classList.add("backpack--dragging");
		this.header.setPointerCapture(event.pointerId);
	};
	private readonly stopDragging = (event?: PointerEvent): void => {
		if (event && event.pointerId !== this.draggingPointerId) return;
		const pointerId = this.draggingPointerId;
		if (pointerId === null) return;
		this.draggingPointerId = null;
		this.element.classList.remove("backpack--dragging");
		if (this.header.hasPointerCapture(pointerId)) {
			this.header.releasePointerCapture(pointerId);
		}
		if (event) {
			const bounds = this.element.getBoundingClientRect();
			const position = { x: Math.round(bounds.left), y: Math.round(bounds.top) };
			if (position.x !== this.dragStartX || position.y !== this.dragStartY) this.onPositionChange(position);
		}
	};

	constructor(options: BackpackOptions) {
		this.columns = options.initialColumns;
		this.initialPosition = options.initialPosition;
		this.onColumnsChange = options.onColumnsChange;
		this.onPositionChange = options.onPositionChange;
		this.element = document.createElement("section");
		this.element.className = "backpack";
		this.element.hidden = true;
		this.element.setAttribute("aria-label", "Inventário");
		this.header = document.createElement("header");
		this.header.className = "backpack__header";
		const title = document.createElement("span");
		title.className = "backpack__title";
		title.textContent = "Inventário";
		this.headerActions = document.createElement("div");
		this.headerActions.className = "backpack__header-actions";
		this.decreaseColumnsButton = document.createElement("button");
		this.decreaseColumnsButton.className = "backpack__width-control";
		this.decreaseColumnsButton.type = "button";
		this.decreaseColumnsButton.setAttribute("aria-label", "Diminuir largura do inventário");
		this.decreaseColumnsButton.textContent = "−";
		this.increaseColumnsButton = document.createElement("button");
		this.increaseColumnsButton.className = "backpack__width-control";
		this.increaseColumnsButton.type = "button";
		this.increaseColumnsButton.setAttribute("aria-label", "Aumentar largura do inventário");
		this.increaseColumnsButton.textContent = "+";
		this.closeButton = document.createElement("button");
		this.closeButton.className = "backpack__close";
		this.closeButton.type = "button";
		this.closeButton.setAttribute("aria-label", "Fechar inventário");
		this.closeButton.textContent = "×";
		this.headerActions.append(this.decreaseColumnsButton, this.increaseColumnsButton, this.closeButton);
		this.header.append(title, this.headerActions);
		this.content = document.createElement("div");
		this.content.className = "backpack__content";
		const viewport = document.createElement("div");
		viewport.className = "backpack__viewport";
		const slots = document.createElement("div");
		slots.className = "backpack__slots";
		for (let index = 0; index < NORMAL_SLOT_COUNT + LOCKED_SLOT_COUNT; index += 1) {
			const slot = document.createElement("img");
			slot.alt = "";
			slot.className = "backpack__slot";
			slot.draggable = false;
			slot.src = index < NORMAL_SLOT_COUNT ? GRID_SLOT_SOURCE : LOCKED_GRID_SLOT_SOURCE;
			slots.append(slot);
		}
		viewport.append(slots);
		this.content.append(viewport);
		this.element.append(this.header, this.content);
		this.applyColumns();
		this.closeButton.addEventListener("click", this.closeFromButton);
		this.decreaseColumnsButton.addEventListener("click", this.decreaseColumns);
		this.increaseColumnsButton.addEventListener("click", this.increaseColumns);
		this.headerActions.addEventListener("pointerdown", this.keepHeaderActionsOutOfDrag);
		this.header.addEventListener("pointerdown", this.startDragging);
		this.header.addEventListener("pointermove", this.moveWhileDragging);
		this.header.addEventListener("pointerup", this.stopDragging);
		this.header.addEventListener("pointercancel", this.stopDragging);
		window.addEventListener("resize", this.keepInsideViewportAfterResize);
	}

	open(): void {
		this.isOpen = true;
		this.element.hidden = false;
		if (!this.hasExplicitPosition && this.initialPosition) {
			this.hasExplicitPosition = true;
			this.element.style.position = "fixed";
			this.element.style.right = "auto";
			this.element.style.bottom = "auto";
			this.placeInsideViewport(this.initialPosition.x, this.initialPosition.y);
		} else if (this.hasExplicitPosition) this.keepInsideViewport();
	}

	close(): void {
		this.stopDragging();
		this.isOpen = false;
		this.element.hidden = true;
	}

	toggle(): void {
		if (this.isOpen) this.close();
		else this.open();
	}

	dispose(): void {
		this.close();
		this.closeButton.removeEventListener("click", this.closeFromButton);
		this.decreaseColumnsButton.removeEventListener("click", this.decreaseColumns);
		this.increaseColumnsButton.removeEventListener("click", this.increaseColumns);
		this.headerActions.removeEventListener("pointerdown", this.keepHeaderActionsOutOfDrag);
		this.header.removeEventListener("pointerdown", this.startDragging);
		this.header.removeEventListener("pointermove", this.moveWhileDragging);
		this.header.removeEventListener("pointerup", this.stopDragging);
		this.header.removeEventListener("pointercancel", this.stopDragging);
		window.removeEventListener("resize", this.keepInsideViewportAfterResize);
		this.element.remove();
	}

	private applyColumns(): void {
		this.element.style.setProperty("--inventory-columns", String(this.columns));
		this.decreaseColumnsButton.disabled = this.columns === MINIMUM_COLUMNS;
		this.increaseColumnsButton.disabled = this.columns === MAXIMUM_COLUMNS;
	}

	private changeColumns(columns: number): void {
		if (columns < MINIMUM_COLUMNS || columns > MAXIMUM_COLUMNS || columns === this.columns) return;
		this.columns = columns;
		this.applyColumns();
		const bounds = this.element.getBoundingClientRect();
		if (!this.hasExplicitPosition) {
			this.hasExplicitPosition = true;
			this.element.style.position = "fixed";
			this.element.style.right = "auto";
			this.element.style.bottom = "auto";
		}
		this.placeInsideViewport(bounds.left, bounds.top);
		this.onColumnsChange(this.columns);
	}

	private keepInsideViewport(): void {
		const bounds = this.element.getBoundingClientRect();
		this.placeInsideViewport(bounds.left, bounds.top);
	}

	private placeInsideViewport(left: number, top: number): void {
		const bounds = this.element.getBoundingClientRect();
		const maximumLeft = Math.max(0, document.documentElement.clientWidth - bounds.width);
		const maximumTop = Math.max(0, document.documentElement.clientHeight - bounds.height);
		this.element.style.left = `${Math.round(Math.min(Math.max(0, left), maximumLeft))}px`;
		this.element.style.top = `${Math.round(Math.min(Math.max(0, top), maximumTop))}px`;
	}
}
