export { highlightCode, highlightToTokens, isLanguageSupported, listLanguages } from "./highlighter";
export { createHighlighterEditorExtension, incrementDecorationVersion } from "./editor-extension";
export { createHighlighterReadingViewProcessor } from "./reading-view";
export type { HighlighterSettings, HighlighterTheme } from "./types";
export { DEFAULT_HIGHLIGHTER_SETTINGS, HIGHLIGHTER_THEMES } from "./types";
export { initHighlighterState, getHighlighterState, destroyHighlighterState } from "./state";
export { generateThemeCSS } from "./themes";
