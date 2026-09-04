# Hybrid internationalization design

## Decision

Adopt a hybrid internationalization layer for the React/Tauri application:

1. Use `i18next` and `react-i18next` as the long-term, key-based API.
2. Add a bounded DOM compatibility bridge for existing hard-coded English UI.
3. Require new or materially edited UI to use translation keys directly.
4. Migrate old pages incrementally instead of rewriting every component now.

Initial locales are `en-US`, `zh-CN`, and `ja-JP`. English is the fallback.
Adding another language must require only locale resources plus the language
metadata entry, unless that language needs special layout or plural handling.

## Goals

- Add language selection without editing every existing page.
- Support lazy components, Radix portals, and the portaled top navigation.
- Persist the chosen locale through the existing Tauri settings store.
- Avoid translating file names, resource names, hashes, paths, editor content,
  or other user/game data.
- Provide a clean migration path from legacy English literals to stable keys.

## Non-goals

- Machine translation or network translation services.
- Translation of game assets, extracted content, logs, or CLI output.
- Right-to-left layout in the first implementation.
- Immediate complete translation of every legacy business page.

## Architecture

### Locale resources

Store messages by stable semantic key:

```text
src/i18n/
  index.ts
  locale.ts
  legacyText.ts
  DomTranslationBridge.tsx
  resources/
    en-US.json
    zh-CN.json
    ja-JP.json
```

All locale files share the same keys. Example:

```json
{
  "common.options": "Options",
  "common.settings": "Settings",
  "settings.language": "Language"
}
```

`en-US.json` is both the fallback resource and the source for the legacy exact-
text index. Duplicate English phrases that need different translations are not
handled by the bridge; those call sites are migrated to explicit keys.

### Root integration

`src/main.tsx` mounts an `AppI18nProvider` outside `App`, beside the existing
theme and FHM2D metadata providers. The provider:

- initializes one i18next instance;
- synchronizes i18next with the persisted locale;
- updates `document.documentElement.lang`;
- renders the compatibility bridge once.

The compatibility bridge observes `document.body`, not only `#root`, so it also
covers `createPortal` and Radix portal content. It reacts to lazy-mounted nodes
and selected text-bearing attributes: `title`, `placeholder`, and `aria-label`.

### Compatibility boundary

The bridge translates exact known English UI phrases only. It never translates
arbitrary text. It skips these boundaries:

- `[data-i18n-ignore]` and its descendants;
- `input`, `textarea`, `pre`, `code`, and editable content;
- elements marked as paths, hashes, resource names, logs, or data viewers by
  shared components.

Original text and attributes are tracked with weak references, allowing locale
switches to restore English without retaining removed DOM nodes. Observer writes
must be idempotent to avoid mutation loops.

Common data-rendering components receive `data-i18n-ignore` centrally. A page
needs an explicit marker only when it renders data outside those shared
components and that data can equal a registered UI phrase.

### Explicit translation API

New UI uses `useTranslation`:

```tsx
const { t } = useTranslation();

return <Button>{t("common.settings")}</Button>;
```

Interpolation, plurals, rich markup, dynamic validation errors, and contextual
phrases always use explicit keys. The bridge is limited to legacy static text.

## Locale persistence

Extend `ConfigState` and `useConfigStore` with:

- `locale: AppLocale`;
- `setLocale(locale): Promise<void>`;
- normalization that accepts only supported locale identifiers.

The authoritative value lives in Tauri `settings.json`, consistent with current
configuration storage. A localStorage mirror supplies the synchronous first-
paint value while `initStore` loads. Invalid or unsupported stored values fall
back to `en-US`.

Language changes update Zustand immediately, then save to the Tauri store. A
save failure keeps the current session language and reports a non-blocking UI
error; it does not leave i18next in a different locale from Zustand.

## Settings UI

Add a language selector to `SettingsDialog`. Options come from locale metadata,
not hard-coded conditional JSX. Each option uses its native display name. The
selector changes the active locale immediately; restarting the app preserves it.

The setting itself uses explicit translation keys, ensuring users can always
understand the control after switching languages.

## Migration policy

1. Seed the legacy index with application chrome, navigation, settings, common
   dialogs, buttons, and shared status messages.
2. Do not bulk-rewrite every page.
3. When a component gains new UI or its wording changes, move its affected
   literals to explicit translation keys.
4. Remove a legacy phrase only after no bridge-dependent call site remains.
5. Keep locale resource key parity checked by tests.

This makes the bridge shrink over time while the stable API grows.

## Verification

Targeted Vitest coverage will prove:

- locale normalization and English fallback;
- Chinese and Japanese key lookup;
- missing-key fallback;
- legacy text and supported attribute translation;
- restoration when switching back to English;
- mutation handling for lazy and portal content;
- ignore-boundary protection for paths, hashes, editor text, and form values;
- equal key sets across locale resources.

The implementation completion gate is the dedicated i18n test module, not the
full application test suite.

## Acceptance criteria

- Settings can switch among English, Simplified Chinese, and Japanese without a
  restart.
- The chosen locale survives an application restart.
- Existing common chrome translates without per-page edits.
- New key-based translations support interpolation and plural rules.
- File names, paths, hashes, resource identifiers, logs, and editable values are
  unchanged in every locale.
- Missing translations display fallback English and do not crash rendering.
- Lazy and portaled UI appears in the active locale.
