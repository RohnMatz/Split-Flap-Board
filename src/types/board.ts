export interface BoardState {
  rows: string[];
  feedName: string;
  feedIcon: string;
  accentCols: number[];
  nextRotationAt: number;
  revision: number;
}

export interface GridConfig {
  cols: number;
  rows: number;
}

// All characters available on the physical drum, in order.
// Single-codepoint emoji are included for weather/feed decorations.
export const FLAP_CHARACTERS =
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜÈÉ0123456789.,:!?-/\'@#$%&()°→←↑↓' +
  '☀⛅❄🌠🚀🛸🌙🌑🌒🌓🌔🌕🌖🌗🌘';

// Pre-split into an array of grapheme clusters so multi-byte emoji are one element each.
export const DRUM_CHARS: string[] = (() => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter().segment(FLAP_CHARACTERS), (s) => s.segment);
  }
  return Array.from(FLAP_CHARACTERS);
})();

// ASCII-only subset used for server-side text sanitisation.
export const SAFE_CHARS =
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜÈÉ0123456789.,:!?-/\'@#$%&()°→←↑↓';

// Same as SAFE_CHARS but as an array (for index-safe operations).
export const SAFE_CHARS_ARR: string[] = SAFE_CHARS.split('');
