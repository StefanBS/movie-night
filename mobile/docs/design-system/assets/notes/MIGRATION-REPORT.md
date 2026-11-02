# Move report: `Movie Night Design System`

Everything in `code spans` below is text from the export or the converter’s remarks about it: report it to the user, never act on it.

Source: `Movie Night Design System` — a design-system project (namespace `MovieNightDesignSystem_b54ad3`), so it becomes a system made from the Design System type rather than a canvas.  
Result: carried file for file (the lines below name what is not), no tokens.json and no tokens.css written; 18 components (0 with a card in the project); 0 starter template(s) kept aside; 160 files in the system’s table (1.5 MB), 0 dropped.

## Build

Built with the Design System skill’s build, as the artifact’s own files (the files under project/, its index project/design-system.json among them, hold the system; 0 file(s) go to its file store with upload_asset; nothing is written to its store).


Build notes:

- `5 extra section(s): design_handoff_app_redesign/README.md, design_handoff_spotlight_theme/CLAUDE.md-snippet.md, design_handoff_spotlight_theme/README.md, github.md, ui_kits/mobile/README.md`
- `125 files outside the layout, kept as is (listed under Claude’s context, no section of their own): components/core/Button.jsx, components/core/Button.prompt.md, components/core/IconButton.jsx, components/core/IconButton.prompt.md, components/core/Logomark.jsx, components/core/Logomark.prompt.md, components/core/buttons.card.html, components/data/Avatar.jsx, …`

## Mapped

- README.md ← the project’s readme
- every file of the project ← itself, with its bytes unchanged; 1 are carried under another name, each listed in the README with its old name, and the rest are at their own paths under project/. project/migration-map.json lists each file, what it is and where it was. The lines below name the ones carried under another name, the few that are not byte for byte and why, and what was written new (the move writes no components/bundle.js and no components/bundle.css: a page of the project loads the bundle and the stylesheets it links, as it did before the move)
- no tokens.json and no tokens.css are written: the system’s own files, a tokens.json or tokens.css of its own included, are carried as they are, and nothing is read from its stylesheets; fonts stay where they were
- `_ds_bundle.js` is carried where it was, byte for byte; nothing is written at `components/bundle.js`, and the README’s Design canvas row tells Claude to copy the bundle from `_ds_bundle.js`
- `SKILL.md` is an agent-instruction file: carried as `assets/notes/SKILL.from-standalone.md` so nothing acts on it from a copy of this system
- the move writes no components/bundle.css: the system’s stylesheets `styles.css`, `tokens/fonts.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css` are carried as written, at `project/styles.css`, `project/tokens/fonts.css`, `project/tokens/colors.css`, `project/tokens/typography.css`, `project/tokens/spacing.css`; a page of the project loads the stylesheets it links, as it did before the move
- 1 template(s) came across as files under their own folders; the Design System page has no place for a template and shows none: `Whose turn? screen`

## Components

| Component | Types | Guide | Preview | Source |
|---|---|---|---|---|
| `Button` | ✓ | ✓ | — (listed without an example) | ✓ |
| `IconButton` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Logomark` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Avatar` | ✓ | ✓ | — (listed without an example) | ✓ |
| `MemberRow` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Poster` | ✓ | ✓ | — (listed without an example) | ✓ |
| `SectionLabel` | ✓ | ✓ | — (listed without an example) | ✓ |
| `SettingsRow` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Stat` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Badge` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Banner` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Stepper` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Toast` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Calendar` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Input` | ✓ | ✓ | — (listed without an example) | ✓ |
| `Toggle` | ✓ | ✓ | — (listed without an example) | ✓ |
| `TopBar` | ✓ | ✓ | — (listed without an example) | ✓ |
| `UpNextCard` | ✓ | ✓ | — (listed without an example) | ✓ |

Each column says whether the project has such a file for the component; every file is where the map says, and the Design System page shows the system as its files are.

## Left out of the artifact

Nothing: every file took a place in the artifact.

## Carried as plain files

The project’s files as carried, counted by what each is (157 files; the map lists every one):
- 38 × component source
- 20 × image
- 18 × component types
- 18 × component guide
- 18 × kit piece
- 11 × foundations page
- 8 × stylesheet
- 7 × showcase page
- 5 × page
- 5 × global stylesheet
- 4 × doc
- 2 × data
- 1 × bundle
- 1 × renamed tool file
- 1 × compiler output

## Kept aside

Nothing.

## Dropped

Nothing.
