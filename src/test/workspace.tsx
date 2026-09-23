/**
 * The whole app, rendered for a browser test against the fake backend, with a
 * project open — the boot every such test needs before it can check anything.
 */
import { render, screen, within } from "@testing-library/react"
import { createRoot } from "react-dom/client"
import { userEvent } from "vitest/browser"
import App from "@/App"
import { ROOT } from "./fakeBackend"

/** Call once per file, before the fake backend is installed and anything renders. */
export function prepareWorkspace() {
  localStorage.clear()
  localStorage.setItem("reado.tour.seen", "1") // the first-run tour would cover everything
  window.location.hash = `project=${encodeURIComponent(ROOT)}`
}

/** Render the app into a full-window box, as #root is in the app (`h-full`
 *  needs a height to fill). Returns the element it rendered into. */
export function renderApp(): HTMLElement {
  const host = document.body.appendChild(document.createElement("div"))
  host.style.height = "100vh"
  return render(<App />, { container: host }).container
}

/** Like `renderApp`, but outside Testing Library's per-test cleanup: one app
 *  that outlives a test, for a suite that walks many screens of the same boot.
 *  Returns the element it rendered into and how to take it down. */
export function mountApp(): { app: HTMLElement; unmount: () => void } {
  const app = document.body.appendChild(document.createElement("div"))
  app.style.height = "100vh"
  const root = createRoot(app)
  root.render(<App />)
  return {
    app,
    unmount: () => {
      root.unmount()
      app.remove()
    },
  }
}

/** Open `path` (relative to the project) from the file tree. The workspace is
 *  persisted between tests, so a folder may already be expanded. Returns the
 *  file's row in the tree. */
export async function openFromTree(path: string): Promise<HTMLElement> {
  const tree = await screen.findByRole("tree", {}, { timeout: 5000 })
  const parts = path.split("/")
  const name = parts[parts.length - 1]
  for (const dir of parts.slice(0, -1)) {
    const folder = await within(tree).findByText(dir, {}, { timeout: 5000 })
    // Ask the row, not the rows below it: a restored folder is expanded before
    // its children have loaded, and clicking it then would fold it.
    const row = folder.closest('[role="treeitem"]')
    if (row?.getAttribute("aria-expanded") !== "true") await userEvent.click(folder)
  }
  const row = await within(tree).findByText(name, {}, { timeout: 5000 })
  await userEvent.click(row)
  return row
}
