import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import JSZip from "jszip";
import { db, dataDir, initDb } from "./db";

initDb();
const output = resolve(
	process.argv[2] ||
		`backups/reading-list-${new Date().toISOString().replaceAll(":", "-")}.zip`,
);
const staging = await mkdtemp(join(tmpdir(), "reading-list-backup-"));
try {
	const path = join(staging, "reading-list.db");
	db.query("VACUUM INTO ?").run(path);
	const snapshot = new Database(path, { readonly: true });
	const files = snapshot.query("SELECT filename FROM uploaded_files").all() as {
		filename: string;
	}[];
	snapshot.close();
	const zip = new JSZip();
	zip.file("reading-list.db", await Bun.file(path).arrayBuffer());
	for (const { filename } of files) {
		if (!/^[\w.-]+$/.test(filename))
			throw new Error("Invalid upload filename in backup.");
		const file = Bun.file(join(dataDir, "uploads", filename));
		if (!(await file.exists()))
			throw new Error(
				`Upload ${filename} is missing. Pause writes and retry the backup.`,
			);
		zip.file(`uploads/${filename}`, await file.arrayBuffer());
	}
	zip.file(
		"RESTORE.txt",
		"Stop Reading List before restoring. Delete any reading-list.db-wal and reading-list.db-shm files, unzip reading-list.db and uploads/ into DATA_DIR, then restart. This backup includes authentication credentials: keep it private.\n",
	);
	await mkdir(resolve(output, ".."), { recursive: true });
	if (await Bun.file(output).exists())
		throw new Error(
			"Backup destination already exists. Choose a new filename.",
		);
	await Bun.write(
		output,
		await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
	);
	console.log(`Complete backup saved to ${output}`);
} finally {
	await rm(staging, { recursive: true, force: true });
	db.close();
}
