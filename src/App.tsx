/**
 * Root component. Routes between the launcher (no project) and the project
 * workspace, keyed off the project path in the window's URL hash.
 */
import { useEffect, useState } from "react";
import { RecentProjects } from "./components/RecentProjects";
import { ProjectView } from "./components/ProjectView";
import { currentProjectPath } from "./lib/window";
import { useApplyTheme, useApplyZoom, useGlobalShortcuts } from "./lib/hooks";
import { checkForUpdates } from "./lib/updater";
import { listenForMenu } from "./lib/menu";

export default function App() {
  useApplyTheme();
  useApplyZoom();
  useGlobalShortcuts();

  const [projectPath, setProjectPath] = useState<string | null>(currentProjectPath);

  // Support same-window navigation (used as a fallback when a dedicated
  // project window cannot be created).
  useEffect(() => {
    const onHashChange = () => setProjectPath(currentProjectPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Silent update check on the launcher window only.
  useEffect(() => {
    if (currentProjectPath() === null) void checkForUpdates(false);
  }, []);

  // Route native-menu clicks to in-app commands.
  useEffect(() => {
    const off = listenForMenu();
    return () => void off.then((fn) => fn());
  }, []);

  return projectPath ? (
    <ProjectView key={projectPath} root={projectPath} />
  ) : (
    <RecentProjects />
  );
}
