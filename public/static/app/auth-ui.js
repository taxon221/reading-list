import { saveDraft, restoreDraft } from "./drafts.js";
import { dom, state, loadAuthUi } from "./shared.js";
import { showToast } from "./toast.js";
import { deviceName } from "./device-name.js";
import { initInvitations } from "./invitations.js";

const byId = (id) => document.getElementById(id);
const inviteToken = () => sessionStorage.getItem("reading-invite");
const hide = (hidden, ...ids) => {
	for (const id of ids) byId(id).hidden = hidden;
};
const date = (value) =>
	new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });

async function post(path, body = {}) {
	const response = await fetch(`/api/auth/${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok)
		throw Object.assign(new Error(data.error || "Please try again."), {
			reauthRequired: data.reauthRequired === true,
		});
	return data;
}

async function authenticate() {
	const optionsJSON = await post("login/options");
	const response = await window.SimpleWebAuthnBrowser.startAuthentication({
		optionsJSON,
	});
	return post("login/verify", { response });
}

// Security changes need a recent sign-in; confirm with a passkey and retry once.
async function postConfirmed(path, body) {
	const email = state.authUi.currentUser?.email;
	try {
		return await post(path, body);
	} catch (error) {
		if (!error.reauthRequired) throw error;
		showToast("Confirm with your passkey to continue.");
		await authenticate();
		await loadAuthUi();
		if (state.authUi.currentUser?.email !== email)
			throw new Error("Use this account's passkey to confirm.");
		return post(path, body);
	}
}

function settingsRow({
	title,
	detail,
	action,
	label,
	disabled = false,
	onClick,
}) {
	const row = document.createElement("div");
	row.className = "device-row";
	const info = document.createElement("div");
	const name = document.createElement("strong");
	name.textContent = title;
	const description = document.createElement("p");
	description.textContent = detail;
	info.append(name, description);
	const button = document.createElement("button");
	button.className = "btn-secondary";
	button.textContent = action;
	button.setAttribute("aria-label", label);
	button.disabled = disabled;
	button.onclick = async () => {
		button.disabled = true;
		try {
			await onClick();
		} catch (error) {
			showToast(error.message, { type: "error" });
		} finally {
			button.disabled = disabled;
		}
	};
	row.append(info, button);
	return row;
}

export function initAppAuth(app) {
	const panel = byId("signin-modal"),
		status = byId("signin-status");
	let busy = false,
		invitation = null,
		invitationError = "";
	const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
	if (invite) {
		sessionStorage.setItem("reading-invite", invite);
		history.replaceState({}, "", location.pathname + location.search);
	}
	function clearInvitation() {
		sessionStorage.removeItem("reading-invite");
		invitation = null;
		invitationError = "";
	}
	function setView(view) {
		if (busy) return;
		if (view === "signin" && invitationError) clearInvitation();
		const user = state.authUi.currentUser;
		const adding = Boolean(user) && !inviteToken();
		const registration = view === "register";
		const readerInvite = invitation?.kind === "reader";
		const setupAvailable =
			state.authUi.setupAvailable || Boolean(inviteToken());
		for (const name of ["signin", "register", "recovery"])
			hide(name !== view, `auth-${name}-view`);
		const heading = invitationError
			? "Invitation unavailable"
			: readerInvite
				? "Accept invitation"
				: adding
					? "Add a passkey"
					: "Set up your account";
		byId("signin-heading").textContent = {
			signin: "Sign in",
			recovery: "Recover your account",
			register: heading,
		}[view];
		panel.setAttribute(
			"aria-describedby",
			{
				signin: "signin-description",
				recovery: "recover-description",
				register: "passkey-description",
			}[view],
		);
		hide(view !== "signin", "auth-signin-options");
		hide(!setupAvailable, "auth-setup-link");
		hide(setupAvailable, "auth-invite-hint");
		hide(view === "signin" || (registration && adding), "auth-back");
		byId("auth-back-button").textContent = !registration
			? "Back to sign in"
			: invitationError
				? "Go to sign in"
				: invitation && user
					? "Back to my account"
					: "Already have an account? Sign in";
		hide(adding || Boolean(invitationError), "auth-setup-step");
		hide(adding || Boolean(invitationError) || readerInvite, "auth-setup-next");
		hide(Boolean(invitationError), "passkey-form", "passkey-prompt-hint");
		hide(!invitation || Boolean(invitationError), "invited-account");
		byId("invited-email").textContent = invitation?.email || "";
		byId("invited-context").textContent = !readerInvite
			? "This link sets up access to your existing account."
			: user && user.email !== invitation.email
				? `You're signed in as ${user.email}. Accepting switches you to this account, with its own private library.`
				: "You'll have your own private library. Other readers' saved items aren't shared.";
		hide(!adding, "passkey-name-field");
		byId("passkey-register").textContent = adding
			? "Add passkey"
			: "Create my passkey";
		byId("passkey-description").textContent =
			invitationError ||
			(adding
				? "Save another passkey to your device or password manager so you have another way to sign in."
				: "A passkey is your sign-in key, saved by your device or password manager. You don't need to choose a password.");
		status.textContent = "";
		status.dataset.error = "false";
		const focus = registration
			? invitationError
				? "auth-back-button"
				: adding
					? "passkey-name"
					: "passkey-register"
			: view === "recovery"
				? "recover-email"
				: "passkey-signin";
		requestAnimationFrame(() => byId(focus).focus());
	}
	const show = (
		view = inviteToken() || state.authUi.setupAvailable ? "register" : "signin",
	) => {
		panel.hidden = false;
		setView(view);
	};
	panel.onclick = (event) => {
		if (event.target === panel || event.target.closest("#signin-close"))
			panel.hidden = true;
		const view = event.target.closest("[data-auth-view]")?.dataset.authView;
		if (!view || busy) return;
		if (view === "signin" && state.authUi.currentUser && inviteToken()) {
			clearInvitation();
			panel.hidden = true;
		} else setView(view);
	};
	panel.onkeydown = (event) => {
		if (event.key === "Escape") {
			event.stopPropagation();
			panel.hidden = true;
		}
	};
	window.addEventListener("reading:signin", () => show());

	function showRecoveryCodes(codes, setup) {
		byId("recovery-codes").textContent = codes.join("\n");
		hide(!setup, "recovery-setup-step");
		byId("recovery-close").textContent = setup
			? "I've saved them · Open my library"
			: "I've saved them";
		hide(false, "recovery-panel");
		requestAnimationFrame(() => byId("download-recovery").focus());
	}
	async function finish(data) {
		if (data.recoveryCodes) showRecoveryCodes(data.recoveryCodes, true);
		clearInvitation();
		if (location.hash === "#signin")
			history.replaceState({}, "", location.pathname + location.search);
		panel.hidden = true;
		await loadAuthUi();
		localStorage.setItem("reading-account-event", String(Date.now()));
		await restoreDraft(app);
		await app.loadItems?.();
		app.loadTags?.();
		app.loadSavedViews?.();
		await app.handleShareTarget?.();
		if (!data.recoveryCodes) showToast("Signed in.");
	}
	async function run(button, action) {
		if (busy) return;
		busy = true;
		const label = button.textContent;
		const registering = button.id === "passkey-register";
		const controls = [...panel.querySelectorAll("button:not(#signin-close)")];
		for (const control of controls) control.disabled = true;
		button.textContent = "Please wait…";
		status.dataset.error = "false";
		status.textContent =
			button.id === "passkey-signin" || registering
				? "Follow the prompt from your device or password manager."
				: "Checking your recovery code…";
		try {
			await saveDraft();
			await finish(await action());
		} catch (error) {
			status.dataset.error = "true";
			status.textContent =
				error.name !== "NotAllowedError"
					? error.message || "Could not sign in."
					: registering
						? "Passkey creation was cancelled. Choose Create my passkey to try again."
						: "Sign-in was cancelled. You can try again.";
		} finally {
			busy = false;
			for (const control of controls) control.disabled = false;
			button.textContent = label;
		}
	}
	byId("passkey-signin").onclick = (event) =>
		run(event.currentTarget, authenticate);
	for (const [form, button, action] of [
		[
			"passkey-form",
			"passkey-register",
			async () => {
				const token = inviteToken();
				const optionsJSON = await post("register/options", {
					invite: token,
					localSetup: !token && state.authUi.setupAvailable,
				});
				const response = await window.SimpleWebAuthnBrowser.startRegistration({
					optionsJSON,
				});
				return post("register/verify", {
					response,
					name: byId("passkey-name").value || "Passkey",
				});
			},
		],
		[
			"recover-form",
			null,
			() =>
				post("recover", {
					email: byId("recover-email").value,
					code: byId("recover-code").value,
				}),
		],
	])
		byId(form).onsubmit = (event) => {
			event.preventDefault();
			void run(
				button ? byId(button) : event.currentTarget.querySelector("button"),
				action,
			);
		};
	byId("recovery-close").onclick = () => hide(true, "recovery-panel");
	byId("download-recovery").onclick = () => {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(
			new Blob(
				[
					`Reading List recovery codes\nAccount: ${state.authUi.currentUser?.email || ""}\nEach code can be used once. Keep these private.\n\n${byId("recovery-codes").textContent}\n`,
				],
				{ type: "text/plain" },
			),
		);
		a.download = "reading-list-recovery-codes.txt";
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	};
	async function loadDevices() {
		if (state.authUi.authMode !== "app" || !state.authUi.currentUser) return;
		const lists = [byId("passkey-list"), byId("device-list")];
		try {
			const response = await fetch("/api/auth/manage/devices");
			if (!response.ok) throw new Error();
			const data = await response.json();
			lists[0].replaceChildren(
				...data.passkeys.map((key) => {
					const title = key.name === "Passkey" ? "Saved passkey" : key.name;
					return settingsRow({
						title,
						detail:
							data.passkeys.length === 1
								? "Your sign-in key. Keep at least one passkey."
								: `Added ${date(key.created_at)}`,
						action: "Remove",
						label: `Remove ${title}`,
						disabled: data.passkeys.length === 1,
						onClick: async () => {
							await postConfirmed("manage/remove-passkey", { id: key.id });
							await loadDevices();
						},
					});
				}),
			);
			lists[1].replaceChildren(
				...data.devices.map((device) =>
					settingsRow({
						title: deviceName(device.name),
						detail: device.current
							? "This device"
							: `Last active ${date(device.last_seen_at)}`,
						action: "Sign out",
						label: `Sign out ${deviceName(device.name)}${device.current ? " (this device)" : ""}`,
						onClick: async () => {
							await post("manage/revoke", { id: device.id });
							if (!device.current) return loadDevices();
							localStorage.setItem("reading-account-event", String(Date.now()));
							location.reload();
						},
					}),
				),
			);
		} catch {
			for (const list of lists) {
				const message = document.createElement("p");
				message.className = "account-meta";
				message.textContent =
					"Couldn't load this list. Reopen settings to try again.";
				list.replaceChildren(message);
			}
		}
	}
	dom.accountButton?.addEventListener("click", () => {
		hide(!state.authUi.currentUser?.isAdmin, "invite-form");
		void loadDevices();
	});
	byId("add-passkey").onclick = () => show("register");
	byId("replace-recovery").onclick = async () => {
		try {
			showRecoveryCodes(
				(await postConfirmed("manage/recovery")).recoveryCodes,
				false,
			);
		} catch (error) {
			showToast(error.message, { type: "error" });
		}
	};
	initInvitations(postConfirmed);
	app.prepareInvitation = async () => {
		const token = inviteToken();
		if (!token || state.authUi.authMode !== "app") return false;
		try {
			invitation = await post("invite/details", { invite: token });
		} catch (error) {
			invitationError = error.message;
		}
		show("register");
		return true;
	};
	app.showSignIn = show;
}
