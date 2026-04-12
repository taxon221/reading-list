import type { Context } from "hono";

export type CurrentUser = {
	id: number;
	email: string;
	display_name: string;
	is_admin: number;
	created_at: string;
};

export type ItemRow = {
	id: number;
	user_id: number;
	url: string;
	title: string;
	author: string;
	type: string;
	preview_image: string;
	notes: string;
	created_at: string;
	is_read: number;
	reading_progress: string;
};

export type HighlightRow = {
	id: number;
	user_id: number;
	item_id: number;
	selected_text: string;
	note: string;
	created_at: string;
};

export type TagRow = {
	name: string;
};

export type UserPreferencesRow = {
	user_id: number;
	saved_views: string;
};

export type SavedViewRecord = {
	id: string;
	name: string;
	filters: Record<string, unknown>;
};

export type AppBindings = {
	Variables: {
		currentUser: CurrentUser;
	};
};

export type AppContext = Context<AppBindings>;
