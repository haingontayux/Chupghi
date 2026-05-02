export interface Transaction {
  id: string;
  timestamp: number;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  imageUrl: string;
  originalImageUrl?: string;
  location?: string;
  telegramSent?: boolean;
}

export const EXPENSE_CATEGORIES = [
  "Ăn uống",
  "Di chuyển",
  "Mua sắm",
  "Hóa đơn",
  "Giải trí",
  "Sức khỏe",
  "Giáo dục",
  "Nhà cửa",
  "Không xác định",
  "Khác"
];

export const INCOME_CATEGORIES = [
  "Lương",
  "Thưởng",
  "Được cho/tặng",
  "Bán hàng",
  "Không xác định",
  "Khác"
];
