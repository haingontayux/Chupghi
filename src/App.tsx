import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, Plus, Receipt, Coffee, Car, ShoppingBag, Zap, Film, Heart, Book, Home, HelpCircle, X, Loader2, Clock, ImageIcon, BarChart3, ArrowDownCircle, ArrowUpCircle, Wallet, Gift, Briefcase, Trash2, Edit2, Download, Share2, MapPin, ChevronLeft, ChevronRight, Settings, Save, UploadCloud, Send } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import exifr from 'exifr';
import { cn, formatCurrency, fileToBase64, compressImage, addTimemarkOverlay, dataURItoBlob } from './lib/utils';
import { Transaction, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './types';
import { get, set } from 'idb-keyval';

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
type ReportPeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'all_time' | 'custom';

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [currentTab, setCurrentTab] = useState<Tab>('timeline');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('this_month');
  const [customDateRange, setCustomDateRange] = useState<{start: Date | null, end: Date | null}>({ start: null, end: null });
  const [reportType, setReportType] = useState<'expense' | 'income'>('expense');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showImageSourcePicker, setShowImageSourcePicker] = useState(false);
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
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const [telegramToken, setTelegramToken] = useState(() => localStorage.getItem('snapspends_tele_token') || '');
  const [telegramChatId, setTelegramChatId] = useState(() => localStorage.getItem('snapspends_tele_chat_id') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'info' | 'success' | 'error'} | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (type !== 'info') {
      toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('snapspends_tele_token', telegramToken);
  }, [telegramToken]);

  useEffect(() => {
    localStorage.setItem('snapspends_tele_chat_id', telegramChatId);
  }, [telegramChatId]);

  useEffect(() => {
    localStorage.setItem('snapspends_initial_balance', initialBalance.toString());
  }, [initialBalance]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const saved = await get('snapspends_transactions');
        if (saved) {
          setTransactions(saved);
        } else {
          const localSaved = localStorage.getItem('snapspends_transactions');
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            setTransactions(parsed);
            await set('snapspends_transactions', parsed);
          }
        }
      } catch (e) {
        console.error("Lỗi tải dữ liệu:", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const saveData = async () => {
      try {
        await set('snapspends_transactions', transactions);
      } catch (e) {
        console.error("Lỗi lưu trữ:", e);
        alert("Bộ nhớ của thiết bị đã đầy! Không thể lưu thêm giao dịch.");
      }
    };
    saveData();
  }, [transactions, isLoaded]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke previous blob URL to prevent memory leaks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setCurrentImage(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setIsModalOpen(true);
    setExpression('');
    setShowKeypad(true);
    setDescription('');
    setLocation('');
    
    // Đặt lại input ngay lập tức để có thể chọn lại cùng một file ảnh
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
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

  const sendToTelegram = async (tx: Transaction, token: string, chatId: string) => {
    if (!token || !chatId) return;

    showToast('Đang chạy gửi Telegram...', 'info');
    const typeStr = tx.type === 'expense' ? 'Chi' : 'Thu';
    const amountStr = formatCurrency(tx.amount);
    const descStr = tx.description ? ` (${tx.description})` : '';
    const locStr = tx.location ? ` tại ${tx.location}` : '';
    const textMsg = `💸 ${typeStr} ${tx.category}${descStr}${locStr} ${amountStr}`;

    try {
      const fetchPromise = tx.imageUrl && tx.imageUrl.startsWith('data:image') 
        ? (async () => {
            let blob;
            let isPhoto = true;
            try {
              blob = dataURItoBlob(tx.imageUrl);
            } catch (err) {
              isPhoto = false;
            }
            if (isPhoto && blob) {
              const formData = new FormData();
              formData.append('chat_id', chatId);
              formData.append('photo', blob, `receipt_${tx.id}.jpg`);
              formData.append('caption', textMsg);
              return fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
                method: 'POST',
                body: formData
              });
            } else {
              return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: textMsg })
              });
            }
          })()
        : fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: textMsg })
          });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), 15000);
      });

      const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         console.error("Telegram API Error:", errData);
         showToast(`Lỗi Telegram: ${errData.description || 'Không thể gửi'}`, 'error');
         return;
      }
      
      setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, telegramSent: true } : t));
      showToast('Đã gửi lên Telegram thành công!', 'success');
    } catch (e: any) {
      console.error("Lỗi gửi Telegram", e);
      if (e.message === 'TIMEOUT') {
        showToast('Kết nối yếu, gửi Telegram quá thời gian', 'error');
      } else {
        showToast(`Lỗi mạng Telegram: ${e?.message || 'Kiểm tra lại kết nối'}`, 'error');
      }
    }
  };

  const sendBackupToTelegram = async () => {
    if (!telegramToken || !telegramChatId) {
      alert("Vui lòng cấu hình Telegram (Token & Chat ID) trước!");
      return;
    }
    try {
      const dataStr = JSON.stringify(transactions);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const formData = new FormData();
      formData.append('chat_id', telegramChatId);
      formData.append('document', blob, `SnapSpends_Backup_${format(new Date(), 'yyyyMMdd_HHmm')}.json`);
      formData.append('caption', `📦 Mới Backup dữ liệu SnapSpends!\n- Số lượng: ${transactions.length} giao dịch\n- Số dư đầu kỳ: ${formatCurrency(initialBalance)}`);

      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendDocument`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) alert("Đã gửi file backup sang Telegram thành công!");
      else alert("Lỗi khi gửi backup. Lỗi từ máy chủ Telegram.");
    } catch (e) {
      console.error("Lỗi backup", e);
      alert("Đã xảy ra lỗi khi backup!");
    }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result as string;
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          setTransactions(parsed);
          alert("Đã khôi phục dữ liệu thành công!");
          setIsSettingsOpen(false);
          setCurrentTab('timeline');
        } else {
          alert("File không đúng định dạng backup (không phải là danh sách).");
        }
      } catch (err) {
        alert("Nội dung file backup không hợp lệ hoặc bị hỏng!");
      }
    };
    reader.readAsText(file);
    if (restoreFileRef.current) restoreFileRef.current.value = '';
  };

  const handleSave = async () => {
    const numericAmount = calculateAmount(expression);
    if (numericAmount <= 0) return;
    setIsSaving(true);

    try {
      let finalImageUrl = previewUrl || '';
      let finalOriginalUrl = undefined;
      
      if (!previewUrl && !currentImage) {
        // Generate placeholder image based on description or category
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 800;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const grad = ctx.createLinearGradient(0, 0, 800, 800);
          if (txType === 'income') {
             grad.addColorStop(0, '#10b981');
             grad.addColorStop(1, '#047857');
          } else {
             grad.addColorStop(0, '#f43f5e');
             grad.addColorStop(1, '#be123c');
          }
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 800, 800);
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 50px sans-serif';
          ctx.textAlign = 'center';
          
          const textToDraw = description.trim() || detectedCategory;
          const words = textToDraw.split(' ');
          let line = '';
          let y = 350;
          for(let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > 700 && i > 0) {
              ctx.fillText(line.trim(), 400, y);
              line = words[i] + ' ';
              y += 70;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line.trim(), 400, y);
          
          ctx.font = 'bold 70px sans-serif';
          ctx.fillText((txType === 'income' ? '+' : '-') + formatCurrency(numericAmount), 400, y + 100);

          finalImageUrl = canvas.toDataURL('image/jpeg', 0.8);
          finalOriginalUrl = finalImageUrl;
        }
      } else if (currentImage && previewUrl) {
        let compressed = await compressImage(previewUrl);
        // Fallback to plain base64 if compression fails/times out
        if (compressed.startsWith('blob:')) {
          compressed = await fileToBase64(currentImage);
        }
        finalOriginalUrl = compressed;
        
        // Add Timemark watermark
        try {
          finalImageUrl = await addTimemarkOverlay(compressed, location, Date.now(), numericAmount, txType, description);
        } catch (err) {
          console.error("Watermark error", err);
          finalImageUrl = compressed;
        }
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
        
        if (telegramToken && telegramChatId) {
          sendToTelegram(newTx, telegramToken, telegramChatId).catch(e => {
            console.error("Failed to send telegram in background", e);
          });
        }
      }
      
      closeModal();
    } catch (error: any) {
      console.error("Error saving transaction:", error);
      alert(`Lỗi khi lưu giao dịch: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setCurrentImage(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setExpression('');
      setShowKeypad(false);
      setDescription('');
      setLocation('');
      setTxType('expense');
      setDetectedCategory(EXPENSE_CATEGORIES[0]);
      setEditingTxId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  const suggestedDescriptions = useMemo(() => {
    const allDescs = transactions.map(t => t.description).filter(Boolean) as string[];
    const uniqueDescs = Array.from(new Set(allDescs));
    if (!description.trim()) return uniqueDescs.slice(0, 5);
    return uniqueDescs.filter(d => d.toLowerCase().includes(description.toLowerCase()) && d !== description).slice(0, 5);
  }, [transactions, description]);

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

  const handleShare = async (tx: Transaction, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const typeStr = tx.type === 'expense' ? 'Chi' : 'Thu';
      const descStr = tx.description ? ` (${tx.description})` : '';
      const locStr = tx.location ? ` tại ${tx.location}` : '';
      const amountStr = formatCurrency(tx.amount);
      
      const textLine = `${typeStr} ${tx.category}${descStr}${locStr} ${amountStr}`;

      const shareData: any = {
        title: 'Thông tin giao dịch',
        text: textLine,
      };

      if (tx.imageUrl && navigator.canShare) {
        try {
          const res = await fetch(tx.imageUrl);
          const blob = await res.blob();
          const file = new File([blob], `giao-dich-${tx.id}.jpg`, { type: blob.type || 'image/jpeg' });
          
          if (navigator.canShare({ files: [file] })) {
            shareData.files = [file];
          }
        } catch (fileErr) {
          console.error("Cannot prepare file for sharing", fileErr);
        }
      }

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(textLine);
        alert("Đã copy nội dung: " + textLine);
      }
    } catch (error) {
      console.error("Lỗi khi chia sẻ:", error);
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
            <div>
              <h1 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Số dư hiện tại
              </h1>
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md mt-1 inline-block">
                {format(new Date(), "EEEE, d 'tháng' M", { locale: vi })}
              </span>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
              title="Cài đặt"
            >
              <Settings className="w-5 h-5" />
            </button>
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
                    
                    <div 
                      className={cn(
                        "bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden relative",
                        tx.imageUrl ? "aspect-[4/3] cursor-pointer active:scale-[0.98] transition-transform" : "p-4"
                      )}
                      onClick={() => tx.imageUrl && setSelectedImage(tx.imageUrl)}
                    >
                      {tx.imageUrl && (
                        <>
                          <img 
                            src={tx.imageUrl} 
                            alt="Receipt" 
                            className="absolute inset-0 w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/60" />
                        </>
                      )}
                      
                      <div className={cn(
                        "relative h-full flex flex-col",
                        tx.imageUrl ? "p-4 text-white justify-between" : ""
                      )}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className={cn("font-medium", tx.imageUrl ? "text-white drop-shadow-md" : "text-gray-900")}>{tx.category}</h3>
                            <p className={cn("text-xs mt-0.5", tx.imageUrl ? "text-gray-300 drop-shadow-md" : "text-gray-400")}>
                              {format(tx.timestamp, 'HH:mm')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={cn("font-medium", 
                              isIncome ? (tx.imageUrl ? "text-green-400 drop-shadow-md" : "text-green-600") : (tx.imageUrl ? "text-red-400 drop-shadow-md" : "text-red-600")
                            )}>
                              {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>
                            <div className="flex items-center gap-1 -mr-2">
                              {(telegramToken && telegramChatId) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!tx.telegramSent) {
                                      sendToTelegram(tx, telegramToken, telegramChatId);
                                    }
                                  }}
                                  className={cn("transition-colors p-1.5", 
                                    tx.telegramSent 
                                      ? (tx.imageUrl ? "text-blue-400 drop-shadow-md" : "text-blue-500")
                                      : (tx.imageUrl ? "text-white/40 hover:text-white/80 drop-shadow-md" : "text-gray-300 hover:text-gray-500")
                                  )}
                                  title={tx.telegramSent ? "Đã gửi Telegram" : "Gửi lại Telegram"}
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={(e) => handleShare(tx, e)}
                                className={cn("transition-colors p-1.5", tx.imageUrl ? "text-white/80 hover:text-green-400 drop-shadow-md" : "text-gray-300 hover:text-green-500")}
                                title="Chia sẻ"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(tx); }}
                                className={cn("transition-colors p-1.5", tx.imageUrl ? "text-white/80 hover:text-white drop-shadow-md" : "text-gray-300 hover:text-blue-500")}
                                title="Sửa"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(tx.id); }}
                                className={cn("transition-colors p-1.5", tx.imageUrl ? "text-white/80 hover:text-red-400 drop-shadow-md" : "text-gray-300 hover:text-red-500")}
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        <div className={cn("mt-auto", tx.imageUrl ? "" : "")}>
                          {tx.description && (
                            <p className={cn("text-sm mb-2", tx.imageUrl ? "text-gray-200 line-clamp-2 drop-shadow-md" : "text-gray-600")}>{tx.description}</p>
                          )}
                          
                          {tx.location && (
                            <p className={cn("text-xs flex items-center gap-1", tx.imageUrl ? "text-gray-300 drop-shadow-md" : "text-gray-500 mb-3")}>
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{tx.location}</span>
                            </p>
                          )}
                        </div>
                      </div>
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
              const totalIncome = income.reduce((sum, tx) => sum + tx.amount, 0);
              const totalExpense = expense.reduce((sum, tx) => sum + tx.amount, 0);
              
              return (
                <div key={date} className="space-y-4">
                  <div className="sticky top-0 bg-gray-50/95 backdrop-blur-sm py-2 z-10 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-800">{date}</h3>
                  </div>
                  
                  {/* Expense Section */}
                  {expense.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-2 px-1">
                        <h4 className="text-xs font-medium text-red-600 uppercase tracking-wider">Khoản Chi</h4>
                        <span className="text-xs font-bold text-red-600">{formatCurrency(totalExpense)}</span>
                      </div>
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
                      <div className="flex justify-between items-center mb-2 px-1 mt-4">
                        <h4 className="text-xs font-medium text-green-600 uppercase tracking-wider">Khoản Thu</h4>
                        <span className="text-xs font-bold text-green-600">{formatCurrency(totalIncome)}</span>
                      </div>
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
    const now = new Date();
    const nowStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(nowStartOfDay.getTime() - 24 * 60 * 60 * 1000);
    
    // Calculate start of week (Monday)
    const day = nowStartOfDay.getDay();
    const diff = nowStartOfDay.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(nowStartOfDay.getTime());
    startOfWeek.setDate(diff);

    const filteredTransactions = transactions.filter(t => {
      const txDate = new Date(t.timestamp);
      const txStartOfDay = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());

      switch (reportPeriod) {
        case 'today':
          return txStartOfDay.getTime() === nowStartOfDay.getTime();
        case 'yesterday':
          return txStartOfDay.getTime() === yesterday.getTime();
        case 'this_week':
          return txStartOfDay.getTime() >= startOfWeek.getTime();
        case 'this_month':
          return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
        case 'last_month':
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return txDate.getMonth() === lastMonth.getMonth() && txDate.getFullYear() === lastMonth.getFullYear();
        case 'this_year':
          return txDate.getFullYear() === now.getFullYear();
        case 'custom':
          if (customDateRange.start && customDateRange.end) {
            const endOfDay = new Date(customDateRange.end.getFullYear(), customDateRange.end.getMonth(), customDateRange.end.getDate(), 23, 59, 59, 999);
            return txDate.getTime() >= customDateRange.start.getTime() && txDate.getTime() <= endOfDay.getTime();
          }
          if (customDateRange.start) {
             return txDate.getTime() >= customDateRange.start.getTime();
          }
          if (customDateRange.end) {
             const endOfDay = new Date(customDateRange.end.getFullYear(), customDateRange.end.getMonth(), customDateRange.end.getDate(), 23, 59, 59, 999);
             return txDate.getTime() <= endOfDay.getTime();
          }
          return true;
        case 'all_time':
        default:
          return true;
      }
    });

    const categories = reportType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    
    const categoryData = categories.map(cat => ({
      name: cat,
      value: filteredTransactions.filter(t => t.type === reportType && t.category === cat).reduce((sum, t) => sum + t.amount, 0)
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

    const COLORS = reportType === 'expense' 
      ? ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef']
      : ['#10b981', '#059669', '#047857', '#34d399', '#6ee7b7', '#a7f3d0'];

    const totalIncome = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    // Prepare data for BarChart (Trend)
    let trendData: any[] = [];
    if (reportPeriod === 'this_month' || reportPeriod === 'last_month') {
      // Group by day
      const daysInMonth = new Date(
        reportPeriod === 'this_month' ? now.getFullYear() : now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
        reportPeriod === 'this_month' ? now.getMonth() + 1 : now.getMonth(),
        0
      ).getDate();
      
      for (let i = 1; i <= daysInMonth; i++) {
        const dayTxs = filteredTransactions.filter(t => new Date(t.timestamp).getDate() === i);
        trendData.push({
          name: `${i}`,
          amount: dayTxs.filter(t => t.type === reportType).reduce((sum, t) => sum + t.amount, 0)
        });
      }
    } else {
      // Group by month
      for (let i = 0; i < 12; i++) {
        const monthTxs = filteredTransactions.filter(t => new Date(t.timestamp).getMonth() === i);
        trendData.push({
          name: `T${i + 1}`,
          amount: monthTxs.filter(t => t.type === reportType).reduce((sum, t) => sum + t.amount, 0)
        });
      }
    }

    return (
      <div className="px-6 py-8 max-w-lg mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Báo cáo chi tiết</h2>
        </div>

        {/* Time Filter */}
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 mb-6 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {[
            { id: 'today', label: 'Hôm nay' },
            { id: 'yesterday', label: 'Hôm qua' },
            { id: 'this_week', label: 'Tuần này' },
            { id: 'this_month', label: 'Tháng này' },
            { id: 'last_month', label: 'Tháng trước' },
            { id: 'this_year', label: 'Năm nay' },
            { id: 'all_time', label: 'Tất cả' },
            { id: 'custom', label: 'Tùy chọn' }
          ].map(period => (
            <button
              key={period.id}
              onClick={() => setReportPeriod(period.id as ReportPeriod)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors snap-start",
                reportPeriod === period.id
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {period.label}
            </button>
          ))}
        </div>
        
        {reportPeriod === 'custom' && (
          <div className="flex gap-4 mb-6">
             <div className="flex-1">
               <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
               <input 
                 type="date" 
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-black outline-none"
                 value={customDateRange.start ? format(customDateRange.start, 'yyyy-MM-dd') : ''}
                 onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value ? new Date(e.target.value) : null }))}
               />
             </div>
             <div className="flex-1">
               <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
               <input 
                 type="date" 
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-black outline-none"
                 value={customDateRange.end ? format(customDateRange.end, 'yyyy-MM-dd') : ''}
                 onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value ? new Date(e.target.value) : null }))}
               />
             </div>
          </div>
        )}
        
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

        {/* Type Toggle */}
        <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
          <button
            onClick={() => setReportType('expense')}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
              reportType === 'expense' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            )}
          >
            Khoản Chi
          </button>
          <button
            onClick={() => setReportType('income')}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
              reportType === 'income' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            )}
          >
            Khoản Thu
          </button>
        </div>

        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
          Xu hướng {reportType === 'expense' ? 'chi tiêu' : 'thu nhập'}
        </h3>
        <div className="h-48 mb-8 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#9ca3af' }} 
                dy={10}
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                cursor={{ fill: '#f3f4f6' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar 
                dataKey="amount" 
                fill={reportType === 'expense' ? '#ef4444' : '#10b981'} 
                radius={[4, 4, 0, 0]} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
          Cơ cấu {reportType === 'expense' ? 'chi tiêu' : 'thu nhập'}
        </h3>
        {categoryData.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Chưa có dữ liệu.</p>
        ) : (
          <>
            <div className="h-64 mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-3">
              {categoryData.map((item, index) => {
                const Icon = CategoryIcons[item.name] || HelpCircle;
                const percentage = ((item.value / (reportType === 'expense' ? totalExpense : totalIncome)) * 100).toFixed(1);
                
                return (
                  <div key={item.name} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900 block">{item.name}</span>
                        <span className="text-xs text-gray-500">{percentage}%</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(item.value)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const uniqueLocations = Array.from(new Set(transactions.map(t => t.location).filter(Boolean))) as string[];

  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          regex.test(part) ? <span key={i} className="font-semibold text-gray-900">{part}</span> : <span key={i}>{part}</span>
        )}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24 font-sans relative">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 w-full max-w-sm pointer-events-none"
          >
            <div className={cn(
              "px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 w-full backdrop-blur-md text-white font-medium text-sm",
              toast.type === 'error' ? "bg-red-500/95" : 
              toast.type === 'success' ? "bg-green-500/95" : "bg-gray-900/95"
            )}>
              {toast.type === 'error' && <X className="w-5 h-5 shrink-0" />}
              {toast.type === 'success' && <div className="w-5 h-5 shrink-0 flex items-center justify-center bg-white/20 rounded-full"><span className="text-white text-xs">✓</span></div>}
              {toast.type === 'info' && <Loader2 className="w-5 h-5 shrink-0 animate-spin" />}
              <span className="flex-1 drop-shadow-sm">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
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
                onClick={() => setShowImageSourcePicker(true)}
                className="w-14 h-14 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-800 active:scale-95 transition-all border-4 border-white"
                title="Chụp ảnh mới"
              >
                <Camera className="w-6 h-6 flex-shrink-0" />
              </button>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={galleryInputRef}
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
                  onClick={(e) => handleShare(imageTransactions[currentImageIndex], e)}
                  title="Chia sẻ"
                >
                  <Share2 className="w-6 h-6" />
                </button>
              )}
              {currentImageIndex !== -1 && telegramToken && telegramChatId && (
                <button 
                  className={cn("p-2 rounded-full transition-colors", 
                    imageTransactions[currentImageIndex].telegramSent 
                      ? "text-blue-400 bg-black/50" 
                      : "text-white/70 hover:text-white bg-black/50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!imageTransactions[currentImageIndex].telegramSent) {
                      sendToTelegram(imageTransactions[currentImageIndex], telegramToken, telegramChatId);
                    }
                  }}
                  title={imageTransactions[currentImageIndex].telegramSent ? "Đã gửi Telegram" : "Gửi lại Telegram"}
                >
                  <Send className="w-6 h-6" />
                </button>
              )}
              {currentImageIndex !== -1 && (
                <button 
                  className="p-2 text-white/70 hover:text-white bg-black/50 rounded-full transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(imageTransactions[currentImageIndex]);
                    setSelectedImage(null);
                  }}
                  title="Sửa"
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

      <AnimatePresence>
        {showImageSourcePicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowImageSourcePicker(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[80] bg-white rounded-t-3xl shadow-xl overflow-hidden"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-4" />
              <div className="px-6 pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Thêm thu chi mới</h3>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    onClick={() => {
                      setShowImageSourcePicker(false);
                      setIsModalOpen(true);
                      setExpression('');
                      setShowKeypad(true);
                      setDescription('');
                      setLocation('');
                      setCurrentImage(null);
                      setPreviewUrl(null);
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-4 py-6 bg-gray-50 rounded-2xl border border-gray-100 active:bg-gray-100 transition-colors"
                  >
                    <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                      <Edit2 className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-gray-700 text-center text-sm">Nhập tay</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowImageSourcePicker(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-4 py-6 bg-gray-50 rounded-2xl border border-gray-100 active:bg-gray-100 transition-colors"
                  >
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-gray-700 text-center text-sm">Máy ảnh</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowImageSourcePicker(false);
                      galleryInputRef.current?.click();
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-4 py-6 bg-gray-50 rounded-2xl border border-gray-100 active:bg-gray-100 transition-colors"
                  >
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-gray-700 text-center text-sm">Thư viện</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
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
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <button 
                      onClick={() => setShowImageSourcePicker(true)}
                      className="bg-black/50 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-black/70 transition-colors"
                      title="Đổi ảnh"
                    >
                      <Camera className="w-4 h-4" />
                      Đổi ảnh
                    </button>
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Danh mục</label>
                  <div 
                    className="flex overflow-x-auto snap-x snap-mandatory gap-2 pb-2 [&::-webkit-scrollbar]:hidden" 
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {(txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => {
                      const Icon = CategoryIcons[cat] || HelpCircle;
                      const isSelected = detectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setDetectedCategory(cat)}
                          className={cn(
                            "flex-none w-[calc((100%-16px)/3)] snap-start flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all",
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
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all mb-2"
                  />
                  {suggestedDescriptions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {suggestedDescriptions.map((desc, idx) => (
                        <button
                          key={idx}
                          onClick={() => setDescription(desc)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition-colors border border-gray-200"
                        >
                          {desc}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Location Input */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Địa điểm (Tùy chọn)</label>
                  <input 
                    type="text" 
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      setShowLocationSuggestions(true);
                    }}
                    onFocus={() => {
                      setShowKeypad(false);
                      setShowLocationSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowLocationSuggestions(false), 200);
                    }}
                    placeholder="VD: Quán cafe, siêu thị..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                  />
                  {showLocationSuggestions && uniqueLocations.filter(loc => loc.toLowerCase().includes(location.toLowerCase()) && loc !== location).length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {uniqueLocations
                        .filter(loc => loc.toLowerCase().includes(location.toLowerCase()) && loc !== location)
                        .map((loc, idx) => (
                          <div 
                            key={idx}
                            className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-500 border-b border-gray-50 last:border-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setLocation(loc);
                              setShowLocationSuggestions(false);
                            }}
                          >
                            {renderHighlightedText(loc, location)}
                          </div>
                      ))}
                    </div>
                  )}
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
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> 
                      {telegramToken && telegramChatId ? "Đang lưu & gửi Telegram..." : "Đang lưu..."}
                    </>
                  ) : "Lưu giao dịch"}
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

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0">
                <h2 className="text-lg font-bold">Cài đặt</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6">
                <div>
                  <h3 className="text-base font-semibold mb-1 text-blue-600 flex items-center gap-2">
                    <Share2 className="w-4 h-4" /> Telegram Bot
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">Tự động gửi thông báo khi có giao dịch mới vào nhóm/bot Telegram.</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Bot Token</label>
                      <input 
                        type="text" 
                        value={telegramToken}
                        onChange={(e) => setTelegramToken(e.target.value)}
                        placeholder="VD: 123456789:ABCdefGHIjkl..."
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Chat ID</label>
                      <input 
                        type="text" 
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="VD: 123456789 hoặc -100123456"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-base font-semibold mb-1 text-gray-900 flex items-center gap-2">
                    <Save className="w-4 h-4" /> Sao lưu & Khôi phục
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">Gửi bản sao lưu dữ liệu toàn bộ ứng dụng sang Telegram.</p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={sendBackupToTelegram}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-medium text-sm hover:bg-blue-100 transition-colors"
                    >
                      <UploadCloud className="w-4 h-4" /> Gửi Backup lên Telegram
                    </button>
                    
                    <button 
                      onClick={() => restoreFileRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gray-50 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                      <Download className="w-4 h-4" /> Khôi phục từ File
                    </button>
                    <input 
                      type="file" 
                      accept=".json"
                      className="hidden" 
                      ref={restoreFileRef}
                      onChange={handleRestoreBackup}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
