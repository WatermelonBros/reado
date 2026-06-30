/**
 * Custom right-click menu for plain text fields (inputs and textareas), so the
 * webview's native menu never appears. It offers Cut / Copy / Paste / Select
 * All. The code editor keeps its own richer menu (we skip `.cm-editor`), and
 * the file tree / tabs menus stop propagation, so they're unaffected. Anywhere
 * else, the default menu is simply suppressed.
 */
import { useEffect, useState } from "react";
import { readText as clipboardReadText, writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { ContextMenu, type ContextMenuItem } from "../atoms/ContextMenu";
import { useTranslation } from "react-i18next";

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Set a field's value through the native setter and fire `input`, so React's
 *  controlled-component onChange sees the change (a plain `el.value =` doesn't). */
function setFieldValue(el: Field, value: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.setSelectionRange(caret, caret);
}

export function EditMenu() {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ x: number; y: number; el: Field } | null>(null);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // The code editor renders its own context menu.
      if (!target || target.closest(".cm-editor")) return;
      e.preventDefault();
      const field = target.closest("input, textarea") as Field | null;
      setMenu(field && !field.disabled && !field.readOnly ? { x: e.clientX, y: e.clientY, el: field } : null);
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  if (!menu) return null;
  const { el } = menu;
  const hasSelection = el.selectionStart !== el.selectionEnd;

  const run = (fn: () => void | Promise<void>) => {
    el.focus();
    void fn();
  };
  const selection = () => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
  const items: ContextMenuItem[] = [
    {
      label: t("edit.cut"),
      disabled: !hasSelection,
      onSelect: () =>
        run(async () => {
          const start = el.selectionStart ?? 0;
          await clipboardWriteText(selection());
          setFieldValue(el, el.value.slice(0, start) + el.value.slice(el.selectionEnd ?? 0), start);
        }),
    },
    {
      label: t("edit.copy"),
      disabled: !hasSelection,
      onSelect: () => run(() => clipboardWriteText(selection())),
    },
    {
      label: t("edit.paste"),
      onSelect: () =>
        run(async () => {
          try {
            const text = await clipboardReadText();
            if (!text) return;
            const start = el.selectionStart ?? 0;
            const end = el.selectionEnd ?? 0;
            setFieldValue(el, el.value.slice(0, start) + text + el.value.slice(end), start + text.length);
          } catch {
            /* clipboard unavailable */
          }
        }),
    },
    {
      label: t("edit.selectAll"),
      separatorBefore: true,
      disabled: el.value.length === 0,
      onSelect: () => run(() => el.select()),
    },
  ];

  return <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />;
}
