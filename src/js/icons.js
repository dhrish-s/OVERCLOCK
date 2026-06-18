// icons.js - a small original line-icon set (stroke-based, 24x24, currentColor)
// so the whole app shares one consistent visual language without pulling in
// an icon font or library. Every icon is a plain <path>/<g> string; callers
// wrap it in an <svg> via icon(name, size).

const PATHS = {
  // --- category icons ---
  code: '<polyline points="9 7 4 12 9 17"/><polyline points="15 7 20 12 15 17"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="12" rx="1.6"/><path d="M8 7V5.6A1.6 1.6 0 0 1 9.6 4h4.8A1.6 1.6 0 0 1 16 5.6V7"/><line x1="3" y1="12.5" x2="21" y2="12.5"/>',
  layers:
    '<polygon points="12 3 21 8 12 13 3 8 12 3"/><polyline points="3 13 12 18 21 13"/><polyline points="3 17.5 12 22.5 21 17.5"/>',
  github:
    '<path d="M12 2.5a9.5 9.5 0 0 0-3 18.52c.48.09.65-.21.65-.46v-1.8c-2.65.58-3.2-1.13-3.2-1.13-.44-1.1-1.07-1.4-1.07-1.4-.87-.6.07-.58.07-.58.97.07 1.48 1 1.48 1 .85 1.46 2.24 1.04 2.78.79.09-.62.34-1.04.62-1.28-2.12-.24-4.35-1.06-4.35-4.7 0-1.04.37-1.89.98-2.55-.1-.24-.42-1.22.1-2.55 0 0 .8-.26 2.63 1a9 9 0 0 1 4.79 0c1.83-1.25 2.63-1 2.63-1 .52 1.33.2 2.31.1 2.55.61.66.98 1.5.98 2.55 0 3.65-2.24 4.46-4.37 4.7.35.3.65.89.65 1.8v2.66c0 .26.17.55.66.46A9.5 9.5 0 0 0 12 2.5z"/>',

  // --- stats / status ---
  flame:
    '<path d="M12 2.5c1.2 2.4-1.6 3.6-1.6 6.2 0 1.2.9 2.1 2 2.1.8 0 1.5-.5 1.8-1.2.9 1 1.4 2.3 1.4 3.7 0 3-2.5 5.2-5.6 5.2S4.4 16.3 4.4 13.3c0-4.4 3.4-6.4 4.7-9.1.5-1 1.7-2.2 2.9-1.7z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 14.3c.4.9 1.4 1.5 2.8 1.5 1.8 0 3-.8 3-2 0-1.5-1.5-1.8-3-2.1-1.4-.3-2.6-.6-2.6-1.9 0-1.1 1.1-1.8 2.6-1.8 1.2 0 2.1.5 2.5 1.3"/><line x1="12" y1="6.6" x2="12" y2="8" /><line x1="12" y1="16" x2="12" y2="17.4"/>',
  star: '<path d="M12 3.2l2.6 5.5 5.9.6-4.5 4 1.3 5.9-5.3-3.1-5.3 3.1 1.3-5.9-4.5-4 5.9-.6z"/>',
  trophy:
    '<path d="M8 4h8v5.2A4 4 0 0 1 12 13.2 4 4 0 0 1 8 9.2z"/><path d="M8 5H5.4A2.4 2.4 0 0 0 5.4 9.8H8"/><path d="M16 5h2.6A2.4 2.4 0 0 1 18.6 9.8H16"/><line x1="12" y1="13.2" x2="12" y2="17"/><line x1="8.5" y1="20" x2="15.5" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/>',
  chart: '<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="13" width="3" height="7"/><rect x="11" y="9" width="3" height="11"/><rect x="16" y="5" width="3" height="15"/>',
  shield:
    '<path d="M12 3.4 19.2 6v6.1c0 4.4-3.1 7.4-7.2 8.6-4.1-1.2-7.2-4.2-7.2-8.6V6z"/><polyline points="9 12 11.3 14.3 15.2 10"/>',

  // --- nav / misc UI ---
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5h12V10"/><line x1="9.5" y1="19.5" x2="9.5" y2="14.5"/><line x1="14.5" y1="19.5" x2="14.5" y2="14.5"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="16" rx="1.6"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="8" y1="3" x2="8" y2="6.8"/><line x1="16" y1="3" x2="16" y2="6.8"/>',
  gift: '<rect x="3.5" y="9.5" width="17" height="11" rx="1"/><line x1="3.5" y1="14" x2="20.5" y2="14"/><line x1="12" y1="9.5" x2="12" y2="20.5"/><path d="M12 9.5c-1.6 0-3.6-.6-3.6-2.6S9.6 4.5 11 5.4c1 .6 1 2.3 1 4.1z"/><path d="M12 9.5c1.6 0 3.6-.6 3.6-2.6S14.4 4.5 13 5.4c-1 .6-1 2.3-1 4.1z"/>',
  book: '<path d="M4 5.2c2.4-1 5.4-1 8 .4 2.6-1.4 5.6-1.4 8-.4v13.6c-2.4-1-5.4-1-8 .4-2.6-1.4-5.6-1.4-8-.4z"/><line x1="12" y1="5.6" x2="12" y2="19.2"/>',
  list: '<line x1="9" y1="6.5" x2="20.5" y2="6.5"/><line x1="9" y1="12" x2="20.5" y2="12"/><line x1="9" y1="17.5" x2="20.5" y2="17.5"/><circle cx="4.3" cy="6.5" r="1"/><circle cx="4.3" cy="12" r="1"/><circle cx="4.3" cy="17.5" r="1"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H2.5a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.2 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H8.7A1.7 1.7 0 0 0 9.7 3V2.8a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.2.6.7 1.1 1.5 1.1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',

  // --- reminders / wellbeing ---
  water:
    '<path d="M12 3.2c2.6 3.4 6 7.6 6 11.2a6 6 0 1 1-12 0c0-3.6 3.4-7.8 6-11.2z"/>',
  footprints:
    '<path d="M8.5 4.5c-1.8 0-2.8 1.7-2.8 3.6 0 1.3.5 2.2 1.1 3.1.6.9.9 1.6.7 2.7-.2 1.2-1.3 1.8-2.4 1.5"/><path d="M15.5 9.5c1.8 0 2.8 1.7 2.8 3.6 0 1.3-.5 2.2-1.1 3.1-.6.9-.9 1.6-.7 2.7.2 1.2 1.3 1.8 2.4 1.5"/><ellipse cx="7.3" cy="6.6" rx="1.3" ry="1.7"/><ellipse cx="16.7" cy="11.6" rx="1.3" ry="1.7"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 2H4.4z"/><path d="M9.7 20.5a2.3 2.3 0 0 0 4.6 0"/>',

  // --- timer / transport controls ---
  play: '<polygon points="6.5 4.5 19.5 12 6.5 19.5"/>',
  pause: '<rect x="6" y="4.5" width="4.2" height="15" rx="0.8"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="0.8"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.6"/>',
  reset:
    '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><polyline points="3.5 4.5 4 8.4 7.9 8"/>',

  // --- generic actions ---
  check: '<polyline points="5 12.5 9.5 17 19 6.5"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M4 16.5V20h3.5L18 9.5 14.5 6z"/><line x1="13" y1="7.5" x2="16.5" y2="11"/>',
  trash:
    '<polyline points="5 7 19 7"/><path d="M9 7V5.4A1.4 1.4 0 0 1 10.4 4h3.2A1.4 1.4 0 0 1 15 5.4V7"/><path d="M7 7l1 12.4A1.6 1.6 0 0 0 9.6 21h4.8a1.6 1.6 0 0 0 1.6-1.6L17 7"/><line x1="10" y1="10.7" x2="10.4" y2="17"/><line x1="14" y1="10.7" x2="13.6" y2="17"/>',
  chevronLeft: '<polyline points="14.5 5 8 12 14.5 19"/>',
  chevronRight: '<polyline points="9.5 5 16 12 9.5 19"/>',
  chevronDown: '<polyline points="5 9.5 12 16 19 9.5"/>',
  download: '<path d="M12 3.5v11"/><polyline points="7.2 10.2 12 15 16.8 10.2"/><line x1="4.5" y1="19.5" x2="19.5" y2="19.5"/>',
  upload: '<path d="M12 19.5v-11"/><polyline points="7.2 13.3 12 8.5 16.8 13.3"/><line x1="4.5" y1="4.5" x2="19.5" y2="4.5"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><line x1="15.5" y1="15.5" x2="20" y2="20"/>',
  archive:
    '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v9.4A1.6 1.6 0 0 0 6.6 20h10.8A1.6 1.6 0 0 0 19 18.4V9"/><line x1="10" y1="13" x2="14" y2="13"/>',
  pulse: '<polyline points="2 12 6.5 12 9 5 14 19 16.5 12 22 12"/>',
  alertTriangle:
    '<path d="M12 4 21 19H3z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="16.7" r="0.15" fill="currentColor" stroke="none"/>',
  minimizeWin: '<line x1="5" y1="12" x2="19" y2="12"/>',
  maximizeWin: '<rect x="5.5" y="5.5" width="13" height="13" rx="1"/>',
};

/** Returns a complete <svg> string for the given icon name. */
export function icon(name, size = 20, extraClass = '') {
  const body = PATHS[name];
  if (!body) {
    console.warn(`[overclock] unknown icon "${name}"`);
    return '';
  }
  return `<svg class="oc-icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
