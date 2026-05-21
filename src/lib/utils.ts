import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = error => reject(error);
  });
};

export const dataURItoBlob = (dataURI: string): Blob => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
};

export const addTimemarkOverlay = (
  imageUrl: string, 
  locationStr: string, 
  timestamp: number,
  amount: number,
  txType: 'income' | 'expense',
  description: string
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(imageUrl);

      ctx.drawImage(img, 0, 0);

      // Setup typography relative to image size
      const scale = Math.max(1, img.width / 1080);
      const padding = 40 * scale;
      const bottomY = img.height - padding;

      // Draw shadow gradient at bottom
      const gradient = ctx.createLinearGradient(0, img.height - (300 * scale), 0, img.height);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, img.height - (400 * scale), img.width, 400 * scale);

      ctx.fillStyle = 'white';
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';

      // Draw Time
      const d = new Date(timestamp);
      const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      ctx.font = `bold ${80 * scale}px sans-serif`;
      ctx.fillText(timeStr, padding, bottomY - (60 * scale));
      
      const timeWidth = ctx.measureText(timeStr).width;

      // Draw Divider
      ctx.fillStyle = '#f59e0b'; // Amber yellow line
      ctx.fillRect(padding + timeWidth + (20 * scale), bottomY - (130 * scale), 4 * scale, 70 * scale);

      // Draw Date and Day
      ctx.fillStyle = 'white';
      ctx.font = `${30 * scale}px sans-serif`;
      const dateStr = `${d.getDate()} Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
      ctx.fillText(dateStr, padding + timeWidth + (40 * scale), bottomY - (95 * scale));
      
      const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      const dayStr = days[d.getDay()];
      ctx.fillText(dayStr, padding + timeWidth + (40 * scale), bottomY - (60 * scale));

      // Draw Location
      if (locationStr) {
        ctx.font = `${28 * scale}px sans-serif`;
        // Handle long locations by truncating or just filling max width
        ctx.fillText(locationStr, padding, bottomY);
      }

      // Draw Amount & Description 
      ctx.textAlign = 'right';
      const amountStr = (txType === 'income' ? '+' : '-') + formatCurrency(amount);
      
      // Draw background pill for amount
      ctx.font = `bold ${48 * scale}px sans-serif`;
      const amountWidth = ctx.measureText(amountStr).width;
      
      ctx.fillStyle = txType === 'income' ? '#10b981' : '#f43f5e';
      ctx.fillText(amountStr, img.width - padding, bottomY - (30 * scale));
      
      if (description) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `${28 * scale}px sans-serif`;
        ctx.fillText(description, img.width - padding, bottomY);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
};

export const compressImage = (imageUrl: string, maxWidth = 1080): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let isFinished = false;

    // Safety timeout of 15 seconds
    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        console.error("compressImage timeout");
        resolve(imageUrl); // Fallback to original image on timeout
      }
    }, 15000);

    img.onload = () => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(imageUrl);

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch (err) {
        console.error("Canvas drawImage error", err);
        resolve(imageUrl); // Fallback to original on error
      }
    };

    img.onerror = (err) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      console.error("Image load error", err);
      resolve(imageUrl); // Fallback to original
    };

    img.src = imageUrl;
  });
};

