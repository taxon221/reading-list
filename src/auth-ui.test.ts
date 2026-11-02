import { expect, test } from "bun:test";
import { appCode, createBrowser, until } from "./browser-fixture";

const source = await appCode;

test.each([
	"owner",
	"reader",
	"cloudflare",
])("settings navigation for %s", async (kind) => {
	const { w, errors, el, click } = createBrowser();
	w.fetch = async (path: string) =>
		Response.json(
			path === "/api/auth/info"
				? {
						authMode: kind === "cloudflare" ? "cloudflare" : "app",
						currentUser: {
							email: "reader@example.com",
							isAdmin: kind === "owner",
						},
					}
				: path === "/api/auth/manage/devices"
					? { passkeys: [], devices: [] }
					: path === "/api/auth/manage/invites"
						? { invitations: [] }
						: [],
		);
	const visible = () =>
		[...w.document.querySelectorAll<HTMLElement>("[data-settings-panel]")]
			.filter((panel) => !panel.hidden)
			.map((panel) => panel.dataset.settingsPanel);
	try {
		w.eval(source);
		await until(() => !el("account-panel-user").hidden);
		click("account-button");
		expect(el("account-invite-section").hidden).toBe(kind !== "owner");
		expect(el("settings-tab-security").hidden).toBe(kind === "cloudflare");
		for (const section of ["account", "library", "feeds"]) {
			click(`settings-tab-${section}`);
			expect(visible()).toEqual([section]);
		}
		el("settings-tab-feeds").dispatchEvent(
			new w.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
		);
		expect(visible()).toEqual(["account"]);
		w.document.dispatchEvent(
			new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(el("account-modal-overlay").hidden).toBe(true);
		expect(w.document.activeElement).toBe(el("account-button"));
		expect(errors).toEqual([]);
	} finally {
		w.close();
	}
});

test.each([
	"local setup",
	"invitation",
	"expired invitation",
	"returning reader",
])("auth flow for %s", async (flow) => {
	const { w, errors, el, click } = createBrowser({
		url: `http://localhost/#${flow.includes("invitation") ? "invite=test" : "signin"}`,
	});
	let signedIn = false;
	let cancelled = false;
	let enrollment: unknown;
	const recoveryCodes = ["private-recovery-code"];
	Object.assign(w, {
		fetch: async (path: string, init: RequestInit = {}) => {
			if (path === "/api/auth/info")
				return Response.json({
					authMode: "app",
					setupAvailable: flow === "local setup" && !signedIn,
					currentUser: signedIn ? { email: "reader@example.com" } : null,
				});
			if (path === "/api/auth/invite/details")
				return flow === "expired invitation"
					? Response.json({ error: "Invitation expired" }, { status: 410 })
					: Response.json({ email: "reader@example.com", kind: "reader" });
			if (path === "/api/auth/register/options")
				enrollment = JSON.parse(String(init.body));
			if (path.endsWith("/verify")) {
				signedIn = true;
				return Response.json(
					path.includes("register") ? { recoveryCodes } : {},
				);
			}
			return Response.json(
				path === "/api/pending-share" ? { pending: false } : [],
			);
		},
		SimpleWebAuthnBrowser: {
			startAuthentication: async () => ({}),
			startRegistration: async () => {
				if (!cancelled) {
					cancelled = true;
					throw Object.assign(new Error(), { name: "NotAllowedError" });
				}
				return {};
			},
		},
	});
	try {
		w.eval(source);
		await until(() => !el("signin-modal").hidden);
		if (flow === "expired invitation") {
			expect(el("signin-heading").textContent).toBe("Invitation unavailable");
			expect(el("passkey-form").hidden).toBe(true);
			click("auth-back-button");
			expect(w.sessionStorage.getItem("reading-invite")).toBeNull();
		} else if (flow === "returning reader") {
			expect(el("auth-setup-link").hidden).toBe(true);
			click("passkey-signin");
			await until(() => signedIn && el("signin-modal").hidden);
		} else {
			expect(el("signin-heading").textContent).toBe(
				flow === "invitation" ? "Accept invitation" : "Set up your account",
			);
			click("passkey-register");
			await until(() => el("signin-status").textContent.includes("cancelled"));
			expect(el<HTMLButtonElement>("passkey-register").disabled).toBe(false);
			click("passkey-register");
			await until(
				() => !el("recovery-panel").hidden && el("signin-modal").hidden,
			);
			expect(enrollment).toEqual(
				flow === "invitation"
					? { invite: "test", localSetup: false }
					: { invite: null, localSetup: true },
			);
			expect(el("recovery-codes").textContent).toBe(recoveryCodes.join("\n"));
			expect(w.sessionStorage.getItem("reading-invite")).toBeNull();
			click("recovery-close");
			expect(el("recovery-panel").hidden).toBe(true);
		}
		expect(errors).toEqual([]);
	} finally {
		w.close();
	}
});
