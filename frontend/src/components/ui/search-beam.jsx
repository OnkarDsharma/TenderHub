/**
 * @file src/components/ui/search-beam.jsx
 * @description Brand-tuned border beam for search and prompt fields. A soft
 * blue light travels along the bottom edge; it brightens while the field is
 * focused. Follows the site's light/dark theme, and rests under reduced motion
 * (handled inside border-beam).
 */
import { useState } from 'react';
import { BorderBeam } from '@/components/ui/border-beam-search';
import { useTheme } from '@/context/ThemeProvider';

// border-beam 1.4.1 ships malformed colours for the 'line' inner glow of the
// ice/forest/candy/gold variants ("rgba(r, g, b,, a)"), so browsers drop that
// layer. We supply the same layer in the brand blues (dalBlue 600/500/400/700/300)
// through the library's own `css` hook; {id} is substituted per instance.
const glow = (w, h, dx, dy, rgba) =>
  `radial-gradient(ellipse calc(${w}px * var(--beam-w-{id})) calc(${h}px * var(--beam-h-{id})) at calc(var(--beam-x-{id}) * 100%${dx ? ` ${dx > 0 ? '+' : '-'} ${Math.abs(dx)}px` : ''}) calc(100%${dy ? ` - ${dy}px` : ''}), ${rgba}, transparent)`;

const BRAND_LINE_CSS = `
[data-beam="{id}"] { --beam-inner-opacity: 2.2; --beam-bloom-opacity: 1.8; }
[data-beam="{id}"][data-active]::before,
[data-beam="{id}"][data-fading]::before {
  background: ${[
    glow(33, 30, 0, 0, 'rgba(37, 99, 235, 0.55)'),
    glow(24, 26, 39, 3, 'rgba(59, 130, 246, 0.48)'),
    glow(27, 24, -36, 0, 'rgba(96, 165, 250, 0.52)'),
    glow(23, 28, -54, 2, 'rgba(29, 78, 216, 0.42)'),
    glow(24, 24, 51, 1, 'rgba(147, 197, 253, 0.5)'),
    glow(30, 20, 21, 0, 'rgba(59, 130, 246, 0.45)'),
    glow(25, 18, -21, 2, 'rgba(96, 165, 250, 0.42)'),
  ].join(',\n    ')};
}`;

export function SearchBeam({ children, className = '', borderRadius, size = 'line', duration = 3.1, theme }) {
  const { isDark } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <BorderBeam
      size={size}
      colorVariant="ice"
      theme={theme || (isDark ? 'dark' : 'light')}
      duration={duration}
      borderRadius={borderRadius}
      strength={focused ? 1 : 0.75}
      className={className}
      css={size === 'line' ? BRAND_LINE_CSS : undefined}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      {children}
    </BorderBeam>
  );
}

export default SearchBeam;
