/**
 * Cosmetic skins. Each is a complete visual world: its own surface palette
 * (in styles/themes.css, keyed on [data-skin]) and its own set of block
 * tones with names the player sees.
 *
 * Tone COUNT is part of run determinism - it is passed to the engine and
 * recorded in the submission - so keep every theme at the same length.
 * Changing a theme's colours is safe; changing how many it has is not.
 */
export const TONE_COUNT = 7;

export const THEMES = {
  voltage: {
    id: "voltage",
    name: "Voltage",
    tagline: "Neon arcade",
    blurb: "Glass circuitry and hard light.",
    statusBar: "#080614",
    tones: [
      { n: "Plasma",  b: "#FF2D95", h: "#FF9BD0", l: "#9C0E58" },
      { n: "Ion",     b: "#22E7FF", h: "#B4F6FF", l: "#0A7E93" },
      { n: "Acid",    b: "#9BFF3D", h: "#D8FFA6", l: "#4E8F13" },
      { n: "Fusion",  b: "#FFB020", h: "#FFDB94", l: "#96600A" },
      { n: "Violet",  b: "#A855F7", h: "#D7B0FF", l: "#5B2497" },
      { n: "Ember",   b: "#FF5C3A", h: "#FFAD97", l: "#992B12" },
      { n: "Azure",   b: "#3B82F6", h: "#A6C7FF", l: "#17439B" },
    ],
  },

  chapel: {
    id: "chapel",
    name: "Chapel",
    tagline: "Stained glass",
    blurb: "Jewelled glass set in dark lead came.",
    statusBar: "#0C0E14",
    tones: [
      { n: "Ruby",     b: "#C6273E", h: "#F0768A", l: "#71101F" },
      { n: "Cobalt",   b: "#2C57B8", h: "#7C9EE8", l: "#152F69" },
      { n: "Emerald",  b: "#1E8C63", h: "#66D2A8", l: "#0B4E36" },
      { n: "Amethyst", b: "#7B3FA0", h: "#BB88D8", l: "#43205A" },
      { n: "Topaz",    b: "#D9911F", h: "#F6C877", l: "#7E5108" },
      { n: "Aqua",     b: "#2AA1B8", h: "#84DCEC", l: "#125C6B" },
      { n: "Rose",     b: "#D0567F", h: "#F2A0BC", l: "#7A2545" },
    ],
  },

  timber: {
    id: "timber",
    name: "Timber",
    tagline: "Workshop wood",
    blurb: "Seven real timber species on a maple bench.",
    statusBar: "#EDE0CB",
    tones: [
      { n: "Maple",       b: "#DFB273", h: "#F0D3A4", l: "#A87C46" },
      { n: "Cherry",      b: "#C05B43", h: "#DC8570", l: "#8C3A28" },
      { n: "Padauk",      b: "#C9561F", h: "#E5814C", l: "#90370F" },
      { n: "Purpleheart", b: "#7B5C9E", h: "#A187BE", l: "#553C72" },
      { n: "Verawood",    b: "#7C8C49", h: "#A2B06F", l: "#566331" },
      { n: "Walnut",      b: "#7C5433", h: "#A0764F", l: "#563620" },
      { n: "Blue Mahoe",  b: "#4B738A", h: "#74A0B5", l: "#33525F" },
    ],
  },

  /* ── earned skins: `unlock` names the achievement that opens them ── */
  frost: {
    id: "frost",
    name: "Frost",
    tagline: "Glacier ice",
    blurb: "Clear ice over a midnight lake.",
    statusBar: "#06121C",
    unlock: "daily1",
    tones: [
      { n: "Glacier",  b: "#7FD8FF", h: "#D9F5FF", l: "#2A86B3" },
      { n: "Aurora",   b: "#5CF2C2", h: "#C8FFEC", l: "#1E9B78" },
      { n: "Lilac",    b: "#B9A4FF", h: "#E8E0FF", l: "#6B55C2" },
      { n: "Frostbite", b: "#FF8FB8", h: "#FFD6E6", l: "#B34A73" },
      { n: "Polar",    b: "#E9F4FF", h: "#FFFFFF", l: "#93AFC9" },
      { n: "Fjord",    b: "#3F7CFF", h: "#A9C4FF", l: "#1B43A6" },
      { n: "Sunrise",  b: "#FFD27A", h: "#FFF0CC", l: "#B8862A" },
    ],
  },

  magma: {
    id: "magma",
    name: "Magma",
    tagline: "Molten rock",
    blurb: "Cooling basalt with fire in the cracks.",
    statusBar: "#120705",
    unlock: "combo5",
    tones: [
      { n: "Lava",     b: "#FF5A1F", h: "#FFB08A", l: "#9E2A05" },
      { n: "Ember",    b: "#FFB000", h: "#FFE08A", l: "#A36A00" },
      { n: "Cinder",   b: "#E0325A", h: "#FF9AB0", l: "#8A1430" },
      { n: "Sulfur",   b: "#D8F03A", h: "#F2FFA6", l: "#83961A" },
      { n: "Obsidian", b: "#7A5CFF", h: "#C2B3FF", l: "#3C2A9E" },
      { n: "Flare",    b: "#FF7AD9", h: "#FFC6EF", l: "#A83D8C" },
      { n: "Ash",      b: "#B7A79A", h: "#E6DCD3", l: "#6E6157" },
    ],
  },

  candy: {
    id: "candy",
    name: "Candy",
    tagline: "Sweet shop",
    blurb: "Gummies and sherbet on a strawberry-milk counter.",
    statusBar: "#FFE9F1",
    unlock: "streak3",
    tones: [
      { n: "Bubblegum", b: "#FF6FAE", h: "#FFC2DC", l: "#C93A7C" },
      { n: "Mint",      b: "#3FD6A6", h: "#A8F2DA", l: "#1E9A74" },
      { n: "Lemon",     b: "#FFD23F", h: "#FFEDA6", l: "#C49A12" },
      { n: "Grape",     b: "#9B6BFF", h: "#D3BEFF", l: "#6438C9" },
      { n: "Blueberry", b: "#4A9DFF", h: "#B2D6FF", l: "#1F66C2" },
      { n: "Orange",    b: "#FF8A3D", h: "#FFC9A3", l: "#C75B12" },
      { n: "Cola",      b: "#A0603A", h: "#D9A383", l: "#653619" },
    ],
  },

  pixel: {
    id: "pixel",
    name: "Pixel",
    tagline: "8-bit arcade",
    blurb: "Chunky blocks and scanlines, straight out of a cabinet.",
    statusBar: "#0E1116",
    unlock: "games10",
    tones: [
      { n: "Cherry",  b: "#E8384F", h: "#FF8A98", l: "#8E1426" },
      { n: "Sky",     b: "#3DA5F4", h: "#9AD3FF", l: "#165D96" },
      { n: "Lime",    b: "#7ED321", h: "#C2F17E", l: "#3F7409" },
      { n: "Gold",    b: "#F5C518", h: "#FFE57A", l: "#9A7A00" },
      { n: "Grape",   b: "#9B51E0", h: "#CFA2FF", l: "#562385" },
      { n: "Tangerine", b: "#FF7F2A", h: "#FFBC8C", l: "#A54405" },
      { n: "Teal",    b: "#1FC7B6", h: "#8BF0E5", l: "#0B736A" },
    ],
  },

  space: {
    id: "space",
    name: "Space",
    tagline: "Deep field",
    blurb: "Glossy planets drifting through a starfield.",
    statusBar: "#05030F",
    unlock: "adv5",
    tones: [
      { n: "Mars",     b: "#E2553A", h: "#FFB39E", l: "#7E1E0D" },
      { n: "Neptune",  b: "#3B6CF6", h: "#A8C0FF", l: "#13308C" },
      { n: "Gaia",     b: "#2FBF71", h: "#9BEFC2", l: "#0E6B3A" },
      { n: "Saturn",   b: "#E8B04A", h: "#FFE2A3", l: "#8A5F0E" },
      { n: "Nebula",   b: "#B455E6", h: "#E6B5FF", l: "#5D1C85" },
      { n: "Comet",    b: "#5FD6F2", h: "#C6F4FF", l: "#17748A" },
      { n: "Moon",     b: "#B9B6CC", h: "#EEEDF6", l: "#625E7A" },
    ],
  },

  /* ── seasonal: earned only while their season runs (game/seasons.js) ── */
  spooky: {
    id: "spooky",
    name: "Spooky",
    tagline: "Halloween 2026",
    blurb: "Pumpkins, potions and ghost-light on a misty night.",
    statusBar: "#0D0814",
    unlock: "season_halloween2026",
    season: "halloween2026",
    tones: [
      { n: "Pumpkin", b: "#FF7A1A", h: "#FFC08A", l: "#A33E00" },
      { n: "Potion",  b: "#8B3DFF", h: "#C9A3FF", l: "#4A1599" },
      { n: "Slime",   b: "#7CE03B", h: "#C3F79A", l: "#3B7A0E" },
      { n: "Ghost",   b: "#E8E4F0", h: "#FFFFFF", l: "#9C95AE" },
      { n: "Blood moon", b: "#D9254A", h: "#FF8DA2", l: "#7A0A20" },
      { n: "Candle",  b: "#FFD23F", h: "#FFF0A8", l: "#B38A00" },
      { n: "Raven",   b: "#3E4A6B", h: "#8592B8", l: "#1B2238" },
    ],
  },

  diya: {
    id: "diya",
    name: "Diya",
    tagline: "Diwali 2026",
    blurb: "Marigolds, rangoli and lamplight on a festival night.",
    statusBar: "#120A26",
    unlock: "season_diwali2026",
    season: "diwali2026",
    tones: [
      { n: "Marigold", b: "#FF9F1C", h: "#FFD08A", l: "#A85A00" },
      { n: "Rangoli",  b: "#E8336D", h: "#FF9CBC", l: "#8C0F3A" },
      { n: "Gold",     b: "#F4C430", h: "#FFE89A", l: "#9C7A00" },
      { n: "Peacock",  b: "#0FA3B1", h: "#7FE3EC", l: "#065A62" },
      { n: "Henna",    b: "#C1440E", h: "#F0936A", l: "#6E2205" },
      { n: "Jasmine",  b: "#F5F0E1", h: "#FFFFFF", l: "#B5AC92" },
      { n: "Indigo",   b: "#5B4BDB", h: "#B0A6FF", l: "#2A1F85" },
    ],
  },
};

export const THEME_IDS = Object.keys(THEMES);

/** A skin is open if it has no unlock, or the player holds its achievement. */
export const isUnlocked = (id, profile) =>
  !THEMES[id].unlock || !!(profile && profile.trophies && profile.trophies[THEMES[id].unlock]);
export const DEFAULT_THEME = "voltage";

export const getTheme = (id) => THEMES[id] || THEMES[DEFAULT_THEME];

/** Paint a block element with one tone of the active theme. */
export function paintTone(el, theme, toneIndex) {
  const t = theme.tones[toneIndex % theme.tones.length];
  el.dataset.t = toneIndex % theme.tones.length;   // colorblind symbols key off this
  el.style.setProperty("--base", t.b);
  el.style.setProperty("--hi", t.h);
  el.style.setProperty("--lo", t.l);
}

export function applyTheme(id) {
  const theme = getTheme(id);
  document.documentElement.dataset.skin = theme.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.statusBar);
  return theme;
}
