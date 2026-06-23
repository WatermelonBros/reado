/**
 * A reusable text-input dialog, promise-based, usable from anywhere (menus,
 * commands). `prompt({title})` resolves to the entered string, or null if
 * cancelled. The `PromptDialog` component renders the active prompt.
 */
import { create } from "zustand";

interface PromptOptions {
  title: string;
  placeholder?: string;
  value?: string;
  confirmLabel?: string;
}

interface PromptState {
  open: boolean;
  title: string;
  placeholder: string;
  value: string;
  confirmLabel: string;
  resolve: ((v: string | null) => void) | null;
  setValue: (v: string) => void;
  submit: () => void;
  cancel: () => void;
}

export const usePrompt = create<PromptState>((set, get) => ({
  open: false,
  title: "",
  placeholder: "",
  value: "",
  confirmLabel: "OK",
  resolve: null,
  setValue: (value) => set({ value }),
  submit: () => {
    const { resolve, value } = get();
    resolve?.(value.trim() ? value.trim() : null);
    set({ open: false, resolve: null });
  },
  cancel: () => {
    get().resolve?.(null);
    set({ open: false, resolve: null });
  },
}));

/** Open the input dialog; resolves with the text, or null if cancelled/empty. */
export function prompt(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    usePrompt.setState({
      open: true,
      title: opts.title,
      placeholder: opts.placeholder ?? "",
      value: opts.value ?? "",
      confirmLabel: opts.confirmLabel ?? "OK",
      resolve,
    });
  });
}
