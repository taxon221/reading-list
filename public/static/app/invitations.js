import { dom, state } from "./shared.js";
import { showToast } from "./toast.js";

export function initInvitations(post) {
	const list = document.getElementById("invitation-list");
	const form = document.getElementById("invite-form");
	const input = document.getElementById("invite-email");
	const result = document.getElementById("invite-result");
	const status = document.getElementById("invite-status");
	let previousList = "";
	let requestId = 0;
	const date = (value) =>
		new Date(value).toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});
	async function load() {
		if (state.authUi.authMode !== "app" || !state.authUi.currentUser?.isAdmin)
			return;
		const email = state.authUi.currentUser.email;
		const id = ++requestId;
		try {
			const response = await fetch("/api/auth/manage/invites");
			if (!response.ok) throw new Error();
			const data = await response.json();
			if (id !== requestId || state.authUi.currentUser?.email !== email) return;
			const serialized = JSON.stringify(data.invitations);
			if (serialized === previousList) return;
			previousList = serialized;
			list.replaceChildren();
			if (!data.invitations.length) {
				const empty = document.createElement("p");
				empty.className = "account-meta";
				empty.textContent = "No invitations yet.";
				list.append(empty);
			}
			for (const invitation of data.invitations) {
				const row = document.createElement("div");
				row.className = "invitation-row";
				const info = document.createElement("div");
				const email = document.createElement("strong");
				email.textContent = invitation.email;
				const badge = document.createElement("span");
				badge.className = "invitation-badge";
				badge.dataset.status = invitation.status;
				badge.textContent =
					{
						pending: "Pending",
						accepted: "Accepted",
						expired: "Expired",
						revoked: "Revoked",
					}[invitation.status] || "Unavailable";
				const detail = document.createElement("p");
				detail.textContent =
					invitation.status === "accepted"
						? `Joined ${date(invitation.acceptedAt)}`
						: invitation.status === "revoked"
							? `Revoked ${date(invitation.revokedAt)}`
							: `${invitation.status === "expired" ? "Expired" : "Expires"} ${date(invitation.expiresAt)}`;
				info.append(email, badge, detail);
				const actions = document.createElement("div");
				actions.className = "invitation-actions";
				if (invitation.status !== "accepted") {
					const replace = document.createElement("button");
					replace.type = "button";
					replace.className = "btn-secondary";
					replace.textContent = "New link";
					replace.title =
						"Create a replacement link. Any previous pending link stops working.";
					replace.addEventListener("click", () =>
						create(invitation.email, replace),
					);
					actions.append(replace);
				}
				if (invitation.status === "pending") {
					const revoke = document.createElement("button");
					revoke.type = "button";
					revoke.className = "btn-secondary";
					revoke.textContent = "Revoke";
					revoke.addEventListener("click", async () => {
						revoke.disabled = true;
						try {
							await post("manage/revoke-invite", { id: invitation.id });
							result.value = "";
							document.getElementById("invite-result-group").hidden = true;
							status.textContent =
								"Invitation revoked. That link can no longer be used.";
							await load();
						} catch (error) {
							status.textContent = error.message;
						} finally {
							revoke.disabled = false;
						}
					});
					actions.append(revoke);
				}
				row.append(info, actions);
				list.append(row);
			}
		} catch {
			previousList = "";
			list.textContent =
				"Couldn't load invitations. Reopen settings to try again.";
		}
	}
	async function create(email, button) {
		button.disabled = true;
		status.textContent = "Creating invitation…";
		try {
			const data = await post("manage/invite", { email });
			input.value = email;
			result.value = data.url;
			document.getElementById("invite-result-group").hidden = false;
			status.textContent =
				"Invitation ready. Copy the link and share it with your reader.";
			result.focus();
			result.select();
			await load();
		} catch (error) {
			status.textContent = error.message;
		} finally {
			button.disabled = false;
		}
	}
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		void create(
			input.value.trim(),
			form.querySelector('button[type="submit"]'),
		);
	});
	document.getElementById("invite-copy").addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(result.value);
			showToast("Invitation link copied.");
		} catch {
			result.focus();
			result.select();
			status.textContent = "Link selected. Copy it to share.";
		}
	});
	const refresh = () => {
		if (
			!dom.accountModalOverlay.hidden &&
			!document.getElementById("settings-panel-account").hidden &&
			document.visibilityState !== "hidden"
		)
			void load();
	};
	dom.accountButton?.addEventListener("click", refresh);
	document
		.getElementById("settings-tab-account")
		.addEventListener("click", refresh);
	window.addEventListener("focus", refresh);
	const timer = window.setInterval(refresh, 15000);
	window.addEventListener("pagehide", () => clearInterval(timer), {
		once: true,
	});
}
