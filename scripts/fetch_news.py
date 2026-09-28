"""
台灣羽球選手新聞(Bing News RSS)
================================
移植自棒球站 scripts/fetch_news.py,規則一併沿用 —— 那些規則是踩過坑換來的:

- **不用 Google News RSS**:覆蓋率好得多,但 <link> 是不透明 token,新版既不轉址
  也 base64 解不出原始網址,每則都只能連到 Google 中繼頁。Bing 的 apiclick.aspx
  帶 url= 參數可還原真實網址,另給 News:Source 媒體名與 description 摘要。
- **查詢不加引號**:Bing 的引號片語搜尋會回 0 筆(棒球站實測「"林昱珉"」0 則、
  「林昱珉」12 則)。靠選手全名精確比對擋掉形近的別人。
- **不加運動關鍵字白名單**:棒球站實測會誤殺「3A 炸裂本季第 9 轟」這種沒出現
  「棒球」二字的真新聞。羽球同理。
- 抓取失敗不覆寫既有 news.json —— 爬蟲靜默失敗把站洗空是最糟的結果。

輸出:public/data/news.json(保留 45 天)
執行: python3 scripts/fetch_news.py
"""

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "scripts" / "roster.json"
OUT = ROOT / "public" / "data" / "news.json"
KEEP_DAYS = 45
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TPE = timezone(timedelta(hours=8))


def rss(query):
    url = "https://www.bing.com/news/search?" + urllib.parse.urlencode(
        {"q": query, "format": "RSS", "setmkt": "zh-TW"})
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"  [warn] {query}:{str(e)[:70]}")
        return ""


def clean(s):
    return html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", s or "")).strip()


def real_url(link):
    """Bing 的 apiclick.aspx 帶 url= 參數,還原成原始網址。"""
    if "bing.com" in link and "url=" in link:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
        if q.get("url"):
            return q["url"][0]
    return link


def parse(xml):
    out = []
    for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
        def tag(t):
            m = re.search(rf"<{t}[^>]*>(.*?)</{t}>", it, re.S)
            return clean(m.group(1)) if m else ""
        title, link = tag("title"), tag("link")
        if not title or not link:
            continue
        pub = tag("pubDate")
        try:
            d = datetime.strptime(pub[:25].strip(), "%a, %d %b %Y %H:%M:%S").replace(tzinfo=timezone.utc)
            date = d.astimezone(TPE).strftime("%Y-%m-%d")
        except Exception:
            date = datetime.now(TPE).strftime("%Y-%m-%d")
        out.append({"title": title, "url": real_url(link), "date": date,
                    "source": tag("News:Source") or tag("source"), "summary": tag("description")})
    return out


def main():
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    players = [p for p in roster["players"] if p.get("active")]
    try:
        old = json.loads(OUT.read_text(encoding="utf-8")).get("items", [])
    except Exception:
        old = []

    fresh, ok = [], 0
    for p in players:
        items = parse(rss(p["name"]))
        if items:
            ok += 1
        # 標題或摘要含全名才留 —— Bing 的模糊比對會回不相干的人
        for n in items:
            if p["name"] in (n["title"] + n.get("summary", "")):
                n = dict(n)
                n["players"] = [p["slug"]]
                fresh.append(n)
        time.sleep(0.4)

    if not fresh:
        print("一則都沒抓到,保留既有 news.json 不覆寫")
        sys.exit(0)
    if ok < max(1, len(players) // 3):
        print(f"只有 {ok}/{len(players)} 位查得到,疑似被擋,不覆寫")
        sys.exit(0)

    merged = {}
    for n in old + fresh:                      # 同一網址合併,並集掛到的選手
        k = n["url"]
        if k in merged:
            merged[k]["players"] = sorted(set(merged[k].get("players", []) + n.get("players", [])))
        else:
            merged[k] = n
    cutoff = (datetime.now(TPE) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    items = sorted((n for n in merged.values() if n["date"] >= cutoff),
                   key=lambda n: n["date"], reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"updated_at": datetime.now(TPE).isoformat(timespec="seconds"),
                               "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    srcs = len({n.get("source") for n in items if n.get("source")})
    print(f"新聞:{len(items)} 則(本次新增 {len(items)-len(old)})、{srcs} 家媒體、{ok}/{len(players)} 位查得到")


if __name__ == "__main__":
    main()
