export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			continue;
		}

		if (char === ",") {
			row.push(current);
			current = "";
			continue;
		}

		if (char === "\n") {
			row.push(current);
			if (row.some((cell) => cell.trim() !== "")) rows.push(row);
			row = [];
			current = "";
			continue;
		}

		if (char === "\r") continue;

		current += char;
	}

	if (current.length > 0 || row.length > 0) {
		row.push(current);
		if (row.some((cell) => cell.trim() !== "")) rows.push(row);
	}

	return rows;
}

export function normalizeHeader(header: string): string {
	return header
		.replace(/^\uFEFF/, "")
		.trim()
		.toLowerCase();
}

export function getHeaderIndex(headers: string[], names: string[]): number {
	for (const name of names) {
		const index = headers.indexOf(name);
		if (index !== -1) return index;
	}
	return -1;
}

export function parseReadwiseTags(raw: string): string[] {
	if (!raw) return [];
	const trimmed = raw.trim();
	if (!trimmed) return [];

	let tags: string[] = [];

	if (trimmed.startsWith("[")) {
		const matches = trimmed.match(/'([^']+)'/g);
		if (matches && matches.length > 0) {
			tags = matches.map((value) => value.slice(1, -1));
		} else {
			const inner = trimmed.replace(/^\[|\]$/g, "");
			tags = inner.split(",").map((tag) => tag.trim());
		}
	} else {
		tags = trimmed.split(",").map((tag) => tag.trim());
	}

	const cleaned = tags
		.map((tag) =>
			tag
				.replace(/^['"]|['"]$/g, "")
				.trim()
				.toLowerCase(),
		)
		.filter(Boolean);

	return [...new Set(cleaned)];
}

export function normalizeReadwiseDate(raw: string): string | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;

	return date.toISOString().replace("T", " ").replace("Z", "");
}
