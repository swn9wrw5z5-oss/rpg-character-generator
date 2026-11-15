# RPG 角色生成器 V5 核心

第三階段交付：沿用第二階段 Excel → JSON 與生成核心的手機直式網頁，包含 Seed、種族選擇、實際背包格子及玩家／開發者模式。尚未加入批次統計或部署。

先讀 [第三階段啟動、手機預覽與驗收](第三階段_手機網頁操作說明.md)。[第二階段核心說明](第二階段_核心操作說明.md)、[第一階段稽核](第一階段_V5資料稽核.md) 與 `evidence/` 保持原樣。

## 快速執行

需要 Node.js 22 以上；Windows PowerShell 供 Excel 轉檔使用。網頁與伺服器無第三方執行依賴；DOM測試使用鎖定版本的 jsdom。已加入 PATH 的 Node／npm 可執行：

```powershell
npm ci --ignore-scripts
npm test
npm start
```

本機 Node 未加入 PATH 時，可使用已驗證的執行檔：

```powershell
$node = 'C:\Users\johnn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tools/export-v5.mjs
& $node --test
& $node tools/serve.mjs --qa
```

啟動後開啟 http://127.0.0.1:4173/ 。`--qa` 另提供 http://127.0.0.1:4173/__qa/preview.html 的390×844可操作預覽，Ctrl+C停止。純啟動不需npm；此工作區已安裝測試依賴。其他機器要跑全部測試需先npm ci。

命令列核心仍可使用 `node tools/generate.mjs --seed v5-demo --species S003 --output outputs/demo.json`。不指定種族就按Excel權重抽取；`outputs/`與`dist/`不納入Git。

暫定抽樣政策集中在 `config/test-parameters.json`，只補充 V5 缺少的生成規則；數值、成本、上下限、ID 關聯、稀有度區間皆取自 Excel 匯出的 `data/v5.json`。不要手改此產生檔。
