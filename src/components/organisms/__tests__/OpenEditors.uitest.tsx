// "Open Editors": the list that can always say what is open, including when the
// tab strip is set to a single tab or hidden entirely and nothing else can.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { OpenEditors } from "@/components/organisms/OpenEditors"
import { useEditorActions, useProject, useSettings } from "@/lib/store"

beforeEach(() => {
  useProject.setState({
    root: "/proj",
    tabs: ["/proj/src/a.ts", "/proj/src/b.ts"],
    active: "/proj/src/a.ts",
    closedTabs: [],
  })
  useEditorActions.setState({ dirtyPaths: [] })
  useSettings.setState({ fileIcons: "off" })
})

/** Open the section — it starts collapsed, the tree is what the panel is for. */
const expand = () => userEvent.click(screen.getByRole("button", { expanded: false }))

describe("OpenEditors", () => {
  it("renders nothing with no open files", () => {
    useProject.setState({ tabs: [], active: null })
    const { container } = render(<OpenEditors />)
    expect(container).toBeEmptyDOMElement()
  })

  it("starts collapsed, showing only the count", async () => {
    render(<OpenEditors />)
    expect(screen.getByText("(2)")).toBeInTheDocument()
    expect(screen.queryByText("a.ts")).not.toBeInTheDocument()
    await expand()
    expect(screen.getByText("a.ts")).toBeInTheDocument()
    expect(screen.getByText("b.ts")).toBeInTheDocument()
  })

  it("switches to a file when its row is clicked", async () => {
    render(<OpenEditors />)
    await expand()
    await userEvent.click(screen.getByText("b.ts"))
    expect(useProject.getState().active).toBe("/proj/src/b.ts")
  })

  it("closes a file from its row without switching to it first", async () => {
    render(<OpenEditors />)
    await expand()
    await userEvent.click(screen.getByRole("button", { name: "tabs.close b.ts" }))
    expect(useProject.getState().tabs).toEqual(["/proj/src/a.ts"])
    expect(useProject.getState().active).toBe("/proj/src/a.ts")
  })

  it("marks a file with unsaved edits", async () => {
    useEditorActions.setState({ dirtyPaths: ["src/b.ts"] })
    render(<OpenEditors />)
    await expand()
    expect(screen.getAllByLabelText("tabs.unsaved")).toHaveLength(1)
  })

  it("still lists everything when the tab strip is hidden", async () => {
    // The reason this exists: with `tabBar: "hidden"` nothing else in the window
    // says what is open.
    useSettings.setState({ tabBar: "hidden" })
    render(<OpenEditors />)
    await expand()
    expect(screen.getByText("a.ts")).toBeInTheDocument()
    expect(screen.getByText("b.ts")).toBeInTheDocument()
  })
})
