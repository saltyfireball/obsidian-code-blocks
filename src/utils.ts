/**
 * Parse a color string into an RGBA object.
 * Supports: #RRGGBB, #RRGGBBAA, rgb(r,g,b), rgba(r,g,b,a).
 * Returns null if the input cannot be parsed.
 */
export function parseColor(
	value?: string,
): { r: number; g: number; b: number; a: number } | null {
	const trimmed = (value || "").trim();
	if (!trimmed) return null;

	const rgbaMatch = trimmed.match(
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
	);
	if (rgbaMatch) {
		const r = Math.min(255, Math.max(0, Math.round(parseFloat(rgbaMatch[1]))));
		const g = Math.min(255, Math.max(0, Math.round(parseFloat(rgbaMatch[2]))));
		const b = Math.min(255, Math.max(0, Math.round(parseFloat(rgbaMatch[3]))));
		const a = rgbaMatch[4] !== undefined
			? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4])))
			: 1;
		if ([r, g, b, a].some((val) => Number.isNaN(val))) return null;
		return { r, g, b, a };
	}

	const hex = trimmed.replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return null;
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
	return { r, g, b, a };
}

/**
 * Convert RGBA values to a hex string (#RRGGBB or #RRGGBBAA).
 */
export function rgbaToHex(r: number, g: number, b: number, a?: number): string {
	const hex = "#" +
		r.toString(16).padStart(2, "0") +
		g.toString(16).padStart(2, "0") +
		b.toString(16).padStart(2, "0");
	if (a !== undefined && a < 1) {
		return hex + Math.round(a * 255).toString(16).padStart(2, "0");
	}
	return hex;
}

/**
 * Validate a 6-digit hex color string (e.g. "#ff6188").
 */
export function isHexColor(value?: string): boolean {
	return /^#[0-9A-Fa-f]{6}$/.test((value || "").trim());
}

/**
 * Sanitize a CSS value to prevent injection via semicolons, braces, etc.
 */
export function sanitizeCssValue(value?: string | null): string {
	if (!value) return "";
	return value.replace(/[{}<>;@\\]/g, "").trim();
}

/**
 * Deep merge two objects. Values from `source` override `target`.
 * Arrays are replaced, not merged.
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
	const result = { ...target } as Record<string, unknown>;
	for (const key of Object.keys(source)) {
		const sourceVal = (source as Record<string, unknown>)[key];
		const targetVal = (target as Record<string, unknown>)[key];
		if (
			sourceVal !== null &&
			sourceVal !== undefined &&
			typeof sourceVal === "object" &&
			!Array.isArray(sourceVal) &&
			typeof targetVal === "object" &&
			targetVal !== null &&
			!Array.isArray(targetVal)
		) {
			result[key] = deepMerge(targetVal, sourceVal);
		} else if (sourceVal !== undefined) {
			result[key] = sourceVal;
		}
	}
	return result as T;
}
