Settings row. Mirrors the app's `SettingsRow`. Group rows in a `--surface-card` container with `--radius-lg`, `divider` on all but the last.

```jsx
<div style={{background:"var(--surface-card)",borderRadius:"var(--radius-lg)"}}>
  <SettingsRow label="Reminders" right={<Toggle value label="Reminders" />} divider />
  <SettingsRow label="Default start time" value="8:00 pm" right={<ChevronRight />} />
</div>
```
