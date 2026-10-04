/**
 * What a build embedding Reado can add beyond the slots (`slots.ts`): whole panels,
 * a settings tab, editor context-menu items, completions in the comment composer
 * and renderers for comment messages.
 *
 * Same rules as the slots: the community build registers nothing, the official
 * build registers before `boot()` renders, and contributions are fixed per build —
 * so these are plain module-level registries, not stores.
 */
import type { EditorView } from "@codemirror/view"
import type { ComponentType, ReactNode } from "react"
import type { Components, Options } from "react-markdown"
import type { DockArea } from "./layout"

// ─── Panels ──────────────────────────────────────────────────────────────────

/** A dockable panel. Like a tool panel, it is open by being placed in the layout. */
export interface PanelContribution {
  id: string
  /** The tab's label, already translated. */
  title: () => string
  /** Where it docks when revealed and not placed yet. */
  home: DockArea
  Component: ComponentType
  /** Given, the panel gets a button in the activity bar that shows and hides it. */
  icon?: ComponentType<{ className?: string }>
}

const panels = new Map<string, PanelContribution>()

export function registerPanel(panel: PanelContribution): void {
  panels.set(panel.id, panel)
}

export const panelContribution = (id: string): PanelContribution | undefined => panels.get(id)

export const panelContributions = (): PanelContribution[] => [...panels.values()]

// ─── Project tour menu ───────────────────────────────────────────────────────

/** An entry at the end of the "Project tour" button's menu (the official build's
 *  "Edit tours…"). `label` is told whether the project has tours yet. */
export interface TourMenuItem {
  label: (hasTours: boolean) => string
  run: () => void
  /** When given and false, the entry is left out. */
  when?: () => boolean
}

const tourMenu: TourMenuItem[] = []

export function registerTourMenuItem(item: TourMenuItem): void {
  tourMenu.push(item)
}

/** The entries that apply right now. */
export const tourMenuItems = (): TourMenuItem[] => tourMenu.filter((i) => i.when?.() ?? true)

// ─── Settings tabs ───────────────────────────────────────────────────────────

/** A tab in the settings' rail, after the built-in ones. */
export interface SettingsTabContribution {
  id: string
  label: () => string
  Component: ComponentType
}

const settingsTabList: SettingsTabContribution[] = []

export function registerSettingsTab(tab: SettingsTabContribution): void {
  settingsTabList.push(tab)
}

export const settingsTabs = (): readonly SettingsTabContribution[] => settingsTabList

// ─── Editor context menu ─────────────────────────────────────────────────────

export interface EditorMenuContribution {
  label: string
  run: () => void
}

/** Where the menu was opened: the view and the file it edits. */
export interface EditorMenuTarget {
  view: EditorView
  root: string
  relPath: string
}

type EditorMenuSource = (target: EditorMenuTarget) => EditorMenuContribution[]

const editorMenuSources: EditorMenuSource[] = []

export function registerEditorMenuItems(source: EditorMenuSource): void {
  editorMenuSources.push(source)
}

export const editorMenuContributions = (target: EditorMenuTarget): EditorMenuContribution[] =>
  editorMenuSources.flatMap((source) => source(target))

// ─── Comment composer completions ────────────────────────────────────────────

/** One suggestion: `insert` replaces the trigger and the query typed after it. */
export interface CompletionItem {
  insert: string
  label: string
  detail?: string
  /** Drawn before the label — an avatar, for a person. */
  icon?: ReactNode
}

/** What the composer is writing into: a project, and the comment when replying. */
export interface CompletionContext {
  root: string
  commentId?: string
}

export interface CompletionSource {
  /** A single character, typed at the start of a word (`@`). */
  trigger: string
  items: (query: string, ctx: CompletionContext) => CompletionItem[]
  /** Shown instead of the list when the source has nothing to offer here. */
  unavailable?: (ctx: CompletionContext) => string | null
  /** What to highlight in the text as it is written (the mentions it would make). */
  marks?: (text: string, ctx: CompletionContext) => { from: number; to: number }[]
}

const completionSources: CompletionSource[] = []

export function registerComposerCompletion(source: CompletionSource): void {
  completionSources.push(source)
}

export const composerCompletions = (): readonly CompletionSource[] => completionSources

/** The completion being typed at `caret`: a trigger at the start of a word, then
 *  word characters. Null when the caret isn't in one. */
export function completionAt(
  text: string,
  caret: number,
  triggers: readonly string[],
): { trigger: string; start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|[\s(])(\S)([\w.-]*)$/.exec(before)
  if (!m || !triggers.includes(m[2])) return null
  return { trigger: m[2], start: caret - m[3].length - 1, query: m[3] }
}

// ─── Message rendering ───────────────────────────────────────────────────────

/** Extra remark plugins and element renderers for comment messages. */
export interface MessageRenderer {
  remarkPlugins?: NonNullable<Options["remarkPlugins"]>
  components?: Components
}

const messageRenderers: MessageRenderer[] = []

export function registerMessageRenderer(renderer: MessageRenderer): void {
  messageRenderers.push(renderer)
}

/** Every registered renderer, merged into one set of `react-markdown` props. */
export function messageRendering(): Required<MessageRenderer> {
  return {
    remarkPlugins: messageRenderers.flatMap((r) => r.remarkPlugins ?? []),
    components: Object.assign({}, ...messageRenderers.map((r) => r.components ?? {})),
  }
}

/** Test-only: forget every registration. */
export function resetContributionsForTest(): void {
  panels.clear()
  tourMenu.length = 0
  settingsTabList.length = 0
  editorMenuSources.length = 0
  completionSources.length = 0
  messageRenderers.length = 0
}
