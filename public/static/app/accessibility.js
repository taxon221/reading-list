export function initAccessibility() {
	let active = null;
	let returnFocus = null;
	const dialogs = [...document.querySelectorAll('[role="dialog"]')];
	function visible(element) {
		return !element.hidden && getComputedStyle(element).display !== "none";
	}
	function update() {
		const open = dialogs.filter(visible);
		const next = open.at(-1) || null;
		if (next === active) return;
		document.querySelector(".container")?.toggleAttribute("inert", !!next);
		if (next) {
			if (!active) returnFocus = document.activeElement;
			active = next;
			requestAnimationFrame(() => {
				if (!active?.contains(document.activeElement))
					active
						?.querySelector("input,button,a[href],textarea,[tabindex]")
						?.focus();
			});
		} else {
			active = null;
			returnFocus?.focus();
			returnFocus = null;
		}
	}
	const observer = new MutationObserver(update);
	for (const dialog of dialogs)
		observer.observe(dialog, {
			attributes: true,
			attributeFilter: ["style", "hidden"],
		});
	// Dialogs with their own Escape handling mark the event handled first.
	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape" || event.defaultPrevented || !active) return;
		const close = active.querySelector(".modal-close");
		if (!close) return;
		event.preventDefault();
		close.click();
	});
	document.addEventListener("keydown", (event) => {
		if (event.key !== "Tab" || !active) return;
		const controls = [
			...active.querySelectorAll(
				'button:not(:disabled),a[href],input:not(:disabled),select,textarea,iframe,[tabindex="0"]',
			),
		].filter((element) => element.getClientRects().length);
		const first = controls[0],
			last = controls.at(-1);
		if (
			event.shiftKey &&
			(document.activeElement === first ||
				!active.contains(document.activeElement))
		) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	});
	update();
}
