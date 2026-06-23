/**
 * Root component. Routes between the launcher (no project) and the project
 * workspace, keyed off the project path in the window's URL hash.
 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RecentProjects } from "./components/pages/RecentProjects";
import { ProjectView } from "./components/pages/ProjectView";
import { currentProjectPath } from "./lib/window";
import {
  useApplyTheme,
  useApplyZoom,
  useAutoUpdateCheck,
  useGlobalShortcuts,
  useCrossWindowSync,
} from "./lib/hooks";
import { listenForMenu } from "./lib/menu";
import { UpdatePrompt } from "./components/organisms/UpdatePrompt";
import { EditMenu } from "./components/molecules/EditMenu";
import { ShortcutsDialog } from "./components/organisms/ShortcutsDialog";
import { PromptDialog } from "./components/organisms/PromptDialog";
import { TitleBar } from "./components/organisms/TitleBar";

export default function App() {
  useApplyTheme();
  useApplyZoom();
  useGlobalShortcuts();
  useAutoUpdateCheck();
  useCrossWindowSync();

  const [projectPath, setProjectPath] = useState<string | null>(currentProjectPath);

  // Support same-window navigation (used as a fallback when a dedicated
  // project window cannot be created).
  useEffect(() => {
    const onHashChange = () => setProjectPath(currentProjectPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Route native-menu clicks to in-app commands.
  useEffect(() => {
    const off = listenForMenu();
    return () => void off.then((fn) => fn());
  }, []);

  // Take focus on startup. After an auto-update the app relaunches; the fresh
  // window can come up without first-responder status, so clicks are ignored
  // until it's focused. Claiming focus here avoids needing a manual restart.
  useEffect(() => {
    getCurrentWindow().setFocus().catch(() => {});
  }, []);


  const projectName = projectPath ? (projectPath.split(/[\\/]/).pop() ?? null) : null;

  return (
    <div className="flex h-full flex-col">
      <TitleBar projectName={projectName} />
      <div className="min-h-0 flex-1">
        {projectPath ? <ProjectView key={projectPath} root={projectPath} /> : <RecentProjects />}
      </div>
      <UpdatePrompt />
      <EditMenu />
      <ShortcutsDialog />
      <PromptDialog />
    </div>
  );
}
