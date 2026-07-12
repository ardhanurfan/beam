# Beam — Design System

> Adapted from the original reference document (a study of Figma's marketing design language) into the working design system of the Beam mobile app. The DNA carries over — monochrome core, pastel color blocks, pill CTAs, mono-as-taxonomy — re-grounded in Beam's actual screens and tokens (`src/app/globals.css` `@theme`).

## Overview

Beam is, at the system level, a tool-clean black-and-white frame. The chrome — header, bottom nav, body type, buttons — is monochrome. Body copy is Inter, small mono `.eyebrow` labels (JetBrains Mono, all-caps, positive tracking) act as section markers, and every primary CTA is a pill: the same black `bg-primary text-on-primary` pill everywhere.

What makes the design distinctive is what happens **between** those monochrome bookends: the UI drops into pastel **color blocks** — lime, lilac, cream, mint, pink, coral, and a deep navy — that carry state and grouping. They aren't accents tucked into a card; a sheet, a banner, or the entire terminal takes the surface. The terminal tab is the navy block at full-viewport scale; the workspace picker is a cream sheet; the panic-rollback confirmation is a coral sheet — the color *is* the message.

This is a system built on contrast: the monochrome chrome makes the color blocks feel intentional rather than decorative, and the color blocks make the monochrome chrome feel like a calm instrument panel rather than enterprise SaaS. The interface never reaches for shadows or gradients to do the work that color blocks and confident typography already do.

**Key characteristics:**

- Monochrome system core: `ink` on `canvas` carries every control, every label, every list row.
- One brand accent: **lime `#d8f878`** — the logo tile, the active session chip, the send button, the terminal cursor. Never a body surface for prose.
- Pastel `block-*` surfaces define state and grouping: cream = pickers/empty states, lilac = info, pink = errors, coral = warnings/destructive context, mint = prompt badges, navy = the terminal.
- Pill is the only CTA shape — `rounded-pill` for text buttons and chips, `rounded-full` for icon buttons. No square buttons anywhere.
- JetBrains Mono reserved for taxonomy — eyebrows, file paths, session ids, versions — always uppercase for labels, never body copy.
- Thumb-first: bottom sheets instead of centered modals (except small destructive confirmations), 44px touch targets, safe-area padding.

## Colors

> Source of truth: `src/app/globals.css` `@theme`. Values marked ~ were reconstructed after the 2026-07-12 incident and are close approximations; tune freely.

### Monochrome core

- **Ink** (`--color-ink` `#000000`): all text and icons on light surfaces. There is no mid-gray text role — hierarchy comes from weight and opacity modifiers (`opacity-60`, `opacity-70`), not extra tokens.
- **Canvas** (`--color-canvas` `#ffffff`): app background, sheet bodies, cards.
- **Inverse Ink** (`--color-inverse-ink` ~`#e8e6f5`): type on dark surfaces (the action-log strip on `block-navy`; matches the xterm foreground).
- **Surface Soft** (`--color-surface-soft` ~`#f4f3ef`): off-white tile for icon buttons, soft cards, inactive chips.
- **Hairline** (`--color-hairline` ~`#e7e5df`): 1px borders on inputs, list rows, cards — stroke instead of shadow.
- **Hairline Soft** (`--color-hairline-soft` ~`#f1f0ea`): even subtler dividers — file-list row separators.
- **Primary / On-Primary** (`#000000` / `#ffffff`): the black pill CTA pair ("Run", "Create", "Commit & Push").

### Brand & accent

- **Block Lime** (`--color-block-lime` `#d8f878`): the signature. Logo tile, active session chip, send button, xterm cursor, agent-installed badge. Reserve for "this is Beam / this is active".
- **Accent Magenta** (`--color-accent-magenta` ~`#e6399b`): a single saturated accent reserved for live/recording states (the pulsing mic). Use scarcely; it is not a section color.

### Color blocks (pastel surfaces)

- **Block Cream** (~`#f5efe2`): workspace picker sheet, empty states.
- **Block Lilac** (~`#e4defa`): info banners (missed output), subagent badge.
- **Block Mint** (~`#dcf2e2`): prompt badge.
- **Block Pink** (~`#fadbe4`): inline error strips.
- **Block Coral** (~`#ffd9c8`): warnings — the panic-rollback sheet, the connecting/resyncing status dot.
- **Block Navy** (`#0d0c1d`): the terminal surface — the only dark block, and it owns the largest viewport share in the app. xterm theme matches: foreground `#e8e6f5`, selection `#3d3766`, cursor lime.

### Semantic

- **Success** (~`#34a26b`): connected status dot. Glyph/dot fill, not a surface.
- **Danger** (~`#e5484d`): destructive buttons (End session, Delete, rollback confirm), offline dot.
- **Overlay scrim**: black at 60% (`bg-black/60`) behind sheets and dialogs.

## Typography

### Font family

- **Inter** (`--font-sans`, via `next/font`): all UI text. 16px base, letter-spacing −0.14px, antialiased. (The original system used a proprietary variable sans; Inter is its documented substitute.)
- **JetBrains Mono** (`--font-mono`): taxonomy and the terminal. Eyebrows and captions are always uppercase with positive tracking.

### Hierarchy

| Role | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| App title | 17px | 600 | −0.3px | "Beam" in the header |
| Section/card title | 14–16px | 600 | −0.14px | Card headings, dialog titles |
| Body | 14–15px | 400 | −0.14px | Prose, descriptions, buttons |
| Small body | 12–13px | 400 | −0.14px | Hints, secondary rows |
| `.eyebrow` | 12px | 400 | +0.6px | Mono uppercase section labels ("CONNECTION", "AGENTS") |
| Mono meta | 11–12px | 400 | 0 | Paths, session ids, versions, log lines |
| Terminal | 12px / 1.25 | 400 | 0 | xterm.js |

### Principles

- **Weight, not size, carries hierarchy on body copy.** A 14px semibold title sits next to 14px regular prose — the eye reads emphasis without scale change.
- **Mono is taxonomy, not body.** JetBrains Mono flags classification (paths, ids, labels) and renders the terminal — never a paragraph.
- **Opacity for de-emphasis.** Secondary text is `opacity-55/60/70` ink, not a gray token.

## Layout

### Spacing

- Base unit 4px (Tailwind spacing scale). Common rhythm: `px-4` screen gutters, `p-4` card interiors, `p-5` sheet interiors, `gap-2/3` list spacing.
- Bottom safe area: every sheet and the nav pad with `env(safe-area-inset-bottom)`.

### Structure

Single-screen app (no routes): header (56px) → optional banner → tab content (`flex-1`) → bottom nav. All four tabs stay mounted and toggle via CSS — unmounting would destroy the xterm instance. The shell shrinks to the visual viewport when the phone keyboard opens, so nothing hides behind the keyboard.

### Whitespace philosophy

Canvas whitespace makes the color blocks feel deliberate: a pastel surface never sits directly against another pastel — white canvas (or the scrim) separates them. Inside a block, content gets generous padding (20–24px) so the block reads as a panel, not a wall.

## Elevation & Depth

| Level | Treatment | Use |
| --- | --- | --- |
| 0 (flat) | No shadow, no border | Color blocks, terminal, header |
| 1 (hairline) | 1px `hairline` border on `canvas` | Cards, list rows, inputs |
| 2 (soft) | `surface-soft` fill | Icon buttons, inactive chips |
| 3 (overlay) | `black/60` scrim + sheet/dialog | Sheets, confirmations |

Beam is shadow-free by design — the color blocks substitute for elevation. Separation comes from hairlines, soft fills, and surface changes.

## Shapes

| Shape | Radius | Use |
| --- | --- | --- |
| `rounded-pill` | 999px | Text CTAs, chips, tabs, toggles |
| `rounded-full` | 9999px | Icon buttons, status dots |
| `rounded-xl` / `rounded-2xl` | 12/16px | Cards, list rows, inputs |
| `rounded-[20px]`–`[24px]` | 20–24px | Dialogs, sheets (top corners), empty-state blocks |
| Logo tile | 116/512 | App icon squircle |
| Prompt bar | 22px | The chat-style input capsule |

## Components

### Buttons

- **`button-primary`** — black pill, white text (`bg-primary text-on-primary rounded-pill`). "Run", "Create", "Commit & Push". One per view section; the brand signature.
- **`button-secondary`** — hairline-bordered canvas pill ("Cancel", "Keep my changes"). No fill.
- **`button-danger`** — `bg-danger` pill, white text; only inside confirmation dialogs/sheets.
- **`button-icon-circular`** — 32–40px circle, `surface-soft` fill (close ×, refresh) or `white/10` on the navy terminal.
- **Send button** — the lime circle with a black arrow; the terminal's primary action.

### Chips & tabs

- **Session chips** (terminal tab strip): h-8 pills — active = lime fill with black text + status dot + × affordance; inactive = `white/10` on navy.
- **Filter pills** (agents, git roots): selected = `primary` fill (selected = primary surface, same rule as the original system); unselected = hairline border.
- **Shortcut keys** (terminal): h-8 `rounded-md` `white/10` keys — the one square-ish exception, because they represent keyboard keys.

### Sheets (signature)

The bottom sheet is Beam's color-block section. Shared frame `.sheet` (+ `.sheet-scroll` for the long region): 24px top corners, `max-height: 80dvh`, safe-area padding, scrim `black/60`, tap-to-dismiss.

- **`sheet-canvas`** — default: connection sheet, commit sheet, new-session picker, create-skill dialog.
- **`sheet-cream`** — workspace picker (`bg-block-cream`).
- **`sheet-coral`** — panic rollback (`bg-block-coral`): the surface itself warns.

### Dialogs

Centered `max-w-sm rounded-[20px]` canvas cards — reserved for small destructive decisions (end session, delete skill, discard file). Confirm button is `danger`; body includes the mono path of what's being destroyed.

### Status indicators

- **Status dot**: 2–2.5px radius circle — `success` connected, `danger` offline, pulsing `block-coral` connecting/resyncing. Appears in the header, session chips, and connection sheet.
- **Banners**: full-width lilac strip (missed output) with a dismiss ×; pink strip for inline errors.
- **Log strip**: mono 12px action log lines (commit/stash output).

### Terminal (signature surface)

The navy block at full scale: xterm.js pane, session tab strip on top, shortcut-key row + chat-style prompt bar (white/10 capsule, lime send) at the bottom. Everything on navy uses white at opacities (`text-white/80`, `bg-white/10`) instead of gray tokens.

### Navigation

- **Header**: 56px canvas bar — logo tile, app name + status dot (tap → connection sheet), workspace picker pill right-anchored.
- **Bottom nav**: 4 tabs (Terminal · Source · Files · Agents), icon + 11px label, active = ink, inactive = `opacity-40`.

## Do's and Don'ts

### Do

- Reserve `primary` (black fill) for genuine primary CTAs and selected states.
- Reserve **lime** for brand/active moments: logo, active session, send. One lime element per region.
- Pick **one** `block-*` surface per sheet/banner and let the color carry the meaning (coral = destructive context, lilac = info, pink = error, cream = neutral picker).
- Keep mono for taxonomy: paths, ids, eyebrows — uppercase for labels, with positive tracking.
- Compose every text CTA as a pill and every icon button as a circle.
- Return to canvas between colored surfaces — scrim or white, never pastel-on-pastel.
- Put destructive actions behind an explicit confirmation with a `danger` confirm button.

### Don't

- Don't introduce mid-gray text tokens — de-emphasis is ink at reduced opacity.
- Don't add drop shadows — hairlines and surface changes are the depth device.
- Don't introduce new accent colors outside `block-*` + `accent-magenta`.
- Don't use lime as a large prose surface — it's an accent tile, not a reading background.
- Don't square off CTAs (shortcut "keys" in the terminal are the only intentional exception).
- Don't set body copy in mono.
- Don't stack two pastel surfaces without canvas/scrim between them.

## Responsive Behavior

Beam is **mobile-first and phone-only by intent** — the desktop browser gets the same single-column layout.

- **Viewport**: `h-dvh` shell; shrinks to `visualViewport` height when the virtual keyboard opens (iOS scroll-jump compensation) — the terminal re-fits its rows live.
- **Touch targets**: min 44px for primary controls; 32px only for tightly-packed secondary icons (with padding hit area).
- **Horizontal overflow**: never on the page body. Pill rows (`.no-scrollbar`) scroll horizontally inside their own strip; the terminal syncs PTY `cols`/`rows` to the rendered size so TUIs wrap correctly.
- **Sheets**: `max-height 80dvh`, content region scrolls (`.sheet-scroll`), header/footer pinned.
- **PWA**: standalone display, portrait orientation, lime `background_color` splash, safe-area aware (`viewportFit: cover`).

## Iteration Guide

1. Change one component at a time and keep it consistent everywhere it appears (chips, sheets, and dialogs are shared patterns, not per-view styles).
2. When introducing a new surface, decide **first** which `block-*` token it sits on; the surface choice is the most consequential decision.
3. New tokens go into `globals.css` `@theme` — never hardcode a hex in a component (exceptions: the xterm theme object, which mirrors `block-navy`).
4. Keep `primary` scarce: two black pills in one viewport means the section is doing too much — demote one to secondary.
5. Treat `accent-magenta` as single-shot: one live/recording indicator at a time.
6. Destructive flows always get: explicit confirmation UI + server-side confirm token/flag (see `/api/git/rollback`, `/api/sessions/kill`, `/api/fs/write`).

## Known Gaps

- Exact pastel hex values (`surface-soft`, `hairline`, `success`, `danger`, `accent-magenta`, cream/lilac/mint/pink/coral) were reconstructed after the 2026-07-12 working-tree incident from the shipped UI — faithful approximations, not recovered specs. `canvas`, `ink`, `block-lime`, `block-navy` are confirmed originals.
- Dark mode is not designed — the navy terminal is the only dark surface by intent.
- Landscape orientation is unspecified; the manifest locks portrait.
- Error/validation styling for form inputs is minimal (pink strip + message); a per-field error treatment is not documented.
