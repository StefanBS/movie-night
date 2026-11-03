The app's bottom navigation, with four tabs: Tonight, Upcoming, Watched and Club. Mirrors the app's tab navigator. On Expo, render it as the `tabBar` of a bottom-tab navigator and use `lucide-react-native` for the same icons.

| Tab | Icon (Lucide) | What it holds |
| --- | --- | --- |
| **Tonight** | `clapperboard` | Whose turn it is, the next night, the queue. |
| **Upcoming** | `calendar-days` | Planned and repeating nights; where a night is planned. |
| **Watched** | `library` | Every film watched, who picked it, who was there. |
| **Club** | `users-round` | Members, the rotation, guests. |

- **Settings is not a tab.** It opens from the gear in the Tonight top bar.
- **Look:** a translucent `surface-tab-bar` with a `border-hairline` along the top. Each tab is a 24px Lucide icon (2px stroke, `currentColor`) over a 12px label.
- **States:** the active tab is `text-primary` with a semibold label and `aria-current="page"`. Inactive tabs are `text-secondary` with a medium label.
- **No ember, ever.** The accent stays with the picker and the screen's one primary action. No badges or dots on tabs.
- The tabs read now, next, past, people: Tonight, Upcoming, Watched, Club. Labels are one word in sentence case. Tap targets are at least 48px tall.
- The consumer provides the bottom safe-area inset (the default bottom padding is `--space-6`) and the positioning (fixed or absolute at the bottom).

```jsx
<TabBar active="tonight" onChange={(id) => navigate(id)} />
```
