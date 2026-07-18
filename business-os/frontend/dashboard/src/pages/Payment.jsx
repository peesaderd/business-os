import React from 'react';
import { CreditCard } from 'lucide-react';

export default function Payment() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <CreditCard size={32} className="text-primary" />
      </div>
      <h2 className="text-lg font-semibold">การเงิน</h2>
      <p className="text-muted-foreground text-sm mt-2 max-w-md">
        กำลังพัฒนา... ติดต่อทีมงานเพื่อขอใช้งาน
      </p>
    </div>
  );
}
