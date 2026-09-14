// Theme system: a light and a dark palette, switched at runtime via ThemeProvider/
// useTheme rather than static exports -- so the toggle in App.jsx's header can
// actually re-theme every component, not just the Admin brand page.
//
// Light is teKnoculture's real brand palette (white ground, brand red, dusty-rose
// borders -- see AdminPage.jsx). Dark is the tool's original green-accent dev-tool
// look, kept as the alternate mode rather than the default, since white is more
// on-brand.

import { createContext, useContext, useState } from 'react';

export const TYPE_SHAPE = { tool: 'circle', dataset: 'diamond', manual: 'triangle' };
export const TYPE_LABEL = { tool: 'Tool', dataset: 'Dataset', manual: 'Manual step' };

const DARK = {
  BG: '#0E1116',
  CANVAS_BG: '#0B0D11',
  ON_ACCENT: '#12140C',
  PANEL: '#171B22',
  BORDER: '#262C36',
  TEXT: '#E7E9EE',
  MUTED: '#8B93A1',
  ACCENT: '#C9E265',
  ACCENT_ALT: '#7FB5B0',
  WARN: '#E08A8A',
  EDGE_IDLE: '#3A4150',
  GOAL: '#E8C547',
  TYPE_COLOR: { tool: '#5FA8D3', dataset: '#D9A441', manual: '#B98BC9' },
};

// Real brand tokens where the guide defines one (--background, --foreground,
// --brand-red, --brand-dusty-rose, --brand-mauve, --brand-dark-red). MUTED uses
// Tailwind gray-600 per the guide's own "only text-gray-600/700 permitted" rule.
// EDGE_IDLE, GOAL, and TYPE_COLOR have no brand-guide definition (the guide
// doesn't cover a graph-canvas UI) -- picked for contrast on white, not brand-derived.
const LIGHT = {
  BG: '#FFFFFF',
  CANVAS_BG: '#FFEFE8', // --brand-blush
  ON_ACCENT: '#FFFFFF',
  PANEL: '#FFFFFF',
  BORDER: '#EEC7C7', // --brand-dusty-rose
  TEXT: '#000000', // --foreground (light)
  MUTED: '#4B5563', // Tailwind gray-600
  ACCENT: '#DF2521', // --brand-red
  ACCENT_ALT: '#DA9894', // --brand-mauve
  WARN: '#800000', // --brand-dark-red
  EDGE_IDLE: '#D1D5DB',
  GOAL: '#B8860B',
  TYPE_COLOR: { tool: '#2563A8', dataset: '#A9740C', manual: '#7E4F92' },
};

const PALETTES = { dark: DARK, light: LIGHT };

const ThemeContext = createContext({ mode: 'light', setMode: () => {}, colors: withDerived(LIGHT) });

function withDerived(base) {
  return { ...base, PATH_ACCENTS: [base.ACCENT, base.ACCENT_ALT, base.TYPE_COLOR.dataset, base.TYPE_COLOR.manual, base.TYPE_COLOR.tool] };
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light');
  const colors = withDerived(PALETTES[mode]);
  return <ThemeContext.Provider value={{ mode, setMode, colors }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
