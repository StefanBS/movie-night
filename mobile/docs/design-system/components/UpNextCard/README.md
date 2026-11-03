Scheduled-night card on Tonight: the film is the headline and the picker is credited beneath it. Mirrors the app's `UpNextCard` (which takes a `Night` object; here the fields are flattened).

- **Film first.** The title is set in Newsreader, upright and weight 500, at `--text-3xl` (44px), `text-primary`, up to three lines. No trailing full stop on a real title.
- **Picker second.** One credit line under the title: a 28px avatar and "Picked by **Tomas**" at `--text-base`, first name in `text-primary` semibold, the rest `text-secondary`. The name never goes above body size here.
- **Before the film is chosen,** the headline slot reads "Not picked yet." in `text-tertiary` (fine at 44px) and the credit reads "**Tomas** is picking".
- The accent stays rationed: the dot on the date line and the primary "Start the night". The radial ember wash and spotlight shadow are gone.
- The full-screen Tonight hero (no night planned) is different: there the picker's name is still the headline.

```jsx
<UpNextCard countdown="Tonight" time="8 pm" picker="Priya Nair" film="In the Mood for Love" coming={["Tomas Vlk","Priya Nair","Jonah Reyes","Sam Lindqvist","Mira Okafor"]} />
<UpNextCard countdown="In 3 days" date="Fri 19 Jun" time="8 pm" picker="Tomas Vlk" coming={["Tomas Vlk","Priya Nair","Jonah Reyes"]} />
```
