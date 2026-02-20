---
name: Card Icon List
overview: 在 TestEditor 中新增一个更简化的「Card Icon List」页面：自动读取 `folderPath/0x49235031/` 里的 nutexb，并且**严格按** `folderPath/0x49235031_structure.json` 的顺序来展示列表；提供 Refresh Nutexb（nutexb→png）、Add、Remove，并在操作时直接写回原结构 JSON。
todos:
  - id: analyze-and-reuse
    content: Identify reusable UI patterns from `SeriesListView`/`SeriesCard` and the existing structure.json parsing helpers; define CardIcon list data model and preview path mapping (including sanitize).
    status: pending
  - id: card-icon-structure-utils
    content: Create generic structure.json helpers for (a) extracting first-folder ordered items with fileIndex, (b) append item, (c) remove item; keep index order strictly from `SubFileStructure`.
    status: pending
  - id: card-icon-list-view
    content: Implement `CardIconListView` to load `0x49235031_structure.json`, render virtualized card list, and wire up Refresh/Add/Remove with immediate JSON writes.
    status: pending
  - id: integrate-tab
    content: Add a new `Card Icon List` tab in `src/page/TestEditor/components/MainView.tsx` and ensure it only loads when active (same pattern as existing views).
    status: pending
isProject: false
---

## 现有 `SeriesList.tsx` 完整功能梳理

`SeriesList.tsx` 是一个纯 UI 的“列表渲染组件”，核心职责是：

- **搜索**：输入框 `searchTerm`，用 `useDeferredValue` 延迟过滤，避免输入卡顿。
- **排序**：下拉 `sortKey`（可选 index/SeriesId/iconFileIndex 等），用 `useTransition` 包裹 `setSortKey` 降低重渲染阻塞。
- **虚拟列表**：`@tanstack/react-virtual` 固定行高估算（96px）+ overscan=10，只渲染可视区域。
- **渲染行**：把过滤/排序后的 `{row, idx}` 映射到 `SeriesCard`，并把 `onSelect/onDelete/onCopy` 这些行为通过 props 透传出去。
- **空态**：无数据/无匹配时显示对应提示。

关键代码片段：

```35:221:e:\TAURI_PROJECT\src\page\TestEditor\components\series-list\SeriesList.tsx
export function SeriesList({
  seriesData,
  seriesImageConvertDirPath,
  seriesImageSeriesBaseNameOrder,
  selectedIndex,
  onSelect,
  onDelete,
  onCopy,
}: SeriesListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [, startTransition] = useTransition();

  const filteredRows = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    if (!term) return seriesData.map((row, idx) => ({ row, idx }));
    return seriesData
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        const name = row.unkStr1?.Utf8String || "";
        return name.toLowerCase().includes(term) || idx.toString().includes(term);
      });
  }, [seriesData, deferredSearchTerm]);

  const sortedRows = useMemo(() => {
    if (sortKey === "none") return filteredRows;
    // ... numeric + stable compare ...
    return [...filteredRows].sort(compare);
  }, [filteredRows, sortKey]);

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  return (
    // ... search + sort UI ...
    <div ref={listParentRef} className={cn("flex-1 min-h-0 overflow-auto", sortedRows.length === 0 && "border rounded-md")}>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = sortedRows[virtualItem.index];
          if (!item) return null;
          const { row, idx } = item;
          return (
            <div key={virtualItem.key} style={{ position: "absolute", transform: `translateY(${virtualItem.start}px)` }}>
              <SeriesCard
                series={row}
                index={idx}
                seriesImageConvertDirPath={seriesImageConvertDirPath}
                seriesImageSeriesBaseNameOrder={seriesImageSeriesBaseNameOrder}
                isSelected={idx === selectedIndex}
                onClick={() => onSelect(idx)}
                onDelete={() => onDelete(idx)}
                onCopy={() => onCopy(idx)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## Card Icon List 的实现思路（最小复杂度）

### 1) 数据来源与目录约定（已按你选择固定）

- **Nutexb 根目录**：`folderPath/0x49235031/`
- **结构 JSON**：`folderPath/0x49235031_structure.json`
- **预览 PNG 输出目录**：`folderPath/0x49235031/__convert/`

`Refresh Nutexb` 将复用现有 Tauri command：

```82:94:e:\TAURI_PROJECT\src-tauri\src\commands.rs
pub async fn nutexb_batch_export_png(
    root_dir: String,
    output_mode: String,
    overwrite: bool,
) -> Result<crate::nutexb_lib::BatchExportSummary, String> {
    let mode = crate::nutexb_lib::OutputMode::parse(output_mode.as_str())?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::batch_export_folder_to_png(root_dir.as_str(), mode, overwrite)
    })
    .await
    .map_err(|e| e.to_string())?
}
```

注意：Rust 端导出的 PNG 文件名来自 **nutexb 内部 texture name**（且会做非法字符替换），不是磁盘文件名：

```227:235:e:\TAURI_PROJECT\src-tauri\src\nutexb_lib.rs
fn make_root_convert_output_path(root: &Path, nutexb_path: &Path) -> Result<PathBuf, String> {
    let parent = nutexb_path.parent().ok_or_else(|| "Invalid nutexb path".to_string())?;
    let rel_dir = parent.strip_prefix(root).unwrap_or(parent);
    let convert_dir = root.join("__convert").join(rel_dir);

    let nutexb = NutexbFile::read_from_file(nutexb_path).map_err(|e| e.to_string())?;
    let name = sanitize_file_name(nutexb.footer.string.to_string().as_str());
    Ok(convert_dir.join(format!("{name}.png")))
}
```

因此 Card Icon List 的预览映射会按 `structure.json` 的 `Name` 来找 `__convert/<Name>.png`，并在前端使用同款 `sanitize_file_name` 逻辑生成实际 PNG 路径，避免“Name 含非法字符导致找不到 png”。

### 2) 解析 `*_structure.json` 并严格按其顺序渲染

复用 `Series Image` 的做法：遍历 `SubFileStructure` 的 **第一个 Folder 的直接子 Item**，并保持索引对齐（Name 为空则保留占位）。现有实现：

```1:47:e:\TAURI_PROJECT\src\page\TestEditor\components\series-list\seriesImage.ts
export function extractA0253FirstFolderSeriesBaseNameOrder(structureJson: unknown): Array<string | null> {
  const root = structureJson as any;
  const items: any[] | undefined = root?.SubFileStructure;
  if (!Array.isArray(items) || items.length === 0) return [];

  let depth = 0;
  let firstFolderDepth: number | null = null;
  let collecting = false;
  const baseNames: Array<string | null> = [];

  for (const it of items) {
    const type = String(it?.type ?? "");
    if (type === "Folder") {
      depth += 1;
      if (firstFolderDepth === null) {
        firstFolderDepth = depth;
        collecting = true;
      }
      continue;
    }

    if (type === "Item") {
      if (!collecting || firstFolderDepth === null) continue;
      if (depth !== firstFolderDepth) continue;
      const raw = typeof it?.Name === "string" ? it.Name.trim() : "";
      baseNames.push(raw ? raw : null);
      continue;
    }

    if (type === "EndMark") {
      const cRaw = Number(it?.endMarkCount);
      const c = Number.isFinite(cRaw) && cRaw > 0 ? Math.trunc(cRaw) : 1;
      depth = Math.max(0, depth - c);

      if (collecting && firstFolderDepth !== null && depth < firstFolderDepth) {
        collecting = false;
        break;
      }
    }
  }

  return baseNames;
}
```

Card Icon List 会实现一个更通用的解析函数（同目录新增 util），同时把每个 Item 的 `fileIndex` 一并取出，用于 Remove 时定位。

### 3) UI/交互（更简单、顺序不允许被排序打乱）

- 新增一个 Tab：`Card Icon List`（加到 `src/page/TestEditor/components/MainView.tsx`）。
- 新建 View：`src/page/TestEditor/components/CardIconListView.tsx`
  - 顶部按钮：`Refresh Nutexb`、`Add`、`Remove`
  - 主体列表：卡片式列表（复用 `@tanstack/react-virtual`），默认顺序=结构 JSON 顺序
  - 搜索可选：只做过滤，不改变相对顺序（不会提供排序下拉）

### 4) Refresh Nutexb（复用现有 Rust 功能）

- `invoke("nutexb_batch_export_png", { rootDir: join(folderPath, "0x49235031"), outputMode: "root_convert", overwrite: true })`
- 完成后重新读取 `0x49235031_structure.json`（用于更新计数/列表）

### 5) Add（只改 JSON，不做磁盘文件操作）

- 弹窗选择一个 `.nutexb` 文件（要求路径在 `folderPath/0x49235031/` 下）。
- 调用 `invoke("nutexb_read_info", { inputPath })` 读取内部 `name`。
- 约束（为避免 JSON 与磁盘不一致）：要求磁盘文件名等于 `${name}.nutexb`，否则提示用户先把文件名改成一致（因为你选择了 json-only，不进行复制/重命名）。
- 写回 `0x49235031_structure.json`：
  - `SubFileData` push 一个 `.nutexb` 条目（新 `fileIndex` = max+1）
  - `SubFileStructure` 在第一个 Folder 的 EndMark 前插入一个 Item（`Name=name`、`fileIndex=newFileIndex`），并递增 `folderCount`

### 6) Remove（只改 JSON，不删磁盘文件）

- 从列表中选中一项后点击 Remove：
  - 在 `SubFileStructure` 中删除对应的第 N 个直接子 Item
  - 同步更新 `folderCount`、以及可选的 `Fhm2dTotalCount`
  - 在 `SubFileData` 中删除对应 `fileIndex` 的条目（不做重排/不改其他 fileIndex）
- 写回 `0x49235031_structure.json`

### 7) 风险点（提前规避的隐藏问题）

- **PNG 命名来源**：批量导出 PNG 的文件名来自 nutexb 内部 name，而不是结构 JSON 的 `Name` 或磁盘文件名。计划里会在前端对 `Name` 做同款 sanitize，减少找不到预览的问题。
- **批量导出不递归子目录**：Rust 的 `collect_nutexb_files` 只处理根目录文件；如果未来 `0x49235031/` 出现子文件夹，需要再扩展递归逻辑。

## 预计改动文件

- 新增：`src/page/TestEditor/components/CardIconListView.tsx`
- 新增：`src/page/TestEditor/components/card-icon-list/`*（拆分子组件：Card、List、Dialog、结构 JSON util；保持项目风格）
- 修改：`src/page/TestEditor/components/MainView.tsx`（新增 Tab & unsaved 指示如需要）

## 验收标准

- 打开 TestEditor，选择根目录后进入 `Card Icon List` Tab
- 自动读取 `folderPath/0x49235031_structure.json`，列表顺序与 JSON 完全一致
- `Refresh Nutexb` 会在 `folderPath/0x49235031/__convert/` 生成/覆盖 PNG
- `Add` 选中一个 nutexb 后能追加到列表末尾并写回结构 JSON
- `Remove` 能删除选中项并写回结构 JSON
- 全程不依赖 Node 的 `fs/path`，不出现 `TODO/FIXME`，代码/注释均为英文

