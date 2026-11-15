# RPG角色生成模擬器

版本：`27-skills-five-levels-v3-20261116`。正式生成器位於 `/v5/`，使用已驗證的27技能五級設定；出生技能容量決定稀有度，先保留後續一級成本，再逐級降低付不起的等級。技能效果僅示意，尚未實作戰鬥效果。

原v0.2首頁 `index.html`保持位元組一致；原線上V5保留於 `/v5-legacy/`，並以發布前備份分支保存。新版程式使用獨立版本路徑，避免快取混用新舊模組。

GitHub Pages使用手動GitHub Actions，僅發布白名單44個檔案的`dist/`，不發布Excel、測試、內部文件或匯入工具。線上使用靜態JSON與瀏覽器生成核心，不需要本機檔案、Node伺服器或Excel匯入API。Excel維護及完整開發測試留在獨立開發專案。

## 驗證與發布

需要Node.js 24，無需安裝套件：

```sh
npm test
npm run build
npm run verify:release
```

手動執行工作流程「Verify and optionally publish Pages」：先選發布分支，`publish=false`驗證；驗證通過並更新main後，選main與`publish=true`才會部署。推送或合併本身不會自動發布。

發布檢查包括原首頁／舊版備份雜湊、全部公開檔案與相對路徑、原始儲存格與敏感資訊排除、五級設定驗證，以及1,000組結果與開發版完全一致（只排除圖示展示欄位）。另於發布前以獨立Chrome測試390×844、360×780及桌面操作。

## 回復

發布前的main為`d208ba4eff6e8dae6b36046ac8f0cfb3f0ee814b`，備份分支為`backup/pages-before-fivelevels-20261116`。可先使用 `/v5-legacy/`；若要整站回復，對main執行此次發布提交的`git revert`、推送後，再手動執行main的Pages工作流程且設`publish=true`。不需要刪除分支或改寫Git歷史。
