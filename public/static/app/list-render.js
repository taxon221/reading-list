import { dom } from "./shared.js";
import {
	createEmptyState,
	createSvgIcon,
	formatDate,
	getDomain,
	renderItemProgressMeta,
} from "./utils.js";

function isMobilePwa() {
	const standalone =
		window.matchMedia?.("(display-mode: standalone)")?.matches ||
		window.navigator.standalone === true;
	if (!standalone) return false;

	return (
		window.matchMedia?.("(pointer: coarse)")?.matches ||
		/android|iphone|ipad|ipod/i.test(window.navigator.userAgent || "")
	);
}

function createItemActionButton({ action, className, title, icon }) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = className;
	button.dataset.action = action;
	button.title = title;
	button.appendChild(icon);
	return button;
}

function buildThumbPlaceholder(type) {
	const icon = createSvgIcon(
		{
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
		type === "video"
			? [
					{
						name: "rect",
						attributes: { x: "3", y: "6", width: "13", height: "12", rx: "2" },
					},
					{ name: "path", attributes: { d: "M16 10l5-3v10l-5-3z" } },
				]
			: type === "podcast"
				? [
						{ name: "path", attributes: { d: "M12 18v3" } },
						{
							name: "path",
							attributes: { d: "M8 11a4 4 0 118 0 4 4 0 01-8 0z" },
						},
						{ name: "path", attributes: { d: "M5 9a7 7 0 0114 0" } },
						{ name: "path", attributes: { d: "M2 9a10 10 0 0120 0" } },
					]
				: type === "pdf"
					? [
							{
								name: "path",
								attributes: {
									d: "M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7z",
								},
							},
							{ name: "path", attributes: { d: "M14 2v5h5" } },
						]
					: type === "ebook"
						? [
								{
									name: "path",
									attributes: { d: "M4 19.5A2.5 2.5 0 016.5 17H20" },
								},
								{
									name: "path",
									attributes: {
										d: "M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
									},
								},
							]
						: [
								{
									name: "path",
									attributes: {
										d: "M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7z",
									},
								},
								{ name: "path", attributes: { d: "M14 2v5h5" } },
								{ name: "path", attributes: { d: "M9 13h6" } },
								{ name: "path", attributes: { d: "M9 17h6" } },
							],
	);

	const span = document.createElement("span");
	span.className = `item-thumb-fallback type-${type}`;
	span.setAttribute("aria-hidden", "true");
	span.appendChild(icon);
	return span;
}

function getThumbIconSources(url) {
	const parsedUrl = new URL(url);
	return {
		primary: `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(parsedUrl.origin)}&sz=64`,
		fallback: `https://icons.duckduckgo.com/ip3/${parsedUrl.hostname}.ico`,
	};
}

function applyThumbIcon(img) {
	const primary = img.dataset.iconPrimary || "";
	const fallback = img.dataset.iconFallback || "";
	const type = img.dataset.type || "article";
	if (!primary) {
		img.replaceWith(buildThumbPlaceholder(type));
		return;
	}

	img.classList.remove("is-preview");
	img.classList.add("is-icon");
	img.onerror = () => {
		if (fallback && img.src !== fallback) {
			img.onerror = () => {
				img.replaceWith(buildThumbPlaceholder(type));
			};
			img.src = fallback;
			return;
		}
		img.replaceWith(buildThumbPlaceholder(type));
	};
	img.src = primary;
}

function buildThumbContent(type, url, previewImage) {
	if (!URL.canParse(url)) return buildThumbPlaceholder(type);

	const img = document.createElement("img");
	const resolvedPreview = URL.canParse(previewImage || "") ? previewImage : "";
	img.className = resolvedPreview
		? "item-thumb is-preview"
		: "item-thumb is-icon";
	img.loading = "lazy";
	img.decoding = "async";
	img.alt = "";
	img.setAttribute("aria-hidden", "true");
	img.dataset.type = type;
	const { primary, fallback } = getThumbIconSources(url);
	img.dataset.iconPrimary = primary;
	img.dataset.iconFallback = fallback;
	if (resolvedPreview) {
		img.onerror = () => {
			applyThumbIcon(img);
		};
		img.src = resolvedPreview;
	} else {
		applyThumbIcon(img);
	}
	return img;
}

export function createListRenderer({ onToggleInclude, onToggleExclude }) {
	function createItemElement(item) {
		const article = document.createElement("article");
		article.className = item.is_read ? "item read" : "item";
		article.dataset.id = String(item.id);

		const content = document.createElement("div");
		content.className = "item-content";

		const left = document.createElement("div");
		left.className = "item-col-left";

		const type = document.createElement("span");
		type.className = `item-type type-${item.type}`;
		type.textContent = item.type;

		const date = document.createElement("span");
		date.className = "item-date";
		date.textContent = formatDate(item.created_at);

		left.append(type, date);

		const progress = renderItemProgressMeta(item);
		const useNewLayout = !isMobilePwa();
		if (!useNewLayout && progress) left.appendChild(progress);

		const right = document.createElement("div");
		right.className = "item-col-right";

		const title = document.createElement("span");
		title.className = "item-title";
		title.dataset.action = "open-reader";
		title.textContent = item.title || item.url;

		const meta = document.createElement("div");
		meta.className = "item-meta";

		const domainValue = getDomain(item.url);
		const domain = document.createElement("button");
		domain.type = "button";
		domain.className = "item-domain item-filter-btn";
		domain.textContent = domainValue;
		domain.title = "Filter by domain · Shift+click to exclude";
		domain.addEventListener("click", (event) => {
			event.stopPropagation();
			if (event.shiftKey) onToggleExclude("domain", domainValue);
			else onToggleInclude("domain", domainValue);
		});
		meta.appendChild(domain);

		if (item.author) {
			const author = document.createElement("button");
			author.type = "button";
			author.className = "item-author item-filter-btn";
			author.textContent = item.author;
			author.title = "Filter by author · Shift+click to exclude";
			author.addEventListener("click", (event) => {
				event.stopPropagation();
				if (event.shiftKey) onToggleExclude("author", item.author);
				else onToggleInclude("author", item.author);
			});
			meta.appendChild(author);
		}

		if (item.highlight_count) {
			const highlights = document.createElement("span");
			highlights.className = "item-has-highlights";
			highlights.title = `${item.highlight_count} highlight${item.highlight_count > 1 ? "s" : ""}`;
			highlights.append(
				createSvgIcon(
					{
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						"stroke-width": "2",
						width: "12",
						height: "12",
					},
					[
						{ name: "path", attributes: { d: "M12 2L2 7l10 5 10-5-10-5z" } },
						{ name: "path", attributes: { d: "M2 17l10 5 10-5" } },
						{ name: "path", attributes: { d: "M2 12l10 5 10-5" } },
					],
				),
				document.createTextNode(` ${item.highlight_count}`),
			);
			meta.appendChild(highlights);
		}

		if (Array.isArray(item.tags)) {
			item.tags.forEach((tag) => {
				const tagButton = document.createElement("button");
				tagButton.type = "button";
				tagButton.className = "item-tag";
				tagButton.dataset.action = "filter-tag";
				tagButton.dataset.tag = tag;
				tagButton.textContent = `#${tag}`;
				meta.appendChild(tagButton);
			});
		}

		right.append(title, meta);
		content.append(left, right);

		const actions = document.createElement("div");
		actions.className = "item-actions";

		const actionRow = document.createElement("div");
		actionRow.className = "item-actions-row";

		actionRow.append(
			createItemActionButton({
				action: "toggle-read",
				className: item.is_read ? "btn-action is-read" : "btn-action",
				title: item.is_read ? "Mark unread" : "Mark read",
				icon: createSvgIcon(
					{
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						"stroke-width": "2",
						"stroke-linecap": "round",
						"stroke-linejoin": "round",
					},
					[{ name: "path", attributes: { d: "M20 6L9 17l-5-5" } }],
				),
			}),
			createItemActionButton({
				action: "delete-item",
				className: "btn-action btn-delete",
				title: "Delete",
				icon: createSvgIcon(
					{
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						"stroke-width": "2",
						"stroke-linecap": "round",
						"stroke-linejoin": "round",
					},
					[{ name: "path", attributes: { d: "M18 6L6 18M6 6l12 12" } }],
				),
			}),
		);

		const moreButton = createItemActionButton({
			action: "open-menu",
			className: "btn-more",
			title: "More options",
			icon: createSvgIcon(
				{
					viewBox: "0 0 24 24",
					fill: "currentColor",
				},
				[
					{ name: "circle", attributes: { cx: "5", cy: "12", r: "2" } },
					{ name: "circle", attributes: { cx: "12", cy: "12", r: "2" } },
					{ name: "circle", attributes: { cx: "19", cy: "12", r: "2" } },
				],
			),
		});

		actions.append(actionRow, moreButton);

		if (useNewLayout) {
			article.classList.add("has-thumb");
			const thumbCol = document.createElement("div");
			thumbCol.className = "item-thumb-col";
			thumbCol.appendChild(
				buildThumbContent(item.type, item.url || "", item.preview_image || ""),
			);
			content.prepend(thumbCol);
			if (progress) content.appendChild(progress);
		}

		article.append(content, actions);
		return article;
	}

	function renderItems(items) {
		if (!dom.itemsList) return;

		if (items.length === 0) {
			dom.itemsList.replaceChildren(
				createEmptyState("No items yet", "Paste a URL above to get started"),
			);
			return;
		}

		dom.itemsList.replaceChildren(...items.map(createItemElement));
	}

	function renderTagOptions(
		tags,
		{ selectedTags, excludedTags, onToggleTagState },
	) {
		if (!dom.tagOptions) return;

		if (tags.length === 0) {
			const empty = document.createElement("div");
			empty.className = "dropdown-empty";
			empty.textContent = "No tags yet";
			dom.tagOptions.replaceChildren(empty);
			return;
		}

		const options = tags.map((tag) => {
			const label = document.createElement("label");
			label.className = "dropdown-option";
			label.dataset.value = tag.name;

			const indicator = document.createElement("span");
			indicator.className = "tag-state-indicator";
			indicator.dataset.state = excludedTags.includes(tag.name)
				? "exclude"
				: selectedTags.includes(tag.name)
					? "include"
					: "off";

			const count = document.createElement("span");
			count.className = "option-count";
			count.textContent = String(tag.count);

			label.append(indicator, document.createTextNode(`${tag.name} `), count);
			label.addEventListener("click", (event) => {
				event.preventDefault();
				const nextStates = {
					off: "include",
					include: "exclude",
					exclude: "off",
				};
				const nextState = nextStates[indicator.dataset.state] ?? "off";
				indicator.dataset.state = nextState;
				onToggleTagState(tag.name, nextState);
			});

			return label;
		});

		dom.tagOptions.replaceChildren(...options);
	}

	return {
		renderItems,
		renderTagOptions,
	};
}
