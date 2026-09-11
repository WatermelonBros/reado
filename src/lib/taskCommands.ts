/**
 * The two ways a task is reached: pick one from a list, or run the build task
 * without being asked which.
 *
 * Kept apart from `tasks.ts` so the palette does not have to import the runner's
 * whole world — and so "what a command does" stays readable next to the other
 * command definitions.
 */
import { ask } from "@tauri-apps/plugin-dialog"
import { t } from "@/i18n"
import { notify } from "./notice"
import { usePalette, useProject } from "./store"
import { buildTask, createTasksFile, loadTasks, runTask } from "./tasks"

/** Offer the project's tasks, loading them first so an edited file is honoured
 *  without reopening the project. With none, offer to write a starter file. */
export async function openTaskList(): Promise<void> {
  const root = useProject.getState().root
  if (!root) return
  const tasks = await loadTasks(root)
  if (!tasks.length) {
    const yes = await ask(t("tasks.none"), { title: t("tasks.run"), okLabel: t("tasks.create") })
    if (yes) await createTasksFile(root)
    return
  }
  usePalette.getState().open("tasks")
}

/** Run the build task. With exactly one it runs without asking; with several
 *  there is a choice to make, so the list is the honest answer. */
export async function runBuildTask(): Promise<void> {
  const root = useProject.getState().root
  if (!root) return
  const tasks = await loadTasks(root)
  const build = buildTask(tasks)
  if (build) {
    await runTask(build)
    return
  }
  if (!tasks.length) {
    notify("info", t("tasks.none"))
    return
  }
  usePalette.getState().open("tasks")
}
