#!/usr/bin/env python3
"""
Shopee Scraper — ใช้ curl_cffi impersonate browser
"""
import json, sys, os, time, argparse, urllib.parse

# ลอง import curl_cffi ก่อน
try:
    from curl_cffi import requests as curl_req
    HAS_CURL = True
except ImportError:
    HAS_CURL = False
    import requests


def fetch(url, headers):
    if HAS_CURL:
        resp = curl_req.get(url, headers=headers, impersonate="chrome131", timeout=20)
    else:
        resp = requests.get(url, headers=headers, timeout=20)
    return resp


def search_via_api(keyword, limit=30):
    """
    เรียก Shopee API โดยตรง (ใช้ curl_cffi impersonate browser)
    """
    api_url = "https://shopee.co.th/api/v4/search/search_items"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Referer": "https://shopee.co.th/",
        "x-requested-with": "XMLHttpRequest",
        "accept": "application/json, text/plain, */*",
    }

    items = []
    offset = 0

    while len(items) < limit:
        params = {
            "by": "relevancy",
            "keyword": keyword,
            "limit": min(60, limit - len(items)),
            "newest": offset,
            "order": "desc",
            "page_type": "search",
            "version": 2,
        }

        print(f"  ▶ หน้า {offset // 60 + 1}...", end=" ")
        try:
            resp = fetch(f"{api_url}?{urllib.parse.urlencode(params)}", headers)
            if resp.status_code != 200:
                print(f"❌ HTTP {resp.status_code}")
                break

            data = resp.json()
            if data.get("error"):
                print(f"❌ error: {data.get('error_msg', '')}")
                break

            raw = data.get("data", {}).get("items", [])
            if not raw:
                print("✅ หมด")
                break

            for entry in raw:
                item = entry.get("item_basic", {})
                shop = entry.get("shop_basic_info", {})
                if item:
                    items.append(item)
                    # ใส่ shop name ให้
                    items[-1]["_shop_name"] = shop.get("shop_name", "")

            print(f"✅ {len(items)}/{limit}")
            offset += len(raw)
            time.sleep(2.5)

        except Exception as e:
            print(f"❌ {e}")
            break

    return items[:limit]


def format_items(raw_items):
    """แปลง raw item เป็น dict เรียบร้อย"""
    results = []
    for item in raw_items:
        rating = item.get("item_rating", {}) or {}
        rating_count = 0
        if isinstance(rating.get("rating_count"), list) and len(rating["rating_count"]) > 0:
            rating_count = rating["rating_count"][0]

        results.append({
            "id": item.get("itemid"),
            "name": item.get("name", ""),
            "price": (item.get("price", 0) or 0) / 100_000,
            "price_min": (item.get("price_min", 0) or 0) / 100_000,
            "price_max": (item.get("price_max", 0) or 0) / 100_000,
            "stock": item.get("stock", 0),
            "sold": item.get("sold", 0),
            "rating_star": rating.get("rating_star", 0),
            "rating_count": rating_count,
            "shop_name": item.get("_shop_name", ""),
            "shop_location": item.get("shop_location", ""),
            "image": f"https://cf.shopee.co.th/file/{item.get('image', '')}" if item.get("image") else "",
            "url": f"https://shopee.co.th/product/i.{item.get('shopid')}.{item.get('itemid')}",
        })
    return results


def print_results(results):
    if not results:
        print("\n❌ ไม่พบสินค้า\n")
        return

    print(f"\n{'='*80}")
    print(f"พบ {len(results)} รายการ")
    print(f"{'='*80}\n")

    for i, r in enumerate(results, 1):
        print(f"{i:>3}. {r['name'][:65]}")
        stars = "⭐" * int(round(r['rating_star']))
        print(f"     💰 ฿{r['price']:,.2f}  {stars} {r['rating_star']:.1f} ({r['rating_count']:,})")
        print(f"     📦 ขายแล้ว {r['sold']:,}  |  🏪 {r['shop_name']}  |  📍 {r['shop_location']}")
        print()


def save_json(results, keyword):
    name = keyword.replace(" ", "_")
    path = f"shopee_{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"💾 JSON → {path} ({len(results)} items)")


def save_excel(results, keyword):
    try:
        import pandas as pd
        name = keyword.replace(" ", "_")
        path = f"shopee_{name}.xlsx"
        pd.DataFrame(results).to_excel(path, index=False)
        print(f"💾 Excel → {path}")
    except ImportError:
        print("⚠️ ไม่มี pandas, ข้าม Excel")


def save_csv(results, keyword):
    try:
        import pandas as pd
        name = keyword.replace(" ", "_")
        path = f"shopee_{name}.csv"
        pd.DataFrame(results).to_csv(path, index=False, encoding="utf-8-sig")
        print(f"💾 CSV → {path}")
    except ImportError:
        pass


def main():
    parser = argparse.ArgumentParser(description="Shopee Scraper (curl_cffi)")
    parser.add_argument("keyword", nargs="?", default="รองเท้า", help="คำค้นหา")
    parser.add_argument("--limit", type=int, default=30, help="จำนวน (default: 30)")
    parser.add_argument("--save", action="store_true", help="บันทึกไฟล์")
    parser.add_argument("--excel", action="store_true", help="บันทึก Excel")
    parser.add_argument("--csv", action="store_true", help="บันทึก CSV")
    args = parser.parse_args()

    if not HAS_CURL:
        print("⚠️ แนะนำ: pip install curl-cffi เพื่อ bypass rate limit ได้ดีขึ้น\n")

    print(f"\n🔍 Shopee — \"{args.keyword}\" ({args.limit} items)\n")

    raw = search_via_api(args.keyword, args.limit)
    results = format_items(raw)

    print_results(results)

    if args.save or args.excel or args.csv:
        save_json(results, args.keyword)
        if args.save or args.excel:
            save_excel(results, args.keyword)
        if args.save or args.csv:
            save_csv(results, args.keyword)

    print(f"\n✅ เสร็จ! ได้ {len(results)} รายการ")


if __name__ == "__main__":
    main()
