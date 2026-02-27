export interface HighlighterSettings {
	enabled: boolean;
	autoDetect: boolean;
	theme: HighlighterTheme;
}

export type HighlighterTheme = "monokai-pro" | "github-dark" | "github-light" | "dracula" | "nord";

export const DEFAULT_HIGHLIGHTER_SETTINGS: HighlighterSettings = {
	enabled: false,
	autoDetect: false,
	theme: "monokai-pro",
};

export const HIGHLIGHTER_THEMES: { id: HighlighterTheme; name: string }[] = [
	{ id: "monokai-pro", name: "Monokai Pro" },
	{ id: "github-dark", name: "GitHub Dark" },
	{ id: "github-light", name: "GitHub Light" },
	{ id: "dracula", name: "Dracula" },
	{ id: "nord", name: "Nord" },
];
