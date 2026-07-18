"""Order & menu intent handlers."""
from typing import Any


def format_menu(products: list[dict]) -> str:
    """Format product list as readable menu text."""
    if not products:
        return "⚠️ ขณะนี้ไม่มีสินค้าในหมวดนี้ กรุณาลองใหม่อีกครั้ง"

    lines = ["━━━ 🍔 เมนูทั้งหมด ━━━"]
    i = 1
    for p in products:
        name = p.get("name", "Unnamed")
        price = p.get("price") or p.get("unitPrice", 0)
        price_str = f"{float(price):,.0f}฿" if price else "—"
        cat = p.get("category") or p.get("category_name", "")
        lines.append(f"\n{i}. {name}")
        lines.append(f"   💰 {price_str}")
        if cat:
            lines.append(f"   📂 {cat}")
        i += 1
    lines.append(f"\n━━━ รวม {len(products)} รายการ ━━━")
    lines.append("\n💬 พิมพ์ชื่อเมนูเพื่อสั่ง เช่น 'ข้าวผัดกระเพรา'")
    lines.append("🔍 พิมพ์ #ชื่อหมวด เพื่อค้นหา เช่น '#อาหารตามสั่ง'")
    return "\n".join(lines)


def format_cart(cart: list[dict]) -> str:
    """Format current cart as readable text."""
    if not cart:
        return "🛒 ตะกร้าว่างเปล่า"

    lines = ["━━━ 🛒 รายการในตะกร้า ━━━"]
    total = 0.0
    for i, item in enumerate(cart, 1):
        name = item.get("name", "Unnamed")
        qty = item.get("quantity", 1)
        price = float(item.get("price", 0))
        subtotal = price * qty
        total += subtotal
        lines.append(f"{i}. {name} × {qty} = {subtotal:,.0f}฿")
    lines.append(f"\n💰 รวมทั้งหมด: {total:,.0f}฿")
    lines.append("\nพิมพ์ 'ยืนยัน' เพื่อสั่ง หรือ 'ยกเลิก' เพื่อยกเลิก")
    return "\n".join(lines)


async def handle_order_intent(text: str, session: dict, erp: Any) -> dict:
    """Process ordering-related messages."""
    text_lower = text.strip().lower()
    intent = session.get("intent", "")
    cart = session.get("cart", [])
    result = {"messages": [], "new_intent": None, "cart": cart}

    # ── Browse menu ──
    if text_lower in ("เมนู", "menu", "ดูเมนู", "กินอะไรดี", "1"):
        products = await erp.list_products()
        result["messages"].append(format_menu(products))
        result["new_intent"] = "browsing"

    # ── Menu by category ──
    elif text_lower.startswith("#") or text_lower.startswith("/"):
        keyword = text_lower.lstrip("#/").strip()
        products = await erp.list_products()
        filtered = [p for p in products if keyword in (p.get("category") or p.get("category_name", "")).lower()]
        if filtered:
            result["messages"].append(format_menu(filtered))
        else:
            result["messages"].append(f"😅 ไม่พบหมวด '{keyword}' ลอง: อาหารตามสั่ง, ทอด, ต้ม, เครื่องดื่ม")
        result["new_intent"] = "browsing"

    # ── View cart ──
    elif text_lower in ("ตะกร้า", "cart", "ดูตะกร้า", "2"):
        result["messages"].append(format_cart(cart))

    # ── Confirm order ──
    elif text_lower in ("ยืนยัน", "confirm", "yes", "ใช่", "ok"):
        if not cart:
            result["messages"].append("🛒 ตะกร้าว่างเปล่า — พิมพ์ชื่อเมนูเพื่อเพิ่มสินค้า")
        else:
            try:
                items = []
                for item in cart:
                    items.append({
                        "productId": item.get("product_id") or item.get("id", ""),
                        "productName": item.get("name", ""),
                        "quantity": item.get("quantity", 1),
                        "unitPrice": item.get("price", 0),
                    })
                order = await erp.create_order(items)
                order_id = order.get("id") or order.get("orderId", "")
                result["messages"].append(f"✅ สั่งเรียบร้อย!\n📍 Order #{order_id}")
                result["new_intent"] = None
                result["cart"] = []
            except Exception as e:
                result["messages"].append(f"❌ สั่งไม่สำเร็จ: {e}")

    # ── Cancel ──
    elif text_lower in ("ยกเลิก", "cancel", "ไม่", "no"):
        result["messages"].append("ยกเลิกการสั่งแล้ว ✅")
        result["new_intent"] = None
        result["cart"] = []

    # ── Track order ──
    elif text_lower in ("สถานะ", "เช็คออเดอร์", "order status", "3"):
        try:
            orders = await erp.list_orders()
            if not orders:
                result["messages"].append("📭 ไม่มีออเดอร์ที่กำลังดำเนินการ")
            else:
                lines = ["━━━ 📋 ออเดอร์ล่าสุด ━━━"]
                for o in orders[:5]:
                    oid = o.get("id") or o.get("orderId", "")
                    status = o.get("status", "unknown").upper()
                    total = float(o.get("totalAmount", 0))
                    lines.append(f"\n#{oid} | [{status}] — {total:,.0f}฿")
                lines.append("")
                result["messages"].append("\n".join(lines))
        except Exception as e:
            result["messages"].append(f"❌ ไม่สามารถดึงข้อมูล: {e}")

    # ── Search/add product ──
    else:
        # Try to find product by name
        try:
            products = await erp.list_products()
            matches = [p for p in products if text_lower in p.get("name", "").lower()]
            if not matches:
                result["messages"].append(
                    f"😅 ไม่พบ '{text}'\n"
                    f"ลองพิมพ์:\n"
                    f"  • 'เมนู' — ดูเมนูทั้งหมด\n"
                    f"  • '#อาหารตามสั่ง' — ดูตามหมวด\n"
                    f"  • 'สถานะ' — เช็คออเดอร์"
                )
            elif len(matches) == 1:
                p = matches[0]
                name = p.get("name", "Unnamed")
                price = float(p.get("price", 0))
                item = {"id": p.get("id"), "name": name, "price": price, "quantity": 1}
                cart.append(item)
                result["cart"] = cart
                result["messages"].append(
                    f"✅ เพิ่ม {name} — {price:,.0f}฿ เข้าตะกร้าแล้ว!\n"
                    f"พิมพ์ชื่อเมนูเพิ่ม, 'ยืนยัน' เพื่อสั่ง, หรือ 'ยกเลิก'"
                )
                result["new_intent"] = "ordering"
            else:
                lines = [f"🔍 พบ {len(matches)} รายการ:"]
                for p in matches:
                    name = p.get("name", "")
                    price = float(p.get("price", 0))
                    lines.append(f"  • {name} — {price:,.0f}฿")
                result["messages"].append("\n".join(lines))
        except Exception as e:
            result["messages"].append(f"❌ เกิดข้อผิดพลาด: {e}")

    return result
