export function deviceName(userAgent = "") {
	const platform = [
		[/iPhone|iPod/i, "iPhone"],
		[/iPad|Macintosh.*Mobile/i, "iPad"],
		[/Android/i, "Android"],
		[/Windows/i, "Windows"],
		[/CrOS/i, "ChromeOS"],
		[/Macintosh|Mac OS X/i, "Mac"],
		[/Linux/i, "Linux"],
	].find(([pattern]) => pattern.test(userAgent))?.[1];
	const browser = [
		[/Edg(?:e|A|iOS)?\//i, "Edge"],
		[/OPR\//i, "Opera"],
		[/Firefox|FxiOS/i, "Firefox"],
		[/Chrome|CriOS/i, "Chrome"],
		[/Safari/i, "Safari"],
	].find(([pattern]) => pattern.test(userAgent))?.[1];
	return browser && platform
		? `${browser} on ${platform}`
		: platform || browser || "Device";
}
