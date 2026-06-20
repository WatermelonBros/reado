/**
 * Root component. Routes between the launcher (no project) and the project
 * workspace, keyed off the project path in the window's URL hash.
 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RecentProjects } from "./components/pages/RecentProjects";
import { ProjectView } from "./components/pages/ProjectView";
import { currentProjectPath } from "./lib/window";
import { useApplyTheme, useApplyZoom, useGlobalShortcuts } from "./lib/hooks";
import { checkForUpdates } from "./lib/updater";
import { listenForMenu } from "./lib/menu";
import { UpdatePrompt } from "./components/organisms/UpdatePrompt";

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

  // Take focus on startup. After an auto-update the app relaunches; the fresh
  // window can come up without first-responder status, so clicks are ignored
  // until it's focused. Claiming focus here avoids needing a manual restart.
  useEffect(() => {
    getCurrentWindow().setFocus().catch(() => {});
  }, []);

  // Suppress the webview's default context menu (Reload/Inspect…) everywhere
  // except editable fields, where the native copy/paste menu is useful. Our own
  // right-click menus handle their own `contextmenu` events, so they're
  // unaffected; this only removes the menu where there's nothing to offer.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  return (
    <>
      {projectPath ? <ProjectView key={projectPath} root={projectPath} /> : <RecentProjects />}
      <UpdatePrompt />
    </>
  );
}
