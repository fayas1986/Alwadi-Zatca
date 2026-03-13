
import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-center p-4 rounded-lg shadow-lg border-l-4 min-w-[300px] animate-in slide-in-from-right-full duration-300
              ${toast.type === 'success' ? 'bg-white border-emerald-500 text-slate-800' : ''}
              ${toast.type === 'error' ? 'bg-white border-rose-500 text-slate-800' : ''}
              ${toast.type === 'info' ? 'bg-white border-blue-500 text-slate-800' : ''}
              ${toast.type === 'warning' ? 'bg-white border-amber-500 text-slate-800' : ''}
            `}
          >
            <div className="mr-3">
              {toast.type === 'success' && <CheckCircle className="text-emerald-500" size={20} />}
              {toast.type === 'error' && <AlertCircle className="text-rose-500" size={20} />}
              {toast.type === 'info' && <Info className="text-blue-500" size={20} />}
              {toast.type === 'warning' && <AlertCircle className="text-amber-500" size={20} />}
            </div>
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-3 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
