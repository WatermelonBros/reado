/**
 * Root component. Routes between the launcher (no project) and the project
 * workspace, keyed off the project path in the window's URL hash.
 */
import { useEffect, useState } from "react";
import { RecentProjects } from "./components/RecentProjects";
import { ProjectView } from "./components/ProjectView";
import { currentProjectPath } from "./lib/window";
import { useApplyTheme, useGlobalShortcuts } from "./lib/hooks";

export default function App() {
  useApplyTheme();
  useGlobalShortcuts();

  const [projectPath, setProjectPath] = useState<string | null>(currentProjectPath);

  // Support same-window navigation (used as a fallback when a dedicated
  // project window cannot be created).
  useEffect(() => {
    const onHashChange = () => setProjectPath(currentProjectPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return projectPath ? (
    <ProjectView key={projectPath} root={projectPath} />
  ) : (
    <RecentProjects />
  );
}
