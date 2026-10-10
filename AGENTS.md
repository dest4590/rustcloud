Do not run `npm run build` after changes, project has hot-reload
Instead use `npx vue-tsc --noEmit` to check for type errors in the project.

# RustCloud UI & Design Guidelines

### Aesthetic & Philosophy

- **Dark Minimalist / Industrial Sharp**: Strict dark theme (`#0d0d0d`, `#141414`).
- **No Generic AI Slop**: Avoid excessive bubbly border-radii, floating emoji cards, rainbow gradients, heavy drop shadows, or generic marketing copy.
- **Sharp / Zero Border Radius**: All buttons, card boxes, containers, tags, and inputs use `border-radius: 0` (or at most `1px` subtle squaring).
- **Typography & Case**:
  - Consistent lowercase section headers, button labels, and descriptions (`equalizer`, `lyrics`, `settings`, `download`, `rust native audio player`).
  - Monospace or clean geometric sans-serif fonts (`10px`–`12px` sizes, compact line heights).
- **Color Palette & Borders**:
  - Primary Accent: `--rc-primary` (`#ff5500` / `#ff6a1a`).
  - Background: `--rc-bg` (`#0d0d0d`), Panels: `--rc-bg-card` (`#141414`).
  - Borders: 1px solid `--rc-border` (`#222222` or `#282828`).
  - Text: High-contrast white (`#ffffff`) for titles, muted gray (`#888888`) for descriptions and subtext.
- **Controls & Buttons**:
  - Use `.rc-card-box`, `.rc-btn`, `.rc-btn-primary`.
  - Minimalistic square switches and flat tab bars with monochrome SVG icons.

On new tauri command, update permissions in `src-tauri/permissions` folder
