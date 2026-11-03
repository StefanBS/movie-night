The app's bottom navigation, with three tabs: Tonight, Watched and Club. Mirrors the app's tab navigator. On Expo, render it as the `tabBar` of a bottom-tab navigator and use `lucide-react-native` for the same icons.

| Tab | Icon (Lucide) | What it holds |
| --- | --- | --- |
| **Tonight** | `clapperboard` | Whose turn it is, every planned night (the next as the card, others under "Also planned"), the queue. |
| **Watched** | `library` | Every film watched, who picked it, who was there. |
| **Club** | `users-round` | Members, the rotation, guests. |

- **Settings is not a tab.** It opens from the gear in the Tonight top bar.
- **Look:** a translucent `surface-tab-bar` with a `border-hairline` along the top. Each tab is a 24px Lucide icon (2px stroke, `currentColor`) over a 12px label.
- **States:** the active tab is `text-primary` with a semibold label and `aria-current="page"`. Inactive tabs are `text-secondary` with a medium label.
- **No ember, ever.** The accent stays with the picker and the screen's one primary action. No badges or dots on tabs.
- The tabs read now, past, people: Tonight, Watched, Club. There is no calendar tab: a group that plans one night at a time would see one entry there, the same night Tonight already shows. A repeating schedule lives in Edit night › Repeat. Labels are one word in sentence case. Tap targets are at least 48px tall.
- The consumer provides the bottom safe-area inset (the default bottom padding is `--space-6`) and the positioning (fixed or absolute at the bottom).

```jsx
<TabBar active="tonight" onChange={(id) => navigate(id)} />
```
