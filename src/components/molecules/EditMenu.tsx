/**
 * Custom right-click menu for plain text fields (inputs and textareas), so the
 * webview's native menu never appears. It offers Cut / Copy / Paste / Select
 * All. The code editor keeps its own richer menu (we skip `.cm-editor`), and
 * the file tree / tabs menus stop propagation, so they're unaffected. Anywhere
 * else, the default menu is simply suppressed.
 */
import { useEffect, useState } from "react";
import { ContextMenu, type ContextMenuItem } from "../atoms/ContextMenu";
import { useT } from "../../i18n";

type Field = HTMLInputElement | HTMLTextAreaElement;

export function EditMenu() {
  const t = useT();
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

  const run = (fn: () => void) => {
    el.focus();
    fn();
  };
  const items: ContextMenuItem[] = [
    { label: t("edit.cut"), disabled: !hasSelection, onSelect: () => run(() => document.execCommand("cut")) },
    { label: t("edit.copy"), disabled: !hasSelection, onSelect: () => run(() => document.execCommand("copy")) },
    {
      label: t("edit.paste"),
      onSelect: () =>
        run(async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text) document.execCommand("insertText", false, text);
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
