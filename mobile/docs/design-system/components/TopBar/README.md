App chrome. Mirrors the app's `TopBar` (`back.onPress` → `back.onClick` on web). The back link is now primary-text, not ember — ember is reserved for the picker and main action.

```jsx
<TopBar kind="home" group="Friday Film Club" right={<IconButton label="Settings" filled>…</IconButton>} />
<TopBar kind="tab" title="History" sub="Six films since May." />
<TopBar kind="title" title="New night" back={{label:"Cancel", onClick: close}} />
```
