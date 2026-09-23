/** Shared style for a clickable status-bar item. */
export const ITEM =
  "inline-flex flex-none items-center gap-[5px] whitespace-nowrap rounded-sm px-1 transition-colors hover:bg-overlay hover:text-ink"

/** What every status-bar item is handed. */
export interface StatusItemProps {
  /** The active file, relative to the project root; null with no file open. */
  rel: string | null
}
