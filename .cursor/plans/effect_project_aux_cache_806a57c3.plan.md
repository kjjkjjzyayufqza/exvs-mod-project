---
name: Effect Project Aux Cache
overview: 在 Effect Project 檔案成功載入後，以非阻塞方式非同步掃描「該檔所在目錄」底下所有子目錄，收集並快取所有符合條件的 jnttbl 與 .nusktb；以 mtime 做失效判斷。於記憶體中維護可查詢的聚合結構（多檔、多模型骨頭），供後續 bone index / hash / model 對應 UI 使用。
todos:
  - id: spec-matchers
    content: 定義 jnttbl / .nusktb 檔名匹配規則與 path normalization（與現有開檔流程一致）
    status: pending
  - id: fs-walk
    content: 實作 async 遞迴 readDir + 檔案清單收集（含並發上限與 cancel token）
    status: pending
  - id: cache-layer
    content: 實作 mtime 版 CachedFile Map + getOrLoad 讀取 jnttblReadFile / ssbhReadNusktbBoneNames
    status: pending
  - id: aggregate-index
    content: 依「多檔、多模型」建立可查詢的聚合結構（至少 path-keyed；可選 hash/join 索引）
    status: pending
  - id: wire-open-session
    content: 在 effect project 成功載入後非阻塞觸發掃描；session 關閉時取消
    status: pending
  - id: fs-capabilities
    content: 檢查並更新 Tauri fs scope 以允許目錄樹讀取
    status: pending
  - id: ui-minimal
    content: （可選）掃描狀態/計數顯示；後續再接 bone_index 與 model 的對應顯示
    status: pending
isProject: false
---

# Effect Project 載入後 jnttbl / nusktb 全量掃描與快取

## 背景與目標

- **觸發時機**：僅在 [`effectProjectReadFile`](e:\TAURI_PROJECT\src\page\TestEditor\components\ssbh-model-preview\effectProjectIoService.ts) 成功、`openEffectProjectSession` 將 session 設為 `loading: false` 且寫入 `draftData` **之後**，再啟動背景工作（不阻塞 UI、不延後「可編輯」狀態）。
- **掃描根目錄**：`dirname(effectProjectFilePath)`，**遞迴**所有子資料夾。
- **jnttbl**：符合「檔名為 jnttbl」的規則（建議實作為可維護的 matcher：例如 `name === "jnttbl"`、`basename(noExt)==="jnttbl"`、`*.jnttbl` 等；實作時以專案既有副檔名慣例對齊）。
- **nusktb**：掃描所有 `.nusktb`（或專案既有慣例），**每一個檔都載入骨頭名稱陣列**（沿用 [`ssbhReadNusktbBoneNames`](e:\TAURI_PROJECT\src\page\TestEditor\components\ssbh-model-preview\jnttblIoService.ts)）。
- **快取失效**：對每個已掃描的檔案路徑記錄 `mtime`（[`stat`](e:\TAURI_PROJECT\node_modules\@tauri-apps\plugin-fs\dist-js\index.d.ts) 的 `FileInfo.mtime`）；下次需要讀取該路徑資料時，若 `mtime` 變更或檔案不存在則重新 `jnttblReadFile` / `ssbhReadNusktbBoneNames`。
- **資料語意**（依你的說明）：多個 nusktb = 多個模型的骨架；多個 jnttbl = 多組 hash 與 bone 對應；整體是 **多對多**。快取層應保留「**依檔案路徑分區**」的完整資料，並可再建 **索引結構**（例如依 `hashId`、`boneIndex` 做查表），避免把不同模型的骨頭混在一起。

## 效能原則（必守）

- **非同步**：使用 `queueMicrotask` / `setTimeout(0)` / `requestIdleCallback`（若可用）在批次之間讓出主執行緒；掃描與讀檔皆 **非 await 在 React render 路徑**。
- **並發上限**：對 `jnttblReadFile` / `ssbhReadNusktbBoneNames` 使用小型 worker pool（例如同時最多 2～4 個），避免一次打爆 IPC。
- **增量**：掃描只產生「路徑清單」；載入二進位可分批 + 可取消（session 關閉時 abort token 取消後續工作）。
- **不重复解析**：記憶體結構以 `absolutePath -> { mtime, payload }` 為主；聚合索引只在 payload 更新時重建該檔相關部分。

## 主要模組設計

1. **路徑工具**  
   - 使用 `@tauri-apps/api/path` 的 `dirname` / `join` 組出絕對路徑（與現有 [`readFile`](e:\TAURI_PROJECT\src\page\TestEditor\components\ssbh-model-preview\effectProjectIoService.ts) 一致）。
2. **遞迴目錄列舉**  
   - 使用 `@tauri-apps/plugin-fs` 的 `readDir` + BFS/DFS 佇列；只處理 `isDirectory` 子目錄。
3. **檔案過濾**  
   - `isJnttblCandidate(name: string): boolean`  
   - `isNusktbCandidate(name: string): boolean`  
   - 與現有 Jnttbl / DAE 流程命名一致（若需與 `FileTreePane` 或 repack 規則對齊，可集中一處）。

4. **快取服務（建議獨立模組）**  
   新檔例如：[`src/page/TestEditor/components/ssbh-model-preview/effectProjectAuxiliaryCache.ts`](e:\TAURI_PROJECT\src\page\TestEditor\components\ssbh-model-preview\effectProjectAuxiliaryCache.ts)（名稱可再調整）

   建議型別（概念）：

   - `CachedFile<T> = { path: string; mtimeMs: number; data: T }`
   - `JnttblCache`：`Map<string, CachedFile<JnttblReadResult>>`（或只存 `JnttblEditorDocument` 需要的欄位）
   - `NusktbCache`：`Map<string, CachedFile<string[]>>`（bone names）
   - **聚合索引**（可第二階段）：  
     - `jnttblEntries`：每個 jnttbl 檔保留 `entries`（hashId, boneIndex）  
     - 可選：建立 `Map<hashId, Array<{ jnttblPath, boneIndex }>>` 等（視 UI 查詢需求）

5. **失效策略**

   - **讀取前**：`stat(path)` → 比對快取內 `mtimeMs`；相同則跳過重新讀檔。
   - **首次掃描後**：快取已帶 mtime；之後若 UI 需要「重新整理」，可手動呼叫 `refreshPath(path)` 或 `refreshAllUnderRoot(root)`。
   - （可選）對 `root` 註冊 `watch` debounced：目錄變動時只 **重新列舉** 或 **標記 dirty**，不強制全量重掃（避免效能雷）；此屬加分項，非第一版必須。

## 與 Effect Project UI 的整合點

- **入口**：[`openEffectProjectSession`](e:\TAURI_PROJECT\src\page\TestEditor\page.tsx) 內 `effectProjectReadFile` 的 `.then` 成功分支中，在 `setEffectProjectSessions` 更新完之後，呼叫 `void startAuxiliaryScanForEffectProject({ sessionId, filePath })`（不 await）。
- **狀態存放**（二選一，實作時擇一以維持清晰）：

  - **A. React state + ref**：在 `page.tsx` 或 `EffectProjectEditorModalHost` 上層增加 `auxiliaryScanBySessionId`（`idle | scanning | ready | error`）與快取 ref，透過 props 傳入 `EffectProjectEditorBody`。
  - **B. React Context**：`EffectProjectAuxiliaryProvider` 包住 modal 內容，子組件用 hook 讀取 bone/hash 對應與掃描狀態。

- **第一版 UI**：可先只顯示掃描進度（可選）與「已載入 n 個 jnttbl / m 個 nusktb」；**bone_index 旁顯示名稱**需先決定「哪一個 nusktb 對應 effect project 的哪一列 model_id」——若尚無可靠映射，可先只顯示「候選 bone 名」或僅暴露查表 API，避免錯誤假設。

## Tauri 權限

- 確認 [`tauri.conf` / capabilities](e:\TAURI_PROJECT\src-tauri) 中 `fs` scope 允許使用者選到的目錄樹下 **遞迴** `readDir` / `stat` / `readFile`（若目前僅允許單檔，需擴充為目錄前綴或使用者選擇的資料夾）。

## 驗證方式

- 大資料夾：掃描期間 UI 仍可操作；CPU 佔用不持續 100%。
- 修改某個 jnttbl 檔後：重新觸發讀取（或重新開啟 session）時，該檔快取更新。
- 關閉視窗：取消進行中的掃描，避免 memory leak。

## 與既有 Jnttbl 編輯器的關係

- [`jnttblReadFile`](e:\TAURI_PROJECT\src\page\TestEditor\components\ssbh-model-preview\jnttblIoService.ts) / [`ssbhReadNusktbBoneNames`](e:\TAURI_PROJECT\src\page\TestEditor\components\ssbh-model-preview\jnttblIoService.ts) 行為重用，避免重複實作二進位解析。
- 快取與 Jnttbl 獨立 modal 的 session 可共用同一個「快取服務」模組，避免重複讀檔（第二階段優化）。
