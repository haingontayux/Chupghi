import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Receipt, Coffee, Car, ShoppingBag, Zap, Film, Heart, Book, Home, HelpCircle, X, Loader2, Clock, ImageIcon, BarChart3, ArrowDownCircle, ArrowUpCircle, Wallet, Gift, Briefcase, Trash2, Edit2, Download, Share2, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import exifr from 'exifr';
import { cn, formatCurrency, fileToBase64, compressImage } from './lib/utils';
import { Transaction, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './types';

const CategoryIcons: Record<string, any> = {
  "Ăn uống": Coffee,
  "Di chuyển": Car,
  "Mua sắm": ShoppingBag,
  "Hóa đơn": Zap,
  "Giải trí": Film,
  "Sức khỏe": Heart,
  "Giáo dục": Book,
  "Nhà cửa": Home,
  "Lương": Briefcase,
  "Thưởng": Gift,
  "Được cho/tặng": Heart,
  "Bán hàng": ShoppingBag,
  "Khác": HelpCircle,
  "Không xác định": HelpCircle
};

type Tab = 'timeline' | 'gallery' | 'report';

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('snapspends_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [currentTab, setCurrentTab] = useState<Tab>('timeline');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [initialBalance, setInitialBalance] = useState<number>(() => {
    const saved = localStorage.getItem('snapspends_initial_balance');
    return saved ? parseFloat(saved) : 0;
  });
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState<string>('');
  
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [detectedCategory, setDetectedCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expression, setExpression] = useState<string>('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [description, setDescription] = useState<string>('');
  const [location, setLocation] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem('snapspends_initial_balance', initialBalance.toString());
  }, [initialBalance]);

  useEffect(() => {
    try {
      localStorage.setItem('snapspends_transactions', JSON.stringify(transactions));
    } catch (e) {
      console.error("Lỗi lưu trữ:", e);
      alert("Bộ nhớ tạm của trình duyệt đã đầy! Vui lòng xóa bớt các giao dịch cũ có ảnh để lưu thêm.");
    }
  }, [transactions]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCurrentImage(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setIsModalOpen(true);
    setExpression('');
    setShowKeypad(true);
    setDescription('');
    setLocation('');
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Try to extract GPS location
    try {
      let lat: number | null = null;
      let lon: number | null = null;

      const gps = await exifr.gps(file);
      if (gps && gps.latitude && gps.longitude) {
        lat = gps.latitude;
        lon = gps.longitude;
      } else {
        // Fallback to browser geolocation
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });
          lat = position.coords.latitude;
          lon = position.coords.longitude;
        } catch (geoError) {
          console.log("Browser geolocation failed or denied", geoError);
        }
      }

      if (lat && lon) {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`);
        const data = await res.json();
        if (data && data.address) {
          const loc = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || '';
          const road = data.address.road || data.address.amenity || '';
          const locationName = [road, loc].filter(Boolean).join(', ');
          if (locationName) {
            setLocation(locationName);
          }
        }
      }
    } catch (error) {
      console.error("Could not extract GPS data", error);
    }
  };

  const handleSave = async () => {
    const numericAmount = calculateAmount(expression);
    if (numericAmount <= 0 && !previewUrl && !currentImage) return;
    setIsSaving(true);

    try {
      let finalImageUrl = previewUrl || '';
      let finalOriginalUrl = undefined;
      
      // If there's a new image (currentImage is set), apply watermark
      if (currentImage && previewUrl) {
        const compressed = await compressImage(previewUrl);
        finalOriginalUrl = compressed;
        finalImageUrl = compressed;
      } else if (editingTxId) {
        // If editing but no new image, keep existing images
        const existingTx = transactions.find(t => t.id === editingTxId);
        if (existingTx && existingTx.imageUrl) {
          finalOriginalUrl = existingTx.originalImageUrl;
          finalImageUrl = existingTx.originalImageUrl || existingTx.imageUrl;
        }
      }

      if (editingTxId) {
        setTransactions(prev => prev.map(t => t.id === editingTxId ? {
          ...t,
          type: txType,
          category: detectedCategory,
          amount: numericAmount,
          description: description.trim(),
          location: location.trim() || undefined,
          imageUrl: finalImageUrl,
          originalImageUrl: finalOriginalUrl
        } : t));
      } else {
        const newTx: Transaction = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          type: txType,
          category: detectedCategory,
          amount: numericAmount,
          description: description.trim(),
          location: location.trim() || undefined,
          imageUrl: finalImageUrl,
          originalImageUrl: finalOriginalUrl
        };
        setTransactions(prev => [newTx, ...prev]);
      }
      
      closeModal();
    } catch (error) {
      console.error("Error saving transaction:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setCurrentImage(null);
      setPreviewUrl(null);
      setExpression('');
      setShowKeypad(false);
      setDescription('');
      setLocation('');
      setTxType('expense');
      setDetectedCategory(EXPENSE_CATEGORIES[0]);
      setEditingTxId(null);
    }, 300);
  };

  const handleEdit = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setTxType(tx.type);
    setDetectedCategory(tx.category);
    setExpression((tx.amount / 1000).toString());
    setShowKeypad(false);
    setDescription(tx.description || '');
    setLocation(tx.location || '');
    setPreviewUrl(tx.imageUrl || null);
    setIsModalOpen(true);
  };

  const calculateAmount = (expr: string) => {
    try {
      let sanitized = expr.replace(/[^-()\d/*+.]/g, '');
      sanitized = sanitized.replace(/[/*+-]+$/, '');
      if (!sanitized) return 0;
      const result = new Function('return ' + sanitized)();
      if (isFinite(result) && !isNaN(result)) {
        return result * 1000;
      }
    } catch (e) {
      return 0;
    }
    return 0;
  };

  const handleKeyClick = (key: string) => {
    if (key === 'C') {
      setExpression('');
    } else if (key === '⌫') {
      setExpression(prev => prev.slice(0, -1));
    } else {
      setExpression(prev => {
        const lastChar = prev.slice(-1);
        const isOperator = ['+', '-', '*', '/'].includes(key);
        const isLastOperator = ['+', '-', '*', '/'].includes(lastChar);
        
        if (isOperator && isLastOperator) {
          return prev.slice(0, -1) + key;
        }
        return prev + key;
      });
    }
  };

  // --- Views ---

  const imageTransactions = transactions.filter(t => t.imageUrl);
  const currentImageIndex = selectedImage ? imageTransactions.findIndex(t => t.imageUrl === selectedImage) : -1;

  const handlePrevImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (currentImageIndex > 0) {
      setSelectedImage(imageTransactions[currentImageIndex - 1].imageUrl!);
    }
  };

  const handleNextImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (currentImageIndex < imageTransactions.length - 1) {
      setSelectedImage(imageTransactions[currentImageIndex + 1].imageUrl!);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (diff > 50) {
      handleNextImage();
    } else if (diff < -50) {
      handlePrevImage();
    }

    touchStartX.current = null;
  };

  const renderTimeline = () => {
    const todayTxs = transactions.filter(e => {
      const today = new Date();
      const txDate = new Date(e.timestamp);
      return txDate.getDate() === today.getDate() &&
             txDate.getMonth() === today.getMonth() &&
             txDate.getFullYear() === today.getFullYear();
    });

    const totalIncome = todayTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = todayTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    
    const totalIncomeAll = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenseAll = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const totalBalance = initialBalance + totalIncomeAll - totalExpenseAll;

    const handleBalanceSave = () => {
      const isNegative = tempBalance.startsWith('-');
      const numericString = tempBalance.replace(/[^0-9]/g, "");
      const newBalance = numericString ? parseInt(numericString, 10) * (isNegative ? -1 : 1) : NaN;
      
      if (!isNaN(newBalance) && newBalance !== totalBalance) {
        const difference = newBalance - totalBalance;
        
        const newTx: Transaction = {
          id: Date.now().toString(),
          amount: Math.abs(difference),
          category: 'Không xác định',
          type: difference > 0 ? 'income' : 'expense',
          timestamp: Date.now(),
          description: 'Điều chỉnh số dư',
          imageUrl: ''
        };
        
        setTransactions(prev => [newTx, ...prev]);
      }
      setIsEditingBalance(false);
    };

    return (
      <>
        <header className="bg-white px-6 py-8 shadow-sm sticky top-0 z-10">
          <div className="flex justify-between items-start mb-1">
            <h1 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Số dư hiện tại
            </h1>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
              {format(new Date(), "EEEE, d 'tháng' M", { locale: vi })}
            </span>
          </div>
          
          {isEditingBalance ? (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                inputMode="numeric"
                value={tempBalance}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const isNegative = rawValue.startsWith('-');
                  const val = rawValue.replace(/[^0-9]/g, '');
                  if (val) {
                    const formatted = parseInt(val, 10).toLocaleString('vi-VN');
                    setTempBalance(isNegative ? '-' + formatted : formatted);
                  } else {
                    setTempBalance(isNegative ? '-' : '');
                  }
                }}
                className="text-4xl font-light tracking-tight border-b-2 border-gray-300 focus:border-gray-900 outline-none w-full bg-transparent py-1"
                placeholder="Nhập số dư hiện tại..."
                autoFocus
                onBlur={handleBalanceSave}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </div>
          ) : (
            <div 
              className="flex items-baseline gap-2 mb-4 cursor-pointer group"
              onClick={() => {
                setTempBalance(totalBalance.toLocaleString('vi-VN'));
                setIsEditingBalance(true);
              }}
            >
              <span className={cn("text-4xl font-light tracking-tight transition-colors", totalBalance >= 0 ? "text-gray-900 group-hover:text-gray-600" : "text-red-500 group-hover:text-red-400")}>
                {totalBalance > 0 ? '+' : ''}{formatCurrency(totalBalance).replace('₫', '').trim()}
              </span>
              <span className="text-xl font-medium text-gray-400">₫</span>
              <Edit2 className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
            </div>
          )}
          
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
              <ArrowDownCircle className="w-4 h-4" />
              <span className="font-medium">{formatCurrency(totalIncome)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
              <ArrowUpCircle className="w-4 h-4" />
              <span className="font-medium">{formatCurrency(totalExpense)}</span>
            </div>
          </div>
        </header>

        <main className="px-6 py-8 max-w-lg mx-auto">
          {todayTxs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Receipt className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Chưa có giao dịch nào hôm nay.</p>
              <p className="text-sm mt-1">Chạm vào nút Camera để bắt đầu.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-gray-100 ml-4 flex flex-col gap-8">
              <AnimatePresence initial={false}>
                {todayTxs.map((tx, index) => {
                  const Icon = CategoryIcons[tx.category] || HelpCircle;
                  const isIncome = tx.type === 'income';
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: -20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                      transition={{ 
                        opacity: { duration: 0.2 },
                        layout: { type: "spring", bounce: 0.4, duration: 0.6 }
                      }}
                      key={tx.id} 
                      className="relative pl-8"
                    >
                    <div className={cn(
                      "absolute -left-[17px] top-1 w-8 h-8 rounded-full border-2 border-white flex items-center justify-center shadow-sm",
                      isIncome ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium text-gray-900">{tx.category}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {format(tx.timestamp, 'HH:mm')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn("font-medium", isIncome ? "text-green-600" : "text-red-600")}>
                            {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                          </span>
                          <div className="flex items-center gap-1 -mr-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleEdit(tx); }}
                              className="text-gray-300 hover:text-blue-500 transition-colors p-1.5"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(tx.id); }}
                              className="text-gray-300 hover:text-red-500 transition-colors p-1.5"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {tx.description && (
                        <p className="text-sm text-gray-600 mb-2">{tx.description}</p>
                      )}
                      
                      {tx.location && (
                        <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {tx.location}
                        </p>
                      )}
                      
                      {tx.imageUrl && (
                        <div 
                          className="mt-3 rounded-xl overflow-hidden h-32 bg-gray-100 cursor-pointer active:scale-95 transition-transform"
                          onClick={() => setSelectedImage(tx.imageUrl)}
                        >
                          <img 
                            src={tx.imageUrl} 
                            alt="Receipt" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          )}
        </main>
      </>
    );
  };

  const renderGallery = () => {
    const withImages = transactions.filter(t => t.imageUrl);
    
    // Group transactions by date
    const groupedTransactions = withImages.reduce((acc, tx) => {
      const dateStr = format(new Date(tx.timestamp), 'dd/MM/yyyy');
      if (!acc[dateStr]) {
        acc[dateStr] = { income: [], expense: [] };
      }
      if (tx.type === 'income') {
        acc[dateStr].income.push(tx);
      } else {
        acc[dateStr].expense.push(tx);
      }
      return acc;
    }, {} as Record<string, { income: Transaction[], expense: Transaction[] }>);

    // Sort dates descending
    const sortedDates = Object.keys(groupedTransactions).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('/');
      const [dayB, monthB, yearB] = b.split('/');
      return new Date(Number(yearB), Number(monthB) - 1, Number(dayB)).getTime() - 
             new Date(Number(yearA), Number(monthA) - 1, Number(dayA)).getTime();
    });

    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-6 px-2">Thư viện ảnh</h2>
        {withImages.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Chưa có hình ảnh nào.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedDates.map(date => {
              const { income, expense } = groupedTransactions[date];
              return (
                <div key={date} className="space-y-4">
                  <div className="sticky top-0 bg-gray-50/95 backdrop-blur-sm py-2 z-10 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-800">{date}</h3>
                  </div>
                  
                  {/* Expense Section */}
                  {expense.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-red-600 uppercase tracking-wider mb-2 px-1">Khoản Chi</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {expense.map(tx => (
                          <div 
                            key={tx.id} 
                            className="aspect-square rounded-xl overflow-hidden relative bg-gray-100 shadow-sm cursor-pointer active:scale-95 transition-transform group"
                            onClick={() => setSelectedImage(tx.imageUrl)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setConfirmDeleteId(tx.id);
                            }}
                          >
                            <img src={tx.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                              <p className="text-[10px] text-white font-medium truncate">{formatCurrency(tx.amount)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Income Section */}
                  {income.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-green-600 uppercase tracking-wider mb-2 px-1 mt-4">Khoản Thu</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {income.map(tx => (
                          <div 
                            key={tx.id} 
                            className="aspect-square rounded-xl overflow-hidden relative bg-gray-100 shadow-sm cursor-pointer active:scale-95 transition-transform group"
                            onClick={() => setSelectedImage(tx.imageUrl)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setConfirmDeleteId(tx.id);
                            }}
                          >
                            <img src={tx.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                              <p className="text-[10px] text-white font-medium truncate">{formatCurrency(tx.amount)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderReport = () => {
    const expenseData = EXPENSE_CATEGORIES.map(cat => ({
      name: cat,
      value: transactions.filter(t => t.type === 'expense' && t.category === cat).reduce((sum, t) => sum + t.amount, 0)
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

    const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    return (
      <div className="px-6 py-8 max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-6">Báo cáo tổng quan</h2>
        
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
            <div className="text-green-600 mb-1"><ArrowDownCircle className="w-5 h-5" /></div>
            <p className="text-xs text-green-800 font-medium uppercase tracking-wider mb-1">Tổng thu</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalIncome)}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
            <div className="text-red-600 mb-1"><ArrowUpCircle className="w-5 h-5" /></div>
            <p className="text-xs text-red-800 font-medium uppercase tracking-wider mb-1">Tổng chi</p>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalExpense)}</p>
          </div>
        </div>

        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Cơ cấu chi tiêu</h3>
        {expenseData.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Chưa có dữ liệu chi tiêu.</p>
        ) : (
          <>
            <div className="h-64 mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                    {expenseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-3">
              {expenseData.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-sm text-gray-700">{item.name}</span>
                  </div>
                  <span className="text-sm font-medium">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24 font-sans">
      
      {currentTab === 'timeline' && renderTimeline()}
      {currentTab === 'gallery' && renderGallery()}
      {currentTab === 'report' && renderReport()}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-30">
        <div className="flex justify-between items-center h-16 px-2 max-w-lg mx-auto relative">
          <button onClick={() => setCurrentTab('timeline')} className={cn("flex flex-col items-center justify-center flex-1", currentTab === 'timeline' ? "text-gray-900" : "text-gray-400")}>
            <Clock className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Hôm nay</span>
          </button>
          
          <button onClick={() => setCurrentTab('gallery')} className={cn("flex flex-col items-center justify-center flex-1", currentTab === 'gallery' ? "text-gray-900" : "text-gray-400")}>
            <ImageIcon className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Thư viện</span>
          </button>
          
          {/* FAB Placeholder */}
          <div className="flex-1 flex justify-center relative">
            <div className="absolute -top-10">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-14 h-14 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-800 active:scale-95 transition-all border-4 border-white"
              >
                <Camera className="w-6 h-6" />
              </button>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </div>
          </div>

          <button onClick={() => setCurrentTab('report')} className={cn("flex flex-col items-center justify-center flex-1", currentTab === 'report' ? "text-gray-900" : "text-gray-400")}>
            <BarChart3 className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Báo cáo</span>
          </button>
        </div>
      </div>

      {/* Image Viewer Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="absolute top-6 right-6 flex gap-3 z-20">
              {currentImageIndex !== -1 && (
                <button 
                  className="p-2 text-white/70 hover:text-white bg-black/50 rounded-full transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(imageTransactions[currentImageIndex]);
                    setSelectedImage(null);
                  }}
                >
                  <Edit2 className="w-6 h-6" />
                </button>
              )}
              <button 
                className="p-2 text-white/70 hover:text-white bg-black/50 rounded-full transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImage(null);
                }}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Left Click Area */}
            {currentImageIndex > 0 && (
              <div 
                className="absolute left-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-start pl-4 cursor-pointer group"
                onClick={handlePrevImage}
              >
                <div className="p-3 text-white/50 group-hover:text-white bg-black/20 group-hover:bg-black/50 rounded-full transition-all">
                  <ChevronLeft className="w-8 h-8" />
                </div>
              </div>
            )}

            {/* Right Click Area */}
            {currentImageIndex < imageTransactions.length - 1 && (
              <div 
                className="absolute right-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-end pr-4 cursor-pointer group"
                onClick={handleNextImage}
              >
                <div className="p-3 text-white/50 group-hover:text-white bg-black/20 group-hover:bg-black/50 rounded-full transition-all">
                  <ChevronRight className="w-8 h-8" />
                </div>
              </div>
            )}

            <div className="relative inline-block max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
              <motion.img 
                key={selectedImage}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                src={selectedImage} 
                alt="Full size" 
                className="max-w-full max-h-full rounded-lg shadow-2xl block"
              />

              {/* Transaction Details Overlay */}
              {currentImageIndex !== -1 && (
                <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none flex flex-col justify-end z-10 rounded-b-lg overflow-hidden">
                  <div className="max-w-md mx-auto w-full text-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium opacity-80">
                        {format(new Date(imageTransactions[currentImageIndex].timestamp), 'dd/MM/yyyy HH:mm')}
                      </span>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border",
                        imageTransactions[currentImageIndex].type === 'income' 
                          ? "bg-green-500/20 text-green-300 border-green-500/30" 
                          : "bg-red-500/20 text-red-300 border-red-500/30"
                      )}>
                        {imageTransactions[currentImageIndex].type === 'income' ? 'Khoản Thu' : 'Khoản Chi'}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <h3 className="text-xl font-bold mb-1">{imageTransactions[currentImageIndex].category}</h3>
                        {imageTransactions[currentImageIndex].location && (
                          <div className="flex items-center text-sm opacity-80">
                            <MapPin className="w-3.5 h-3.5 mr-1" />
                            {imageTransactions[currentImageIndex].location}
                          </div>
                        )}
                      </div>
                      <div className="text-2xl font-black tracking-tight">
                        {imageTransactions[currentImageIndex].type === 'income' ? '+' : '-'}{formatCurrency(imageTransactions[currentImageIndex].amount)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
                <h2 className="text-lg font-medium">Giao dịch mới</h2>
                <button onClick={closeModal} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
                {/* Image Preview with Overlays */}
                <div className="relative rounded-2xl overflow-hidden h-64 bg-gray-900 shadow-inner shrink-0">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover opacity-80" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <ImageIcon className="w-12 h-12 opacity-20" />
                    </div>
                  )}
                  
                  {/* Top Overlay: Type Toggle & Amount Display */}
                  <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent flex flex-col gap-3">
                    {/* Type Toggle */}
                    <div className="flex p-1 bg-black/40 backdrop-blur-md rounded-xl">
                      <button
                        onClick={() => {
                          setTxType('expense');
                          setDetectedCategory(EXPENSE_CATEGORIES[0]);
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                          txType === 'expense' ? "bg-red-500 text-white shadow-sm" : "text-white/70 hover:text-white"
                        )}
                      >
                        Khoản Chi
                      </button>
                      <button
                        onClick={() => {
                          setTxType('income');
                          setDetectedCategory(INCOME_CATEGORIES[0]);
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                          txType === 'income' ? "bg-green-500 text-white shadow-sm" : "text-white/70 hover:text-white"
                        )}
                      >
                        Khoản Thu
                      </button>
                    </div>

                    {/* Amount Display */}
                    <div 
                      className="w-full cursor-pointer flex flex-col px-1"
                      onClick={() => setShowKeypad(true)}
                    >
                      <div className="flex justify-between items-end min-h-[40px]">
                        <span className="text-xl text-white/70 font-light tracking-wider overflow-x-auto whitespace-nowrap no-scrollbar">
                          {expression || "0"}
                        </span>
                        <span className={cn(
                          "text-4xl font-bold tracking-tight",
                          txType === 'income' ? "text-green-400" : "text-red-400"
                        )}>
                          {formatCurrency(calculateAmount(expression))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Change Image Button */}
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-black/70 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    Đổi ảnh
                  </button>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Danh mục</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => {
                      const Icon = CategoryIcons[cat] || HelpCircle;
                      const isSelected = detectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setDetectedCategory(cat)}
                          className={cn(
                            "flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all",
                            isSelected 
                              ? (txType === 'income' ? "bg-green-600 border-green-600 text-white" : "bg-red-600 border-red-600 text-white")
                              : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                          )}
                        >
                          <Icon className={cn("w-5 h-5 mb-1", isSelected ? "text-white" : "text-gray-400")} />
                          <span className="text-[10px] font-medium text-center">{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description Input */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Ghi chú (Tùy chọn)</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onFocus={() => setShowKeypad(false)}
                    placeholder="VD: Cà phê sáng..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                  />
                </div>

                {/* Location Input */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Địa điểm (Tùy chọn)</label>
                  <input 
                    type="text" 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onFocus={() => setShowKeypad(false)}
                    placeholder="VD: Quán cafe, siêu thị..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                  />
                </div>
              </div>

              {/* Custom Keypad */}
              <AnimatePresence>
                {showKeypad && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.15 }}
                    className="bg-white border-t border-gray-100 px-6 pb-6 shrink-0"
                  >
                    <div className="grid grid-cols-4 gap-2 pt-4">
                      {['7','8','9','/'].map(k => (
                        <button key={k} onClick={() => handleKeyClick(k)} className="h-12 bg-gray-50 rounded-xl text-xl font-medium text-gray-700 active:bg-gray-200 transition-colors">{k}</button>
                      ))}
                      {['4','5','6','*'].map(k => (
                        <button key={k} onClick={() => handleKeyClick(k)} className="h-12 bg-gray-50 rounded-xl text-xl font-medium text-gray-700 active:bg-gray-200 transition-colors">{k}</button>
                      ))}
                      {['1','2','3','-'].map(k => (
                        <button key={k} onClick={() => handleKeyClick(k)} className="h-12 bg-gray-50 rounded-xl text-xl font-medium text-gray-700 active:bg-gray-200 transition-colors">{k}</button>
                      ))}
                      {['C','0','⌫','+'].map(k => (
                        <button key={k} onClick={() => handleKeyClick(k)} className={cn(
                          "h-12 rounded-xl text-xl font-medium active:bg-gray-200 transition-colors",
                          k === 'C' ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-700"
                        )}>{k}</button>
                      ))}
                      <button key="." onClick={() => handleKeyClick('.')} className="h-12 bg-gray-50 rounded-xl text-xl font-medium text-gray-700 active:bg-gray-200 transition-colors">.</button>
                      <button 
                        onClick={() => setShowKeypad(false)} 
                        className="col-span-3 h-12 bg-gray-900 text-white rounded-xl text-lg font-medium active:bg-gray-800 transition-colors"
                      >
                        Xong
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer Actions */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                <button 
                  onClick={handleSave}
                  disabled={(calculateAmount(expression) <= 0 && !previewUrl && !currentImage) || isSaving}
                  className={cn(
                    "w-full text-white rounded-xl py-4 font-medium disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center",
                    txType === 'income' ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                  )}
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Lưu giao dịch"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Xóa giao dịch?</h3>
              <p className="text-gray-500 mb-6">Bạn có chắc chắn muốn xóa giao dịch này không? Hành động này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    const txToDelete = transactions.find(t => t.id === confirmDeleteId);
                    if (txToDelete && txToDelete.category === 'Không xác định' && txToDelete.description === 'Điều chỉnh số dư') {
                      const offset = txToDelete.type === 'income' ? txToDelete.amount : -txToDelete.amount;
                      setInitialBalance(prev => {
                        const newInitial = prev + offset;
                        localStorage.setItem('snapspends_initial_balance', newInitial.toString());
                        return newInitial;
                      });
                    }
                    setTransactions(prev => prev.filter(t => t.id !== confirmDeleteId));
                    setConfirmDeleteId(null);
                    if (selectedImage && txToDelete?.imageUrl === selectedImage) {
                      setSelectedImage(null);
                    }
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600"
                >
                  Xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
