# 11 — Settings

Settings panel. `useSettings` persisted to `localStorage[reado.settings]`. Theme via `resolveTheme` → `data-theme`. Entry: `Settings.tsx`.

**Cases: 57.**

---

### TC-SET-0001 — Open settings
**As a** user, **when I** open settings, **I expect** the panel (theme/mode/lang/font/auto-save/logging).
- **Result:** PASS

### TC-SET-0002 — Theme mode swaps controls
**As a** user, **when I** pick a mode, **I expect** manual → single theme; system/auto → light+dark pair.
- **Result:** PASS

### TC-SET-0003 — Manual theme applies
**As a** user, **when I** pick a theme in manual mode, **I expect** it applied immediately (data-theme).
- **Result:** PASS

### TC-SET-0004 — System/auto resolves pair
**As a** user, **when I** use system/auto mode, **I expect** the resolved light/dark theme applied.
- **Result:** PASS

### TC-SET-0005 — Auto-save setting
**As a** user, **when I** change auto-save, **I expect** off/afterDelay/onFocusChange saved.
- **Result:** PASS

### TC-SET-0006 — Interface zoom
**As a** user, **when I** change zoom, **I expect** applied and saved.
- **Result:** PASS

### TC-SET-0007 — Persistence
**As a** user, **when I** change settings, **I expect** they survive reload (localStorage reado.settings).
- **Result:** PASS

### TC-SET-0008 — Code font
**As a** user, **when I** change the code font, **I expect** the editor uses it.
- **Result:** TODO

### TC-SET-0009 — Language (i18n)
**As a** user, **when I** change language, **I expect** the UI switches it/en.
- **Result:** TODO

### TC-SET-0010 — Logging level
**As a** user, **when I** change log enabled/level, **I expect** applied.
- **Result:** TODO

### TC-SET-0011 — Completion sound
**As a** user, **when I** toggle the sound, **I expect** saved.
- **Result:** TODO

### TC-SET-0012 — No console errors
**As a** user, **when I** change settings, **I expect** no uncaught errors.
- **Result:** PASS

### TC-SET-0013 — Set theme mode = manual
**As a** user, **when I** set theme mode to manual, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0014 — Set theme mode = system
**As a** user, **when I** set theme mode to system, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0015 — Set theme mode = auto
**As a** user, **when I** set theme mode to auto, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0016 — Set manual theme = reado-dark
**As a** user, **when I** set manual theme to reado-dark, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0017 — Set manual theme = reado-light
**As a** user, **when I** set manual theme to reado-light, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0018 — Set manual theme = reado-sepia
**As a** user, **when I** set manual theme to reado-sepia, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0019 — Set manual theme = reado-high-contrast
**As a** user, **when I** set manual theme to reado-high-contrast, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0020 — Set light theme = reado-light
**As a** user, **when I** set light theme to reado-light, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0021 — Set light theme = reado-sepia
**As a** user, **when I** set light theme to reado-sepia, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0022 — Set dark theme = reado-dark
**As a** user, **when I** set dark theme to reado-dark, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0023 — Set dark theme = reado-high-contrast
**As a** user, **when I** set dark theme to reado-high-contrast, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0024 — Set auto-save = off
**As a** user, **when I** set auto-save to off, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0025 — Set auto-save = afterDelay
**As a** user, **when I** set auto-save to afterDelay, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0026 — Set auto-save = onFocusChange
**As a** user, **when I** set auto-save to onFocusChange, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0027 — Set zoom = 0.8
**As a** user, **when I** set zoom to 0.8, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0028 — Set zoom = 1.0
**As a** user, **when I** set zoom to 1.0, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0029 — Set zoom = 1.25
**As a** user, **when I** set zoom to 1.25, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0030 — Set zoom = 1.5
**As a** user, **when I** set zoom to 1.5, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0031 — Set zoom = 2.0
**As a** user, **when I** set zoom to 2.0, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0032 — Set language = it
**As a** user, **when I** set language to it, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0033 — Set language = en
**As a** user, **when I** set language to en, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0034 — Set line wrapping = on
**As a** user, **when I** set line wrapping to on, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0035 — Set line wrapping = off
**As a** user, **when I** set line wrapping to off, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0036 — Set focus mode = on
**As a** user, **when I** set focus mode to on, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0037 — Set focus mode = off
**As a** user, **when I** set focus mode to off, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0038 — Set sticky scroll = on
**As a** user, **when I** set sticky scroll to on, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0039 — Set sticky scroll = off
**As a** user, **when I** set sticky scroll to off, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0040 — Set reading width = constrained
**As a** user, **when I** set reading width to constrained, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0041 — Set reading width = full
**As a** user, **when I** set reading width to full, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0042 — Set activity bar = shown
**As a** user, **when I** set activity bar to shown, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0043 — Set activity bar = hidden
**As a** user, **when I** set activity bar to hidden, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0044 — Set status bar = shown
**As a** user, **when I** set status bar to shown, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0045 — Set status bar = hidden
**As a** user, **when I** set status bar to hidden, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0046 — Set breadcrumbs = shown
**As a** user, **when I** set breadcrumbs to shown, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0047 — Set breadcrumbs = hidden
**As a** user, **when I** set breadcrumbs to hidden, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0048 — Set whitespace = shown
**As a** user, **when I** set whitespace to shown, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0049 — Set whitespace = hidden
**As a** user, **when I** set whitespace to hidden, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0050 — Set logging = enabled
**As a** user, **when I** set logging to enabled, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0051 — Set logging = disabled
**As a** user, **when I** set logging to disabled, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0052 — Set log level = error
**As a** user, **when I** set log level to error, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0053 — Set log level = warn
**As a** user, **when I** set log level to warn, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0054 — Set log level = info
**As a** user, **when I** set log level to info, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0055 — Set log level = debug
**As a** user, **when I** set log level to debug, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0056 — Set completion sound = on
**As a** user, **when I** set completion sound to on, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO

### TC-SET-0057 — Set completion sound = off
**As a** user, **when I** set completion sound to off, **I expect** it applied immediately and persisted across reload.
- **Result:** TODO
