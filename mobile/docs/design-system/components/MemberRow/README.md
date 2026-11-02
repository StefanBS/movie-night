The core list row. Mirrors the app's `MemberRow`.

```jsx
<MemberRow name="Tomas Vlk" meta="First turn" highlighted trailing={<Badge solid>Next up</Badge>} />
<MemberRow name="Priya Nair" compact trailing="2 picks · May 22" />
<MemberRow name="Old Friend" meta="Inactive" muted />
```

Rows sit flush on the page separated by hairlines — no cards around lists. `highlighted` is the picker only.
