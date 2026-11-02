Month date picker. Mirrors the app's `Calendar` (which takes `nightDates` as a `Set`; here it's an array).

```jsx
<Calendar month={{year:2026,month:6}} today="2026-06-16" value="2026-06-19" nightDates={["2026-06-26"]} onPick={setDate} onMonth={step} />
```
