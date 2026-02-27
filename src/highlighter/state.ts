import type { HighlighterSettings, HighlighterTheme } from "./types";
import { getStyleMap, getCombinedOverrides, type TokenStyle } from "./themes";

type StateListener = () => void;

interface ReloadableFeatureModule {
	start(): void;
	stop(): void;
	isEnabled(): boolean;
	reload(): void;
}

class HighlighterState implements ReloadableFeatureModule {
	private _active = false;
	private _settings: HighlighterSettings;
	private _styleMap: Record<string, TokenStyle>;
	private _combinedOverrides: Array<{ match: string[]; style: TokenStyle }>;
	private _listeners: Set<StateListener> = new Set();
	private _reloadCallbacks: Set<() => void> = new Set();

	constructor(settings: HighlighterSettings) {
		this._settings = { ...settings };
		this._styleMap = getStyleMap(settings.theme);
		this._combinedOverrides = getCombinedOverrides(settings.theme);
	}

	get active(): boolean {
		return this._active;
	}

	get settings(): HighlighterSettings {
		return this._settings;
	}

	get styleMap(): Record<string, TokenStyle> {
		return this._styleMap;
	}

	get combinedOverrides(): Array<{ match: string[]; style: TokenStyle }> {
		return this._combinedOverrides;
	}

	get foregroundColor(): string {
		const colors: Record<HighlighterTheme, string> = {
			"monokai-pro": "#c1c0c0",
			"github-dark": "#c9d1d9",
			"github-light": "#24292f",
			"dracula": "#f8f8f2",
			"nord": "#d8dee9",
		};
		return colors[this._settings.theme] || "#c1c0c0";
	}

	start(): void {
		this._active = true;
		this.notifyListeners();
	}

	stop(): void {
		this._active = false;
		this.notifyListeners();
	}

	isEnabled(): boolean {
		return this._active;
	}

	updateSettings(newSettings: Partial<HighlighterSettings>): void {
		const themeChanged = newSettings.theme && newSettings.theme !== this._settings.theme;

		this._settings = { ...this._settings, ...newSettings };

		if (themeChanged) {
			this._styleMap = getStyleMap(this._settings.theme);
			this._combinedOverrides = getCombinedOverrides(this._settings.theme);
		}

		this.notifyListeners();
	}

	reload(): void {
		this._styleMap = getStyleMap(this._settings.theme);
		this._combinedOverrides = getCombinedOverrides(this._settings.theme);
		this.notifyListeners();
		this._reloadCallbacks.forEach((cb) => cb());
	}

	subscribe(listener: StateListener): () => void {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	}

	onReload(callback: () => void): () => void {
		this._reloadCallbacks.add(callback);
		return () => this._reloadCallbacks.delete(callback);
	}

	private notifyListeners(): void {
		this._listeners.forEach((listener) => listener());
	}
}

let highlighterState: HighlighterState | null = null;

export function initHighlighterState(settings: HighlighterSettings): HighlighterState {
	highlighterState = new HighlighterState(settings);
	return highlighterState;
}

export function getHighlighterState(): HighlighterState | null {
	return highlighterState;
}

export function destroyHighlighterState(): void {
	if (highlighterState) {
		highlighterState.stop();
		highlighterState = null;
	}
}
