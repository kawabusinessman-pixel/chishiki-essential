const symbolCategories = {
 BASIC: {
 DOT: "•",
 DOT2: "·",
 BULLET: "•",
 BULLET2: "◦",
 PLUS: "＋",
 MINUS: "－",
 MULTIPLY: "×",
 DIVIDE: "÷",
 EQUAL: "＝",
 DOBBLE_ARROW: "»",
 },
 DECORATIVE: {
 STAR: "★",
 SPARKLE: "✧",
 HEART: "❤",
 LEAF: "❦"
 },
 STATUS: {
 CHECK: "✓",
 CROSS: "✗",
 WARNING: "⚠",
 INFO: "ℹ",
 QUESTION: "?",
 EXCLAMATION: "!"
 },
 ARROWS: {
 RIGHT: "➡",
 LEFT: "◀",
 UP: "▲",
 DOWN: "▼",
 DOUBLE: "»",
 DOUBLE_LEFT: "«",
 POINTER: "❯"
 },
 BORDERS: {
 LINE: "─",
 LINE_DOUBLE: "═",
 LEFT: "├",
 RIGHT: "┤",
 TOP: "┬",
 BOTTOM: "┴",
 CORNER_TL: "┌",
 CORNER_TR: "┐",
 CORNER_BL: "└",
 CORNER_BR: "┘"
 },
 GAME: {
 SWORD: "⚔",
 SHIELD: "⛨",
 PICKAXE: "⛏",
 HEALTH: "❤",
 MANA: "☄",
 COIN: "◉",
 },
 UI: {
 RADIO_ON: "◉",
 RADIO_OFF: "○",
 CHECKBOX_ON: "☑",
 CHECKBOX_OFF: "☐",
 MENU: "☰",
 GEAR: "⚙",
 LOADING: "↻"
 }
};
const specialIcons = {
 KAWAII: {
 CUTE_FACE: "",
 HAPPY_FACE: "",
 WINK: "",
 LOVE_EYES: "(♥‿♥)",
 SURPRISED: "(◉_◉)",
 SLEEPY: "(-‿-)",
 ANGRY: "(╯°□°）╯",
 CONFUSED: "(・_・)"
 },
 JAPANESE: {
 SAKURA: "🌸",
 TORII: "⛩",
 WAVE: "〜",
 CIRCLE: "○",
 TRIANGLE: "△",
 SQUARE: "□",
 DIAMOND: "◇",
 FLOWER: "❀"
 },
 AESTHETIC: {
 SPARKLES: "✨",
 MOON: "🌙",
 STAR_OUTLINE: "☆",
 BUTTERFLY: "🦋",
 CRYSTAL: "💎",
 RAINBOW: "🌈",
 CLOUD: "☁",
 SUN: "☀"
 },
 SYMBOLS: {
 INFINITY: "∞",
 ALPHA: "α",
 BETA: "β",
 GAMMA: "γ",
 DELTA: "δ",
 OMEGA: "ω",
 PHI: "φ",
 PI: "π"
 },
 DECORATIVE_LINES: {
 WAVE_LINE: "～～～～～～～～～～",
 DOT_LINE: "・・・・・・・・・・",
 STAR_LINE: "★★★★★★★★★★",
 HEART_LINE: "♥♥♥♥♥♥♥♥♥♥",
 DIAMOND_LINE: "◆◆◆◆◆◆◆◆◆◆",
 FLOWER_LINE: "❀❀❀❀❀❀❀❀❀❀",
 SPARKLE_LINE: "✧✧✧✧✧✧✧✧✧✧",
 ARROW_LINE: "→→→→→→→→→→"
 }
};
const symbolCache = new Map();
function getSymbol(category, name) {
 const cacheKey = `${category}_${name}`;
 if (symbolCache.has(cacheKey)) {
 return symbolCache.get(cacheKey);
 }
 const symbol = symbolCategories[category]?.[name];
 if (symbol) {
 symbolCache.set(cacheKey, symbol);
 return symbol;
 }
 return null;
}
function getAllSymbols() {
 if (symbolCache.has('ALL_SYMBOLS')) {
 return symbolCache.get('ALL_SYMBOLS');
 }
 const allSymbols = {};
 for (const [category, symbols] of Object.entries(symbolCategories)) {
 for (const [name, symbol] of Object.entries(symbols)) {
 allSymbols[`${category}_${name}`] = symbol;
 }
 }
 symbolCache.set('ALL_SYMBOLS', allSymbols);
 return allSymbols;
}
const unicodeSymbols = getAllSymbols();
function getSpecialIcon(category, name) {
 const cacheKey = `special_${category}_${name}`;
 if (symbolCache.has(cacheKey)) {
 return symbolCache.get(cacheKey);
 }
 const icon = specialIcons[category]?.[name];
 if (icon) {
 symbolCache.set(cacheKey, icon);
 return icon;
 }
 return null;
}
function getAllSpecialIcons() {
 if (symbolCache.has('ALL_SPECIAL_ICONS')) {
 return symbolCache.get('ALL_SPECIAL_ICONS');
 }
 const allSpecialIcons = {};
 for (const [category, icons] of Object.entries(specialIcons)) {
 for (const [name, icon] of Object.entries(icons)) {
 allSpecialIcons[`${category}_${name}`] = icon;
 }
 }
 symbolCache.set('ALL_SPECIAL_ICONS', allSpecialIcons);
 return allSpecialIcons;
}
function getFormattedSpecialIconsList() {
 const formattedList = [];
 for (const [category, icons] of Object.entries(specialIcons)) {
 for (const [name, icon] of Object.entries(icons)) {
 formattedList.push({ name: `${category}_${name}`, icon });
 }
 }
 return formattedList;
}
export {
 symbolCategories,
 specialIcons,
 getSymbol,
 getSpecialIcon,
 getAllSymbols,
 getAllSpecialIcons,
 getFormattedSpecialIconsList,
 unicodeSymbols
};