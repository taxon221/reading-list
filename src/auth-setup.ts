import { db, initDb } from "./db";
import { createInvite } from "./server/sessions";
initDb();
const email = (process.argv[2] || Bun.env.BOOTSTRAP_ADMIN_EMAIL || "")
	.trim()
	.toLowerCase();
const user = db.query("SELECT id FROM users WHERE email=?").get(email) as {
	id: number;
} | null;
if (!user)
	throw new Error(
		"Account does not exist. Invite new readers from the owner account.",
	);
const token = db.transaction(() => {
	db.query("DELETE FROM auth_invites WHERE user_id=?").run(user.id);
	db.query("DELETE FROM auth_sessions WHERE user_id=?").run(user.id);
	return createInvite(user.id);
})();
console.log(
	`Open this private, one-time link within 24 hours to add a passkey:\n${Bun.env.APP_PUBLIC_URL || "http://localhost:3000"}/#invite=${token}\nKeep this link private. Existing sessions have been revoked.`,
);
db.close();
