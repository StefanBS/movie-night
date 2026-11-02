Pill-shaped action button. Mirrors the app's `AppButton`.

```jsx
<Button onClick={start}>Start the night</Button>
<Button variant="secondary">Edit</Button>
<Button variant="ghost">Skip turn</Button>
<Button variant="danger">Cancel night</Button>
```

- `primary` — ember fill with ink label. One per screen, for the main action.
- `secondary` — hairline outline. `ghost` — text only, secondary colour. `danger` — red text.
- Sizes `sm` | `md` | `lg`. `fullWidth`, `disabled`. Press dips to `--pressed-opacity`.
