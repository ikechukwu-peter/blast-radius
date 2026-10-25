import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push(message: string, tone?: ToastTone, ms?: number): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(message, tone = 'info', ms = 3200) {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = (message: string, tone?: ToastTone, ms?: number) => useToasts.getState().push(message, tone, ms);
