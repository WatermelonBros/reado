import { t } from "@/i18n"
import { useGuidedReview } from "@/lib/guidedReview"
import { usePreReview } from "@/lib/preReview"
import { prompt as promptDialog } from "@/lib/prompt"
import { useResolveLoop } from "@/lib/resolveLoop"
import { useSemanticSearch } from "@/lib/semanticSearch"
import { usePalette, useProject, useWorkspace } from "@/lib/store"
import { runTests, useTesting } from "@/lib/testing"
import type { CommandTable } from "./types"

/** Reviewing and understanding a project: tours, tests, the review flows, search by meaning. */
export const reviewCommands: CommandTable = {
  "tours:open": { run: () => useWorkspace.getState().selectTool("tours") },
  "tests:runAll": {
    run: () => {
      for (const framework of new Set(useTesting.getState().files.map((f) => f.framework)))
        void runTests({ framework })
      useWorkspace.getState().selectTool("tests")
    },
  },
  "prereview:run": {
    run: () => {
      usePreReview.getState().generate(useProject.getState().root)
      useWorkspace.getState().selectTool("prereview")
    },
  },
  "guided:start": {
    run: () => {
      void useGuidedReview
        .getState()
        .start(useProject.getState().root, { kind: "diff" }, "bug_risk")
      useWorkspace.getState().selectTool("guidedreview")
    },
  },
  "guided:open": {
    run: () => {
      useGuidedReview.getState().load(useProject.getState().root)
      useWorkspace.getState().selectTool("guidedreview")
    },
  },
  "loop:start": {
    run: () => {
      void useResolveLoop.getState().start(useProject.getState().root, [])
      useWorkspace.getState().selectTool("guidedreview")
    },
  },
  "semantic:search": {
    run: () => {
      // The question is asked in a dialog of its own, so the palette goes first.
      usePalette.getState().close()
      void promptDialog({
        title: t("semantic.title"),
        placeholder: t("semantic.placeholder"),
      }).then((q) => q && useSemanticSearch.getState().run(q))
    },
  },
}
