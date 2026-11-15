# V5 獨立整合紀錄

日期：2026-11-15。此 checkout 以遠端 main 的 `1fa1240b57abcb80ea639bf35ca9bb43fb7486fc` 為基礎，分支為 `integration/v5-mobile`。本機備份分支 `backup/pre-v5-2026-11-15` 指向相同舊版提交。

## 整合結果

- 根目錄 `index.html` 與 `README.md` 保持舊版 v0.2，不改生成邏輯。
- `v5/` 完整保留本機 V5 提交 `94cea441fc93e7466a49e1bb8c364ca909450318` 的35個追蹤檔案，包含手機網頁、設定JSON、生成核心、Excel轉檔工具與原測試。原V5工作目錄及其分支不動。
- `integration/v5-snapshot.json` 記錄來源提交與每個檔案的Git blob；自動測試核對所有原始內容。`.gitattributes` 關閉V5快照的換行轉換，以免Windows checkout改變固定版本內容。
- V5使用自己的 `v5/data/v5.json`、`v5/config/test-parameters.json` 與 `v5/src/core.mjs`。沒有引用舊首頁的raceData、rpgRanges、ATK/DEF、先抽分級或操作區公式。
- 網頁公開使用的CSS、JS、SVG、JSON路徑皆相對於V5頁面／模組解析；GitHub Pages實際專案網址將對應 `/rpg-character-generator/v5/`。
- 本次沒有新增生成公式或改動V5的已知資料警告；也沒有修改原始Excel、Godot或既有V5來源。

## 本機啟動與建置

先在此獨立checkout根目錄執行；Node需22以上。

```powershell
# 新電腦安裝V5測試依賴。此工作區已依lockfile完成安裝。
npm --prefix v5 ci --ignore-scripts

# 執行V5原測試與新增整合測試
node --test

# 模擬GitHub Pages專案子路徑
node tools/serve-integration.mjs --prefix /rpg-character-generator/
```

本機網址：

- 舊版：http://127.0.0.1:4175/rpg-character-generator/
- V5：http://127.0.0.1:4175/rpg-character-generator/v5/

若不指定prefix，網址則為根目錄 `/` 與 `/v5/`。Ctrl+C停止。此服務預設只監聽127.0.0.1，不修改防火牆、不變更GitHub。

本機Node未在PATH時：

```powershell
$node = 'C:\Users\johnn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node --test
& $node tools/serve-integration.mjs --prefix /rpg-character-generator/
```

執行 `node tools/build-integration.mjs` 或 `npm run build` 產生合併發布目錄：

```text
dist/
  .nojekyll
  index.html          ← 舊版首頁，逐位元組複製
  v5/
    .nojekyll
    index.html
    web/
    src/
    data/
    config/
```

這個artifact同時包含舊首頁與V5，不以V5首頁覆蓋舊版。原始Excel、稽核證據、測試、QA端點、node_modules、Git metadata與本機認證檢查資料均不在標準artifact中。來源儲存庫保留完整V5測試／證據以便維護；未來發布應使用建置artifact，而非直接公開整個來源樹。

## 本次驗證

Windows、Node.js v24.22.1：**131項通過、0失敗、0略過**。

- 原有V5 121項：全部執行並通過，包括真實Excel轉檔與來源未變更檢查。
- 新增整合10項：舊index／README與main blob一致、35個V5快照檔案一致、兩種prefix的HTML／CSS／ES modules／JSON載入、尾斜線轉址保留Seed、兩種prefix下的啟動結果逐項等於既有核心、合併artifact內容與排除項、公開執行資源的相對引用。
- 新測試以真實本機HTTP與jsdom驗證模組資源及頁面互動，不是Safari排版／觸控實機驗證。先前尚未完成的iPhone實機驗證仍然保留待辦，不宣稱本次已完成。
- 詳細執行日誌保留於已忽略的 `.local/integration-tests.txt`，不推送。

## GitHub認證與Pages來源檢查

- 公開Repository讀取與clone成功，HTTP200；本機origin為 `https://github.com/swn9wrw5z5-oss/rpg-character-generator.git`。
- 此程序未取得可用GH_TOKEN／GITHUB_TOKEN或Git Credential Manager HTTPS憑證，目前也沒有可用GitHub連接工具。沒有發起新登入或讀取VS Code／瀏覽器內部Token。
- 唯讀查詢 `/repos/swn9wrw5z5-oss/rpg-character-generator/pages` 回傳 **404 Not Found**。先前Repository metadata的has_pages=true僅代表啟用標記，不足以確認實際發布來源。因此**目前發布分支／資料夾或Actions來源仍未確認**；不把404解讀為Pages未啟用，也不猜測main/root。
- 公開讀取成功不代表已驗證帳號／推送權限。後續需一個可供Git使用的認證管道（例如Git Credential Manager或已登入的gh），以及可讀Pages metadata的GitHub授權；同一個權限足夠的管道可以同時滿足兩者。不要將Token貼入對話。
- 若不方便提供Pages讀取授權，可由使用者提供Settings → Pages顯示的Source、Branch／Folder或Actions流程名稱，先做發布方案確認。

## 預計推送與部署前確認

預計只推送 `integration/v5-mobile`，包含：

- `v5/` 的固定版本快照35檔；
- 根目錄 `.gitignore`、`.gitattributes`、`package.json`；
- `tools/build-integration.mjs`、`tools/serve-integration.mjs`；
- `test/subpath.test.mjs`、`integration/v5-snapshot.json`、本文件。

不會推送 `.local/`、node_modules或dist；根目錄index／README沒有差異。備份分支目前也只在本機，是否另推備份可由使用者決定。

本次僅建立本機整合提交，**沒有push、PR、合併或Pages設定修改**。後續需確認：

1. 目前GitHub帳號與Repository寫入權限，以及是否允許推送上述integration分支；不推main。
2. Pages目前實際Source及部署時機。僅推integration分支不保證會發布 `/v5/`，也不可假設一定不會觸發既有流程；推送前先取得來源設定。
3. 是否採用本次合併artifact部署，保留舊首頁 `/`、增加V5 `/v5/`。若目前從main根目錄發布，直接合併完整來源樹會公開測試／證據，建議另確認發布artifact或專用發布分支方案。
4. 是否先建立PR審查，以及何時允許合併與發布。修改Pages來源、加入自動部署流程或合併都需另外確認。
5. 補做iPhone直式實機／Safari視覺驗證後再正式發布。
