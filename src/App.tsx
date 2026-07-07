/**
 * Root component. Routes between the launcher (no project) and the project
 * workspace, keyed off the project path in the window's URL hash.
 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { RecentProjects } from "./components/pages/RecentProjects";
import { ProjectView } from "./components/pages/ProjectView";
import { currentProjectPath, openInNewWindow, openPathTarget } from "./lib/window";
import { anywhereSetRecents, drainOpenTargets } from "./lib/api";
import { runStartupChecks } from "./lib/startup";
import { useRecents, useSettings } from "./lib/store";
import { applyLogConfig, log } from "./lib/logger";
import {
  useApplyTheme,
  useApplyZoom,
  useApplyReduceMotion,
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
import { DefaultAppPrompt } from "./components/organisms/DefaultAppPrompt";
import { Notice } from "./components/molecules/Notice";
import { GlobalTooltip } from "./components/atoms/GlobalTooltip";
import { TitleBar } from "./components/organisms/TitleBar";
import { Settings } from "./components/organisms/Settings";
import { Palette } from "./components/organisms/Palette";
import { OnboardingTour } from "./components/organisms/OnboardingTour";
import { AnywhereDialog } from "./components/organisms/AnywhereDialog";

export default function App() {
  useApplyTheme();
  useApplyZoom();
  useApplyReduceMotion();
  useGlobalShortcuts();
  useAutoUpdateCheck();
  useCrossWindowSync();

  // Self-heal on launch (e.g. install the `reado` CLI onto PATH if missing).
  useEffect(() => runStartupChecks(), []);

  const [projectPath, setProjectPath] = useState<string | null>(currentProjectPath);

  // Apply the user's logging preference on boot and whenever it changes; the
  // backend starts at a default level until this pushes the persisted choice.
  useEffect(() => {
    const apply = () => {
      const s = useSettings.getState();
      applyLogConfig(s.logEnabled, s.logLevel);
    };
    apply();
    return useSettings.subscribe(apply);
  }, []);

  // Narrate project open/close so the log tells the story of a session.
  useEffect(() => {
    if (!projectPath) return;
    const name = projectPath.split(/[\\/]/).pop();
    log.info("project opened", { name });
    return () => log.info("project closed", { name });
  }, [projectPath]);

  // Support same-window navigation (used as a fallback when a dedicated
  // project window cannot be created).
  useEffect(() => {
    const onHashChange = () => setProjectPath(currentProjectPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // "Open with Reado": files the OS handed us open at their project root. The
  // main window owns this — cold-launch requests are queued in the backend and
  // drained here on mount; while-running ones arrive as events.
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    drainOpenTargets()
      .then((targets) => targets.forEach((tgt) => void openPathTarget(tgt.root, tgt.file)))
      .catch(() => {});
    const off = listen<{ root: string; file: string }>("reado://open-path", (e) =>
      void openPathTarget(e.payload.root, e.payload.file),
    );
    return () => void off.then((fn) => fn()).catch(() => {});
  }, []);

  // Route native-menu clicks to in-app commands.
  useEffect(() => {
    const off = listenForMenu();
    return () => void off.then((fn) => fn()).catch(() => {});
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
      void off.then((fn) => fn()).catch(() => {});
    };
  }, []);


  const projectName = projectPath ? (projectPath.split(/[\\/]/).pop() ?? null) : null;

  return (
    <div className="flex h-full flex-col">
      <TitleBar projectName={projectName} />
      {/* Interface zoom: scale the content uniformly via transform (the title bar
          above stays fixed). The inner layer is sized at 1/zoom so that, scaled
          up, it fills the container — content reflows at the larger scale in place.
          transform (unlike CSS `zoom`) scales every descendant uniformly and is
          honoured by CodeMirror's coordinate mapping. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="origin-top-left"
          style={{
            transform: "scale(var(--app-zoom, 1))",
            width: "calc(100% / var(--app-zoom, 1))",
            height: "calc(100% / var(--app-zoom, 1))",
          }}
        >
          {projectPath ? <ProjectView key={projectPath} root={projectPath} /> : <RecentProjects />}
        </div>
      </div>
      {/* The command palette / file finder is a viewport-anchored overlay, so it
          lives OUTSIDE the zoom layer (like Settings) — otherwise it scaled with
          the content and overflowed off-screen at zoom > 1. */}
      <Palette />
      {/* The tour spotlights elements inside the zoom layer but must render its
          own backdrop/positioner OUTSIDE it (a transform ancestor breaks fixed
          positioning), so it lives at the root like Palette/Settings. */}
      <OnboardingTour />
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
      <DefaultAppPrompt />
      <Notice />
      <GlobalTooltip />
    </div>
  );
}
