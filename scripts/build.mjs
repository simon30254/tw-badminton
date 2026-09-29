/**
 * 靜態站產生器 → dist/
 * ====================
 * 刻意**不用 React/Vite**:棒球站的經驗是這類頁面掛載 React 之後內容沒有變多
 * (實測靜態 2094 字 > 掛載後 1830 字),卻要讓每個讀者多下載近 100KB,而且
 * 搜尋流量幾乎全部落在這種純內容頁。羽球站頁數更少、互動需求更低,直接產靜態 HTML。
 *
 * 資料來源:scripts/roster.json(人工維護)+ public/data/news.json(自動抓)。
 * 執行: npm run build
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const SITE = process.env.SITE_ORIGIN || "https://badminton.clutchgtime.com";
const BASE = process.env.BASE_PATH || "/";
const NAME = "台灣羽球選手情報站";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const read = (p, fb) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), "utf-8")); } catch { return fb; } };

const roster = read("scripts/roster.json", { players: [] });
const players = roster.players.filter((p) => p.active);
const news = read("public/data/news.json", { items: [] }).items || [];
const asiad = read("scripts/asiad.json", null);
const newsOf = (slug) => news.filter((n) => (n.players || []).includes(slug));
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const mdZh = (d) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;

function page({ title, desc, canonical, body, head = "" }) {
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" /><meta property="og:locale" content="zh_TW" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${canonical}" /><meta property="og:site_name" content="${NAME}" />
<link rel="stylesheet" href="${BASE}styles.css" />
${head}</head>
<body>
<header class="topbar"><div class="wrap">
  <a class="brand" href="${BASE}">${NAME}</a>
  <nav class="nav"><a href="${BASE}">選手</a>${asiad && asiad.active ? `<a href="${BASE}asiad/">亞運戰績</a>` : ""}<a href="${BASE}news/">最新消息</a></nav>
</div></header>
<main class="wrap page">${body}</main>
<footer class="foot"><div class="wrap">
  <p>資料說明:選手名單與世界排名為人工維護(羽球無公開賽果 API);新聞由公開來源每日彙整,
     標題與內容著作權屬原媒體所有。數據僅供參考,以 BWF 官方紀錄為準。</p>
  <p class="copy">© ${roster.season} ${NAME}</p>
</div></footer>
</body></html>`;
}

const write = (p, html) => {
  const dir = resolve(DIST, p);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "index.html"), html);
};

// ---- 選手頁 ----
const urls = [];
for (const p of players) {
  const items = newsOf(p.slug).slice(0, 12);
  const rank = p.rank && p.rank_updated
    ? `<p class="rank">世界排名 <b>${p.rank}</b><span class="asof">（${esc(p.rank_updated)} 更新）</span></p>`
    : "";              // 沒有 updated 就不顯示 —— 過期的排名比沒有排名更糟
  const partner = p.partner ? `<p class="meta">搭檔：${esc(p.partner)}</p>` : "";
  const li = items.map((n) =>
    `<li><span class="nw-d">${esc(mdZh(n.date))}</span>` +
    `<span class="nw-t">${esc(n.title)}</span>` +
    `<span class="nw-s">${esc(n.source || "")}</span></li>`).join("");
  const others = players.filter((x) => x.slug !== p.slug && x.event === p.event).slice(0, 4);
  const desc = `${p.name}（${p.name_en}）是台灣${p.event}羽球選手` +
    (p.partner ? `，搭檔${p.partner}` : "") + `。本頁彙整他的最新動態與相關報導。`;
  write(`player/${p.slug}`, page({
    title: `${p.name} ${p.name_en}｜台灣${p.event}羽球選手｜${NAME}`,
    desc, canonical: `${SITE}${BASE}player/${p.slug}/`,
    head: ld({ "@context": "https://schema.org", "@type": "Person", name: p.name,
               alternateName: p.name_en, nationality: "Taiwan",
               url: `${SITE}${BASE}player/${p.slug}/`,
               jobTitle: `羽球選手（${p.event}）` }),
    body:
      `<nav class="crumb"><a href="${BASE}">首頁</a> › <span>${esc(p.name)}</span></nav>` +
      `<h1>${esc(p.name)}</h1><p class="roman">${esc(p.name_en)}</p>` +
      `<p class="meta">${esc(p.event)}</p>${partner}${rank}` +
      (li ? `<h2>最新動態（${items.length} 則）</h2><ul class="nw">${li}</ul>`
          : `<p class="empty">目前沒有收錄到相關報導。</p>`) +
      (others.length
        ? `<h2>其他${esc(p.event)}選手</h2><nav class="morep">` +
          others.map((x) => `<a href="${BASE}player/${x.slug}/">${esc(x.name)}<span>${esc(x.name_en)}</span></a>`).join("") +
          `</nav>` : ""),
  }));
  urls.push(`${SITE}${BASE}player/${p.slug}/`);
}

// ---- 最新消息 ----
const byDate = new Map();
for (const n of news.slice(0, 120)) {
  if (!byDate.has(n.date)) byDate.set(n.date, []);
  byDate.get(n.date).push(n);
}
const nameOf = Object.fromEntries(players.map((p) => [p.slug, p.name]));
write("news", page({
  title: `台灣羽球最新消息｜${NAME}`,
  desc: `台灣羽球選手的最新報導彙整,涵蓋 ${players.length} 位現役選手,每日更新。`,
  canonical: `${SITE}${BASE}news/`,
  body: `<nav class="crumb"><a href="${BASE}">首頁</a> › <span>最新消息</span></nav>` +
    `<h1>最新消息</h1><p class="lead">${players.length} 位現役選手的報導彙整,每日更新。</p>` +
    [...byDate.entries()].map(([d, arr]) =>
      `<h2 class="nw-day">${esc(mdZh(d))}</h2><ul class="nw">` +
      arr.map((n) => `<li><span class="nw-t">${esc(n.title)}</span>` +
        `<span class="nw-s">${esc(n.source || "")}` +
        (n.players || []).map((s) => nameOf[s] ? ` · <a href="${BASE}player/${s}/">${esc(nameOf[s])}</a>` : "").join("") +
        `</span></li>`).join("") + `</ul>`).join(""),
}));
urls.push(`${SITE}${BASE}news/`);

// ---- 賽事頁 /asiad/ ----
// 跟姊妹站(棒球)同一個作法:媒體給的是賽果,這站給的是「名單裡每個人打到哪裡」,
// 而且把選手頁連起來。賽事結束把 active 設 false,頁面與所有連結一起消失。
if (asiad && asiad.active) {
  const bySlug = Object.fromEntries(players.map((p) => [p.slug, p]));
  const cards = (asiad.players || []).filter((x) => bySlug[x.slug]).map((x) => {
    const p = bySlug[x.slug];
    return `<a class="ev-p" href="${BASE}player/${p.slug}/">` +
      `<span class="ev-p-n">${esc(p.name)}<span class="ev-r">${esc(x.result)}</span></span>` +
      `<span class="ev-p-m">${esc(p.event)}${p.partner ? `・搭檔 ${esc(p.partner)}` : ""}</span>` +
      `<span class="ev-p-t">${esc(x.note)}</span></a>`;
  }).join("");
  write("asiad", page({
    title: `${asiad.name}羽球中華隊戰績｜${asiad.headline}｜${NAME}`,
    desc: asiad.lead.slice(0, 155),
    canonical: `${SITE}${BASE}asiad/`,
    head: ld({ "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: (asiad.faq || []).map((it) => ({ "@type": "Question", name: it.q,
        acceptedAnswer: { "@type": "Answer", text: it.a } })) }),
    body:
      `<nav class="crumb"><a href="${BASE}">首頁</a> › <span>${esc(asiad.name)}羽球</span></nav>` +
      `<h1>${esc(asiad.name)}羽球中華隊戰績</h1>` +
      `<p class="lead">${esc(asiad.lead)}</p>` +
      `<section class="box"><h2>賽事結果（${esc(mdZh(asiad.start))}–${esc(mdZh(asiad.end))}）</h2>` +
      `<ul class="rs">${(asiad.results || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>` +
      `<h2>選手成績（${(asiad.players || []).length} 位）</h2><div class="ev-ps">${cards}</div>` +
      `<section class="faq"><h2>常見問題</h2>` +
      (asiad.faq || []).map((it) => `<h3 class="q">${esc(it.q)}</h3><p class="a">${esc(it.a)}</p>`).join("") +
      `</section>`,
  }));
  urls.push(`${SITE}${BASE}asiad/`);
}

// ---- 首頁 ----
const byEvent = new Map();
for (const p of players) {
  const k = p.event.split("／")[0];
  if (!byEvent.has(k)) byEvent.set(k, []);
  byEvent.get(k).push(p);
}
write(".", page({
  title: `台灣羽球選手數據與最新動態｜${players.length} 位現役選手｜${NAME}`,
  desc: `追蹤 ${players.length} 位台灣現役羽球選手的最新動態與相關報導,依單打、雙打、混雙分類整理。`,
  canonical: `${SITE}${BASE}`,
  head: ld({ "@context": "https://schema.org", "@type": "ItemList", name: `台灣現役羽球選手`,
             numberOfItems: players.length,
             itemListElement: players.map((p, i) => ({ "@type": "ListItem", position: i + 1,
               name: p.name, url: `${SITE}${BASE}player/${p.slug}/` })) }),
  body: `<h1>台灣羽球選手數據與最新動態</h1>` +
    (asiad && asiad.active
      ? `<p class="cta"><a href="${BASE}asiad/">${esc(asiad.name)}羽球中華隊戰績：${esc(asiad.headline)} →</a></p>`
      : "") +
    `<p class="lead">追蹤 ${players.length} 位現役選手的最新動態與相關報導,依項目分類。` +
    `目前收錄 ${news.length} 則報導。</p>` +
    [...byEvent.entries()].map(([ev, arr]) =>
      `<h2>${esc(ev)}（${arr.length} 位）</h2><nav class="morep">` +
      arr.map((p) => `<a href="${BASE}player/${p.slug}/">${esc(p.name)}` +
        `<span>${esc(p.name_en)}${p.partner ? `・搭檔 ${esc(p.partner)}` : ""}</span></a>`).join("") +
      `</nav>`).join("") +
    `<p class="more"><a href="${BASE}news/">看全部最新消息 →</a></p>`,
}));
urls.unshift(`${SITE}${BASE}`);

// ---- 靜態資源 / sitemap / robots ----
if (existsSync(resolve(ROOT, "public"))) cpSync(resolve(ROOT, "public"), DIST, { recursive: true });
writeFileSync(resolve(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
writeFileSync(resolve(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}${BASE}sitemap.xml\n`);
console.log(`建置完成:${players.length} 個選手頁 + 首頁 + 最新消息,sitemap ${urls.length} 筆,新聞 ${news.length} 則`);
