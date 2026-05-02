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

