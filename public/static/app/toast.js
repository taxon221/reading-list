let toastContainer = null;

function ensureToastContainer() {
	if (toastContainer?.isConnected) return toastContainer;

	toastContainer = document.getElementById("toast-container");
	if (toastContainer) return toastContainer;

	toastContainer = document.createElement("div");
	toastContainer.id = "toast-container";
	toastContainer.className = "toast-container";
	toastContainer.setAttribute("aria-live", "polite");
	toastContainer.setAttribute("aria-atomic", "true");
	document.body.appendChild(toastContainer);
	return toastContainer;
}

export function showToast(message, { type = "info", duration = 3800 } = {}) {
	const container = ensureToastContainer();
	const toast = document.createElement("div");
	toast.className = `toast toast-${type}`;
	toast.textContent = message;
	container.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add("visible");
	});

	const dismiss = () => {
		toast.classList.remove("visible");
		window.setTimeout(() => toast.remove(), 220);
	};

	const timer = window.setTimeout(dismiss, duration);
	toast.addEventListener("click", () => {
		window.clearTimeout(timer);
		dismiss();
	});
}
