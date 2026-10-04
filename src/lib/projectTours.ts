/**
 * Project tours: guided walks through a project's code, shipped in the repository
 * as `tour.json` at its root and played for anyone who opens it — any build, no
 * account. Writing them is the official build's Tour editor; reading and playing
 * them is here.
 *
 * The format is open and names no product (spec: `docs/tour-format.md`, schema:
 * `docs/tour.schema.json`), so other tools can read and write the same file. A
 * `tour.json` is a tour file by its shape — `version` and `tours` — never by a
 * brand; anything else with that name is someone else's file and is ignored.
 *
 * Separate from the personal reading tours (`tours.ts`, `.reado/tours.json`).
 */
import { create } from "zustand"
import { t } from "@/i18n"
import { readFile } from "./api"
import { log } from "./logger"
import { notify } from "./notice"
import { useReadProgress } from "./readProgress"
import { contentHash, escapeRegExp } from "./strings"

export const TOUR_FILE = "tour.json"
/** The format's major version this build reads. */
export const TOUR_FORMAT_VERSION = 1
export const TOUR_SCHEMA_URL = "https://reado.watermelon-studio.it/schema/tour/v1.json"

/** 1-based line; 1-based column in code points. No column = the whole line. */
export interface TourPos {
  line: number
  col?: number
}

export type TourPlacement = "auto" | "right" | "left" | "top" | "bottom"

export interface TourStep {
  file: string
  /** Absent: the whole file. `to.col` is exclusive. */
  span?: { from: TourPos; to: TourPos }
  /** The exact code of the span, which finds it again when the code moves. */
  text?: string
  title: string
  body: string
  placement?: TourPlacement
  [extension: string]: unknown
}

export interface Tour {
  id: string
  name: string
  description?: string
  onboarding?: boolean
  author?: string
  steps: TourStep[]
  [extension: string]: unknown
}

export interface TourFile {
  $schema?: string
  version: number
  tours: Tour[]
  [extension: string]: unknown
}

// ─── Validation ──────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const isPosInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 1

function validPos(v: unknown): v is TourPos {
  return isObj(v) && isPosInt(v.line) && (v.col === undefined || isPosInt(v.col))
}

/** A project-relative path that stays inside the project. */
export function safeRelPath(p: unknown): p is string {
  if (typeof p !== "string" || !p || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return false
  return !p.split(/[\\/]/).some((seg) => seg === "..")
}

export const PLACEMENTS: readonly TourPlacement[] = ["auto", "right", "left", "top", "bottom"]

function validStep(v: unknown): v is TourStep {
  if (!isObj(v) || !safeRelPath(v.file)) return false
  if (typeof v.title !== "string" || typeof v.body !== "string") return false
  if (v.text !== undefined && typeof v.text !== "string") return false
  if (v.placement !== undefined && !PLACEMENTS.includes(v.placement as TourPlacement)) return false
  if (v.span === undefined) return true
  if (!isObj(v.span) || !validPos(v.span.from) || !validPos(v.span.to)) return false
  return v.span.to.line >= v.span.from.line
}

function validTour(v: unknown): v is Tour {
  return (
    isObj(v) &&
    typeof v.id === "string" &&
    !!v.id &&
    typeof v.name === "string" &&
    (v.description === undefined || typeof v.description === "string") &&
    (v.onboarding === undefined || typeof v.onboarding === "boolean") &&
    (v.author === undefined || typeof v.author === "string") &&
    Array.isArray(v.steps) &&
    v.steps.length > 0 &&
    v.steps.every(validStep)
  )
}

export type ParsedTours =
  /** Not a tour file (no `version` + `tours`), or not JSON at all. */
  | { kind: "foreign" }
  /** A newer major version than this build reads. */
  | { kind: "newer"; version: number }
  | { kind: "tours"; tours: Tour[]; invalid: number; file: TourFile }

/** Read a `tour.json`'s text: the valid tours, and how many were skipped. */
export function parseTourFile(text: string): ParsedTours {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { kind: "foreign" }
  }
  if (!isObj(data) || !Number.isInteger(data.version) || !Array.isArray(data.tours))
    return { kind: "foreign" }
  const version = data.version as number
  if (version > TOUR_FORMAT_VERSION) return { kind: "newer", version }
  const tours = data.tours.filter(validTour)
  return { kind: "tours", tours, invalid: data.tours.length - tours.length, file: data as TourFile }
}

/** The project tour: the first marked `onboarding`. */
export const onboardingTour = (tours: readonly Tour[]): Tour | undefined =>
  tours.find((t) => t.onboarding)

// ─── Locating a step in the code ─────────────────────────────────────────────

/** A UTF-16 range in a document, the way CodeMirror counts. */
interface DocRange {
  from: number
  to: number
}

/** Offsets of each line's start. */
function lineStarts(doc: string): number[] {
  const starts = [0]
  for (let i = 0; i < doc.length; i++) if (doc[i] === "\n") starts.push(i + 1)
  return starts
}

/** The UTF-16 offset of 1-based code-point column `col` in the line at `start`. */
function colOffset(doc: string, start: number, end: number, col: number): number {
  let at = start
  for (let c = 1; c < col && at < end; c++) at += (doc.codePointAt(at) ?? 0) > 0xffff ? 2 : 1
  return at
}

/** Where a span sits in `doc`, or null when it doesn't fit any more. */
export function spanRange(doc: string, span: NonNullable<TourStep["span"]>): DocRange | null {
  const starts = lineStarts(doc)
  const { from, to } = span
  if (from.line > starts.length || to.line > starts.length) return null
  const lineEnd = (line: number) => (line < starts.length ? starts[line] - 1 : doc.length) // the end before its "\n"
  const a = from.col
    ? colOffset(doc, starts[from.line - 1], lineEnd(from.line), from.col)
    : starts[from.line - 1]
  const b = to.col
    ? colOffset(doc, starts[to.line - 1], lineEnd(to.line), to.col)
    : lineEnd(to.line)
  return b >= a ? { from: a, to: b } : null
}

/** Every place `text` occurs, exactly first, else ignoring whitespace. */
function occurrences(doc: string, text: string): DocRange[] {
  const found: DocRange[] = []
  for (let i = doc.indexOf(text); i !== -1; i = doc.indexOf(text, i + 1))
    found.push({ from: i, to: i + text.length })
  if (found.length) return found
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return found
  const re = new RegExp(words.map(escapeRegExp).join("\\s+"), "g")
  for (const m of doc.matchAll(re)) found.push({ from: m.index, to: m.index + m[0].length })
  return found
}

/**
 * Find a step's code in `doc`. By the code it quotes first (the nearest copy to
 * where the span says it was), then by the span alone when it quotes nothing.
 * A step whose quoted code is gone is unplaceable — `null` — rather than pointed
 * at whatever now sits on its old lines. A step without a span is the whole file.
 */
export function locateStep(
  doc: string,
  step: Pick<TourStep, "span" | "text">,
): DocRange | "file" | null {
  if (!step.span && !step.text) return "file"
  const expected = step.span ? spanRange(doc, step.span) : null
  if (step.text) {
    const hits = occurrences(doc, step.text)
    if (!hits.length) return null
    const near = expected?.from ?? 0
    return hits.reduce((best, h) =>
      Math.abs(h.from - near) < Math.abs(best.from - near) ? h : best,
    )
  }
  return expected
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface ProjectToursState {
  root: string
  tours: Tour[]
  /** Tours in the file that couldn't be read. */
  invalid: number
  /** The file is a newer major version than this build reads. */
  newer: boolean
  /** The tour playing and the step to start from; null when none is. */
  playing: { tourId: string; step: number } | null
  /** A tour played without being in the file — an author previewing a draft. */
  preview: Tour | null
  load: (root: string) => Promise<void>
  play: (tourId: string, step?: number) => void
  /** Play `tour` as it is, from `step`, without it being saved anywhere. */
  playPreview: (root: string, tour: Tour, step?: number) => void
  stop: () => void
}

export const useProjectTours = create<ProjectToursState>((set, get) => ({
  root: "",
  tours: [],
  invalid: 0,
  newer: false,
  playing: null,
  preview: null,
  load: async (root) => {
    const c = await readFile(root, TOUR_FILE).catch(() => null)
    const parsed = c?.kind === "text" ? parseTourFile(c.text) : ({ kind: "foreign" } as const)
    if (parsed.kind === "tours" && parsed.invalid)
      log.warn("tour.json: tours skipped", { invalid: parsed.invalid })
    // A tour removed from the file while it plays stops playing.
    const tours = parsed.kind === "tours" ? parsed.tours : []
    const playing = get().playing
    set({
      root,
      tours,
      invalid: parsed.kind === "tours" ? parsed.invalid : 0,
      newer: parsed.kind === "newer",
      playing:
        playing && (get().preview || tours.some((t) => t.id === playing.tourId)) ? playing : null,
    })
  },
  play: (tourId, step = 0) => set({ playing: { tourId, step }, preview: null }),
  playPreview: (root, tour, step = 0) =>
    set({ root: get().root || root, preview: tour, playing: { tourId: tour.id, step } }),
  stop: () => set({ playing: null, preview: null }),
}))

// ─── Progress (per machine) ──────────────────────────────────────────────────

/** A fingerprint of a tour's content (a changed tour restarts), once per object. */
const hashes = new WeakMap<Tour, string>()
function tourHash(tour: Tour): string {
  let h = hashes.get(tour)
  if (!h) {
    h = contentHash(JSON.stringify(tour))
    hashes.set(tour, h)
  }
  return h
}

const progressKey = (root: string, tourId: string) => `reado.tour.progress:${root}:${tourId}`
const offeredKey = (root: string) => `reado.tour.offered:${root}`

/** The step to resume from, if the user left this exact tour part-way. */
export function savedStep(root: string, tour: Tour): number | null {
  try {
    const raw = localStorage.getItem(progressKey(root, tour.id))
    if (!raw) return null
    const { hash, step } = JSON.parse(raw) as { hash: string; step: number }
    return hash === tourHash(tour) && step > 0 && step < tour.steps.length ? step : null
  } catch {
    return null
  }
}

export function saveStep(root: string, tour: Tour, step: number | null): void {
  try {
    if (step === null) localStorage.removeItem(progressKey(root, tour.id))
    else
      localStorage.setItem(
        progressKey(root, tour.id),
        JSON.stringify({ hash: tourHash(tour), step }),
      )
  } catch {
    /* private mode: no resume, nothing else lost */
  }
}

/** True the first time it's asked for this project on this machine, false after. */
function takeOffer(root: string): boolean {
  try {
    if (localStorage.getItem(offeredKey(root)) === "1") return false
    localStorage.setItem(offeredKey(root), "1")
    return true
  } catch {
    return false // private mode: never nag
  }
}

/**
 * Offer the project tour once, on a project where nothing has been read yet —
 * someone's first time here. Called after both the tours and the reading state
 * have loaded.
 */
export function offerProjectTour(root: string): void {
  const tour = onboardingTour(useProjectTours.getState().tours)
  if (!tour || useReadProgress.getState().read.size > 0 || !takeOffer(root)) return
  notify("info", t("projectTour.offer", { name: tour.name, count: tour.steps.length }), {
    label: t("projectTour.start"),
    run: () => useProjectTours.getState().play(tour.id),
  })
}
