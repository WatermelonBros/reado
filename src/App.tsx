/**
 * Root component. Routes between the launcher (no project) and the project
 * workspace, keyed off the project path in the window's URL hash.
 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { RecentProjects } from "./components/pages/RecentProjects";
import { ProjectView } from "./components/pages/ProjectView";
import { currentProjectPath, openInNewWindow } from "./lib/window";
import { anywhereSetRecents } from "./lib/api";
import { useRecents } from "./lib/store";
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
import { SynopsisModal } from "./components/organisms/SynopsisModal";
import { OnboardingModal } from "./components/organisms/OnboardingModal";
import { QaModal } from "./components/organisms/QaModal";
import { SemanticModal } from "./components/organisms/SemanticModal";
import { TitleBar } from "./components/organisms/TitleBar";
import { Settings } from "./components/organisms/Settings";
import { AnywhereDialog } from "./components/organisms/AnywhereDialog";

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

  // Reado Anywhere host — runs only in the main window so a phone can open a
  // project on the desktop: publish the recents list, and open a new window when
  // a phone requests one (allowed paths are gated to the recents on the backend).
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    const push = () =>
      void anywhereSetRecents(
        useRecents.getState().projects.map((p) => ({ path: p.path, name: p.name })),
      ).catch(() => {});
    push();
    const unsub = useRecents.subscribe(push);
    const off = listen<string>("anywhere://open-project", (e) => openInNewWindow(e.payload));
    return () => {
      unsub();
      void off.then((fn) => fn());
    };
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
      {/* Settings and Reado Anywhere live at the app root so they open from the
          launcher too (no project / no tabs), not only inside a project. */}
      <Settings />
      <AnywhereDialog />
      <ShortcutsDialog />
      <PromptDialog />
      <SynopsisModal />
      <OnboardingModal />
      <QaModal />
      <SemanticModal />
    </div>
  );
}
