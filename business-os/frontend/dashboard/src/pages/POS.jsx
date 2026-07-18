import React from 'react';
import { ShoppingCart, Plus, Minus, Trash2, DollarSign } from 'lucide-react';

export default function POS() {
  const [cart, setCart] = React.useState([]);
  const [products] = React.useState([
    { id: 1, name: 'ข้าวผัดกุ้ง', price: 65 },
    { id: 2, name: 'ผัดไทย', price: 55 },
    { id: 3, name: 'ต้มยำกุ้ง', price: 120 },
    { id: 4, name: 'แกงเขียวหวาน', price: 80 },
    { id: 5, name: 'ส้มตำไทย', price: 45 },
    { id: 6, name: 'น้ำเปล่า', price: 15 },
  ]);

  const addToCart = (product) => {
    setCart((prev) => {
      const exist = prev.find((item) => item.id === product.id);
      if (exist) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Products */}
      <div className="lg:col-span-2">
        <h2 className="text-lg font-semibold mb-4">สินค้า</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="os-window p-4 text-left hover:shadow-md transition"
            >
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-primary font-semibold mt-1">฿{p.price}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div>
        <h2 className="text-lg font-semibold mb-4">ตะกร้า</h2>
        <div className="os-window p-4 flex flex-col h-[calc(100vh-12rem)]">
          <div className="flex-1 overflow-y-auto space-y-2">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
                ตะกร้าว่าง
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">฿{item.price}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, -1)} className="p-1 rounded hover:bg-secondary">
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="p-1 rounded hover:bg-secondary">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border pt-3 mt-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">รวม</span>
              <span className="text-xl font-bold text-primary">฿{total}</span>
            </div>
            <button
              disabled={cart.length === 0}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <DollarSign size={18} />
              ชำระเงิน (฿{total})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
