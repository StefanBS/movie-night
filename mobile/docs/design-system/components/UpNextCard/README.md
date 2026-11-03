Scheduled-night card on Tonight: the film is the headline and the picker is credited beneath it. Mirrors the app's `UpNextCard` (which takes a `Night` object; here the fields are flattened).

- **Film first.** The poster (88×132, `Poster`, `radius-sm`) sits beside the title. The title is Newsreader, upright and weight 500, at `--text-2xl` (30px), `text-primary`, with no trailing full stop. It is always shown in full, over as many lines as it needs; never cut it.
- **Film details**, in `text-tertiary` at `--text-sm` with tabular figures, one per line under the title:
  - **Year** ("2000").
  - **Genres**, comma-separated ("Drama, Romance"). One line only: a list too long for it is cut with "…".
  - **Length** ("1h 38m").
  Leave out any part you don't have; never show a placeholder.
- **Picker second.** One credit line under the title: a 28px avatar and "Picked by **Tomas**" at `--text-base`, first name in `text-primary` semibold, the rest `text-secondary`. The name never goes above body size here.
- **Before the film is chosen,** an empty poster slot (hairline outline, same size) sits beside "Not picked yet." in `text-tertiary`, with no meta line, and the credit reads "**Tomas** is picking".
- **One main button, and it says what happens next.** It changes with the night:
  | Night | Main button | What it does |
  |---|---|---|
  | No film yet | **Choose the film** (`onChooseFilm`) | Opens the film search for the picker. |
  | Film chosen, night is today or passed unsaved (`due`) | **We watched it** (`onWatched`) | Confirms who came, saves the night to Watched, moves the rotation on. |
  | Film chosen, night still ahead | none | Nothing to do yet. Tapping the card (`onOpen`) opens the night. |
  "Edit" is always there as the secondary button. There is no "Start the night": a night doesn't need starting, and the old button only opened a screen that repeated the card.
- The accent stays rationed: the dot on the date line and the one main button, when there is one. The radial ember wash and spotlight shadow are gone.
- The full-screen Tonight hero (no night planned) is different: there the picker's name is still the headline.

```jsx
// Before the film: main button is "Choose the film"
<UpNextCard countdown="In 3 days" date="Fri 19 Jun" time="8 pm" picker="Tomas Vlk" coming={["Tomas Vlk","Priya Nair","Jonah Reyes"]} onChooseFilm={openSearch} onEdit={editNight} onOpen={openNight} />
// On the night, film chosen: main button is "We watched it"
<UpNextCard due countdown="Tonight" time="8 pm" picker="Priya Nair" film="In the Mood for Love" posterUri={tmdbUrl} hue={8} year={2000} genre={["Drama", "Romance"]} runtime="1h 38m" coming={["Tomas Vlk","Priya Nair","Jonah Reyes","Sam Lindqvist","Mira Okafor"]} onWatched={recordNight} onEdit={editNight} onOpen={openNight} />
// Film chosen, night still ahead: no main button
<UpNextCard countdown="In 3 days" date="Fri 19 Jun" time="8 pm" picker="Tomas Vlk" film="Past Lives" year={2023} genre="Drama" runtime="1h 46m" onEdit={editNight} onOpen={openNight} />
```

**Migrating from `onStart`:** remove it. Pass `due` (true when the night's date is today or earlier and it isn't saved yet), and wire `onChooseFilm`, `onWatched` and `onOpen`. In the app, "We watched it" can reuse the People step pre-filled with who's coming, then the Done screen.
