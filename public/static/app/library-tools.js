import { dom, handleAuthFailure, closeAccountModal } from "./shared.js";
import { showToast } from "./toast.js";
export function initLibraryTools() {
	document.getElementById("manage-library").addEventListener("click", () => {
		closeAccountModal();
		dom.deleteDropdown.hidden = false;
		dom.deleteDropdown.scrollIntoView({ block: "center" });
		dom.deleteFilterBtn.click();
	});
	document
		.getElementById("export-library")
		.addEventListener("click", async (event) => {
			const button = event.currentTarget;
			const status = document.getElementById("export-status");
			button.disabled = true;
			status.textContent = "Preparing your library…";
			try {
				const response = await fetch("/api/export");
				if (handleAuthFailure(response)) return;
				if (!response.ok) {
					const data = await response.json();
					throw new Error(data.error || "Export failed.");
				}
				const url = URL.createObjectURL(await response.blob());
				const a = document.createElement("a");
				a.href = url;
				a.download = "reading-list-export.zip";
				a.click();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				status.textContent = "Export downloaded.";
			} catch (error) {
				status.textContent = error.message;
				showToast(error.message, { type: "error" });
			} finally {
				button.disabled = false;
			}
		});
}
