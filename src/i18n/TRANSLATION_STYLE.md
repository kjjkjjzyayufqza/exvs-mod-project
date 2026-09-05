# Translation style

## Scope

Translate user-facing application chrome, controls, help text, validation,
loading, empty, warning, success, and error messages. Preserve user/game data,
paths, hashes, extensions, code, command names, schema keys, and format names.

Supported locales for new work are `en-US` and `zh-CN` only. Japanese (`ja-JP`)
is deferred: do not add it to the language picker, and do not write Japanese
strings for new keys. Existing `ja-JP` files may stay unused.

## Research vocabulary boundary

Do not translate Rust-derived or research-stage domain vocabulary. Keep raw
field names, semantic labels, category names, enum names, DualValueProperty
labels that map to Rust structs, inspector dumps, and other parsed payloads in
English in every locale, including zh-CN. This is so frontend debug and testing
can match the parser and schema.

Covered systems include Param, CharacterParam, Character List, Command List,
jnttbl, nuhlpb, shl, numatb material parameters, numdlb mappings, vernier,
effect-project entry fields, FHM2D structure node properties, and any other
Rust-parsed record shown in the UI.

Generic frontend actions around those views, such as Open, Save, Search, Apply,
and Cancel, may be translated.

Wrap untranslated parser dumps with `data-i18n-ignore` so coverage does not
require keys for them.

Never modify Rust source or Rust-generated schemas/errors for localization.

## Key conventions

- Namespace by feature or bounded component group.
- Use nested semantic keys: `toolbar.openFile`, `errors.loadFailed`.
- Never use source text, line numbers, or generated ordinals as keys.
- Use i18next interpolation for dynamic values: `{{count}}`, `{{name}}`.
- Use i18next plural forms when grammar depends on count.

## Terminology

| English | Simplified Chinese | Japanese |
|---|---|---|
| Open | 打开 | 開く |
| Close | 关闭 | 閉じる |
| Save | 保存 | 保存 |
| Apply | 应用 | 適用 |
| Cancel | 取消 | キャンセル |
| Delete | 删除 | 削除 |
| Add | 添加 | 追加 |
| Remove | 移除 | 削除 |
| Import | 导入 | インポート |
| Export | 导出 | エクスポート |
| Load | 加载 | 読み込む |
| Reload | 重新加载 | 再読み込み |
| Search | 搜索 | 検索 |
| Filter | 筛选 | フィルター |
| Settings | 设置 | 設定 |
| Preview | 预览 | プレビュー |
| Enabled | 已启用 | 有効 |
| Disabled | 已禁用 | 無効 |
| Failed to ... | 无法…… | …できませんでした |

## Tone

- English: sentence case; concise desktop-tool wording.
- Simplified Chinese: concise Mainland Chinese UI; use full-width punctuation
  for sentences; avoid literal English word order.
- Japanese: deferred; do not add new Japanese strings.
- Keep EXVS2, FHM2D, SSBH, MSC, NUANMB, NUTEXB, NUMATB, FBX, JSON, ID, Hash,
  LE, BE, and canonical asset names unchanged.
