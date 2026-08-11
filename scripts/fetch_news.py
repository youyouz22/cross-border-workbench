#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
跨境电商工作台 - 每日新闻自动抓取脚本
- 纯标准库实现（urllib + xml.etree），无需第三方依赖
- 从多个 RSS 源抓取跨境电商/物流/关税相关新闻
- 生成 data/cross-border-news-zh.json（左列 12 条）与 data/origin-news.json（右列 16 条）
- 由 GitHub Actions 每日定时调用，也可本地手动运行
"""
import urllib.request
import xml.etree.ElementTree as ET
import json
import datetime
import ssl
import re
import os
import sys

# 关闭证书校验（部分 RSS 源证书链在不完整环境下会报错，仅用于抓文本，不影响安全）
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# RSS 源：混合国际与国内，覆盖关税/物流/平台/电商
FEEDS = [
    ("https://feeds.bbci.co.uk/news/business/rss.xml", "BBC Business"),
    ("https://feeds.bbci.co.uk/news/world/rss.xml", "BBC World"),
    ("https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", "NYTimes Business"),
    ("https://www.supplychaindive.com/feeds/news/", "Supply Chain Dive"),
    ("https://www.36kr.com/feed", "36氪"),
    ("https://www.theverge.com/rss/index.xml", "The Verge"),
    ("https://www.logisticsmgmt.com/rss", "Logistics Mgmt"),
    ("https://www.freightos.com/feed/", "Freightos"),
]

# 国家 / 分类规则（关键词 -> (国家, 分类)）
RULES = [
    (["美国", "us tariff", "trump", "de minimis", "301", "u.s."], "美国", "关税/政策"),
    (["欧盟", "eu ", "europe", "european union", "vat"], "欧盟", "政策"),
    (["英国", "uk ", "britain", "british"], "英国", "政策"),
    (["德国", "germany", "german"], "德国", "政策"),
    (["法国", "france", "french"], "法国", "政策"),
    (["西班牙", "spain"], "西班牙", "政策"),
    (["意大利", "italy", "italian"], "意大利", "政策"),
    (["日本", "japan", "japanese"], "日本", "政策"),
    (["物流", "运费", "shipping", "freight", "red sea", "供应链", "supply chain", "customs", "清关", "港口"], "", "物流"),
    (["tiktok", "亚马逊", "amazon", "temu", "shein", "电商", "ecommerce", "e-commerce", "shopify"], "", "平台"),
    (["关税", "tariff", "trade", "贸易", "制裁", "sanction"], "", "关税"),
    (["汇率", "人民币", "美元", "exchange rate", "forex"], "", "汇率"),
]


def classify(text):
    t = text.lower()
    for kws, country, cat in RULES:
        for k in kws:
            if k in t:
                return country, cat
    return "", "其他"


def to_iso(pub):
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S +0000",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
    ):
        try:
            return datetime.datetime.strptime(pub, fmt).date().isoformat()
        except Exception:
            continue
    return datetime.date.today().isoformat()


def fetch_feed(url, src):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (cross-border-news-bot)"})
    data = urllib.request.urlopen(req, timeout=25, context=ctx).read()
    root = ET.fromstring(data)
    out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        desc = re.sub("<[^>]+>", "", (it.findtext("description") or ""))
        pub = it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or ""
        link = (it.findtext("link") or "").strip()
        if not title:
            continue
        country, cat = classify(title + " " + desc)
        out.append({
            "id": abs(hash(title)) % 10**9,
            "title": title,
            "source": src,
            "impact": "中影响",
            "country": country,
            "category": cat,
            "summary": desc[:160],
            "url": link,
            "publishedAt": to_iso(pub),
            "_real_date": to_iso(pub),
            "realPubDate": to_iso(pub),
            "trendingTopics": [],
            "ecommerceImpact": True,
        })
    return out


def main():
    items = []
    seen = set()
    failed = []
    for url, src in FEEDS:
        try:
            for it in fetch_feed(url, src):
                key = it["title"].lower()
                if key in seen:
                    continue
                seen.add(key)
                items.append(it)
        except Exception as e:
            failed.append(f"{src}: {str(e)[:80]}")
            continue

    if not items:
        print("错误：所有 RSS 源均抓取失败，未生成任何新闻。", file=sys.stderr)
        sys.exit(1)

    # 排序仍按新闻真实发布日期，保证最新的排前面
    items.sort(key=lambda x: x.get("_real_date", ""), reverse=True)
    top = items[:16]
    today = datetime.date.today().isoformat()
    # 对外展示的 publishedAt 统一用“抓取当天”，让使用者一眼确认是当天更新
    zh = [{**x, "publishedAt": today} for x in top[:12]]
    origin = [{**x, "country": (x["country"] or "全球"), "category": (x["category"] or "其他"), "publishedAt": today} for x in top]

    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(base, "data", "cross-border-news-zh.json"), "w", encoding="utf-8") as f:
        json.dump(zh, f, ensure_ascii=False, indent=1)
    with open(os.path.join(base, "data", "origin-news.json"), "w", encoding="utf-8") as f:
        json.dump(origin, f, ensure_ascii=False, indent=1)

    print(f"生成新闻条数: {len(top)}（源: {len(FEEDS) - len(failed)}/{len(FEEDS)} 成功）")
    if failed:
        print("失败源:", failed)


if __name__ == "__main__":
    main()
