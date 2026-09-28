# 台灣羽球選手情報站

`badminton.clutchgtime.com` — 追蹤台灣現役羽球選手的最新動態與報導。

## 為什麼架構跟棒球站不一樣

姊妹站「旅外球員情報站」(`players.clutchgtime.com`) 的核心是 MLB Stats API：
免費、完整、給到逐場，所以能做到每日 cron 自動抓、自己算、自己寫。

**羽球沒有對等的東西**（實測）：

| 來源 | 結果 |
| --- | --- |
| `bwfbadminton.com`（官網／排名／賽果） | 403，掛 bot 防護 |
| `bwf.tournamentsoftware.com`（賽事系統） | 需登入 |
| Bing News RSS | 可用 |
| Wikidata API | 可用 |

本機都被擋了，GitHub Actions 的機房 IP 只會更慘（棒球站的 KBO 就踩過這個坑，
爬蟲在 CI 上 100% 403，資料悄悄凍結兩週）。所以這裡的分工是：

- **人工維護**：選手名單、項目、搭檔、世界排名（`scripts/roster.json`）
- **自動抓取**：新聞與報導（`scripts/fetch_news.py`，每日 cron）

羽球的資料量級遠小於棒球（約 12 位選手、一週一站賽事，對比棒球 39 人、一天十幾場），
所以人工維護是可行的，不是退而求其次。

## 目錄

```
scripts/roster.json     人工維護的選手名單（唯一事實來源）
scripts/fetch_news.py   Bing News RSS，規則沿用棒球站踩過坑的版本
scripts/build.mjs       靜態站產生器（不用 React/Vite，見檔頭註解）
public/                 靜態資源，build 時整個複製進 dist/
```

## 指令

```bash
python3 scripts/fetch_news.py   # 抓新聞 → public/data/news.json
npm run build                   # 產生 dist/
npm run preview                 # 建置後起本機伺服器（4180）
```

## 維護

- **新增選手**：在 `roster.json` 加一筆，`slug` 決定網址，上線後不要再改（改了舊連結會 404）
- **移除選手**：把 `active` 設為 `false`，不要直接刪（保留資料以便日後做歷代選手頁）
- **世界排名**：`rank` 與 `rank_updated` 一起更新。**沒有 `rank_updated` 就不會顯示** ——
  過期的排名比沒有排名更糟

## 待辦

- 世界排名的維護方式（目前欄位留著但沒有資料）
- 對戰紀錄 H2H：羽球迷最在意、中文網路幾乎沒人整理，但需要賽果資料
- 大賽戰績與生涯冠軍列表
- 戴資穎的現役狀態待查證；李洋已退役，之後做歷代選手頁時收錄
