# 14 — Modals & Global Chrome

Top-level dialogs and window chrome. Entry: `App.tsx`, `QaModal`, `SemanticModal`, `AuditDialog`, `TitleBar`, `MenuBar`.

**Cases: 129.**

---

### TC-MOD-0001 — Shortcuts dialog
**As a** user, **when I** open shortcuts, **I expect** a categorised list with key bindings.
- **Result:** PASS

### TC-MOD-0002 — Onboarding modal
**As a** user, **when I** trigger onboarding, **I expect** the first-run walkthrough.
- **Result:** PASS

### TC-MOD-0003 — Q&A modal renders
**As a** user, **when I** ask AI about a selection, **I expect** the Q&A modal.
- **Result:** PASS

### TC-MOD-0004 — Semantic modal renders
**As a** user, **when I** open semantic search, **I expect** the modal.
- **Result:** PASS

### TC-MOD-0005 — Update prompt
**As a** user, **when I** be on an outdated build, **I expect** the update prompt; up-to-date → none.
- **Result:** PASS

### TC-MOD-0006 — Modals close cleanly
**As a** user, **when I** close any modal, **I expect** no leftover overlay.
- **Result:** PASS

### TC-MOD-0007 — Custom title bar
**As a** user, **when I** view the window, **I expect** a custom title bar with a drag region.
- **Result:** PASS

### TC-MOD-0008 — Menu bar (native)
**As a** user, **when I** use the menu, **I expect** File/Edit/View actions (native macOS menu).
- **Result:** N/A in DOM

### TC-MOD-0009 — No crash opening modals
**As a** user, **when I** open/close every modal, **I expect** no ErrorBoundary trips.
- **Result:** PASS

### TC-MOD-0010 — Settings: opens
**As a** user, **when I** open Settings, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0011 — Settings: Escape closes
**As a** user, **when I** press Escape in Settings, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0012 — Settings: focus trap
**As a** keyboard user, **when I** Tab through Settings, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0013 — Settings: at zoom 2
**As a** user, **when I** open Settings at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0014 — Settings under reado-dark
**As a** user, **when I** view Settings in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0015 — Settings under reado-light
**As a** user, **when I** view Settings in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0016 — Settings under reado-sepia
**As a** user, **when I** view Settings in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0017 — Settings under reado-high-contrast
**As a** user, **when I** view Settings in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0018 — Anywhere: opens
**As a** user, **when I** open Anywhere, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0019 — Anywhere: Escape closes
**As a** user, **when I** press Escape in Anywhere, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0020 — Anywhere: focus trap
**As a** keyboard user, **when I** Tab through Anywhere, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0021 — Anywhere: at zoom 2
**As a** user, **when I** open Anywhere at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0022 — Anywhere under reado-dark
**As a** user, **when I** view Anywhere in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0023 — Anywhere under reado-light
**As a** user, **when I** view Anywhere in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0024 — Anywhere under reado-sepia
**As a** user, **when I** view Anywhere in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0025 — Anywhere under reado-high-contrast
**As a** user, **when I** view Anywhere in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0026 — Shortcuts: opens
**As a** user, **when I** open Shortcuts, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0027 — Shortcuts: Escape closes
**As a** user, **when I** press Escape in Shortcuts, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0028 — Shortcuts: focus trap
**As a** keyboard user, **when I** Tab through Shortcuts, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0029 — Shortcuts: at zoom 2
**As a** user, **when I** open Shortcuts at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0030 — Shortcuts under reado-dark
**As a** user, **when I** view Shortcuts in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0031 — Shortcuts under reado-light
**As a** user, **when I** view Shortcuts in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0032 — Shortcuts under reado-sepia
**As a** user, **when I** view Shortcuts in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0033 — Shortcuts under reado-high-contrast
**As a** user, **when I** view Shortcuts in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0034 — Update prompt: opens
**As a** user, **when I** open Update prompt, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0035 — Update prompt: Escape closes
**As a** user, **when I** press Escape in Update prompt, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0036 — Update prompt: focus trap
**As a** keyboard user, **when I** Tab through Update prompt, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0037 — Update prompt: at zoom 2
**As a** user, **when I** open Update prompt at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0038 — Update prompt under reado-dark
**As a** user, **when I** view Update prompt in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0039 — Update prompt under reado-light
**As a** user, **when I** view Update prompt in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0040 — Update prompt under reado-sepia
**As a** user, **when I** view Update prompt in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0041 — Update prompt under reado-high-contrast
**As a** user, **when I** view Update prompt in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0042 — Onboarding: opens
**As a** user, **when I** open Onboarding, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0043 — Onboarding: Escape closes
**As a** user, **when I** press Escape in Onboarding, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0044 — Onboarding: focus trap
**As a** keyboard user, **when I** Tab through Onboarding, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0045 — Onboarding: at zoom 2
**As a** user, **when I** open Onboarding at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0046 — Onboarding under reado-dark
**As a** user, **when I** view Onboarding in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0047 — Onboarding under reado-light
**As a** user, **when I** view Onboarding in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0048 — Onboarding under reado-sepia
**As a** user, **when I** view Onboarding in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0049 — Onboarding under reado-high-contrast
**As a** user, **when I** view Onboarding in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0050 — Q&A modal: opens
**As a** user, **when I** open Q&A modal, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0051 — Q&A modal: Escape closes
**As a** user, **when I** press Escape in Q&A modal, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0052 — Q&A modal: focus trap
**As a** keyboard user, **when I** Tab through Q&A modal, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0053 — Q&A modal: at zoom 2
**As a** user, **when I** open Q&A modal at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0054 — Q&A modal under reado-dark
**As a** user, **when I** view Q&A modal in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0055 — Q&A modal under reado-light
**As a** user, **when I** view Q&A modal in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0056 — Q&A modal under reado-sepia
**As a** user, **when I** view Q&A modal in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0057 — Q&A modal under reado-high-contrast
**As a** user, **when I** view Q&A modal in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0058 — Semantic search: opens
**As a** user, **when I** open Semantic search, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0059 — Semantic search: Escape closes
**As a** user, **when I** press Escape in Semantic search, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0060 — Semantic search: focus trap
**As a** keyboard user, **when I** Tab through Semantic search, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0061 — Semantic search: at zoom 2
**As a** user, **when I** open Semantic search at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0062 — Semantic search under reado-dark
**As a** user, **when I** view Semantic search in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0063 — Semantic search under reado-light
**As a** user, **when I** view Semantic search in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0064 — Semantic search under reado-sepia
**As a** user, **when I** view Semantic search in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0065 — Semantic search under reado-high-contrast
**As a** user, **when I** view Semantic search in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0066 — Synopsis: opens
**As a** user, **when I** open Synopsis, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0067 — Synopsis: Escape closes
**As a** user, **when I** press Escape in Synopsis, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0068 — Synopsis: focus trap
**As a** keyboard user, **when I** Tab through Synopsis, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0069 — Synopsis: at zoom 2
**As a** user, **when I** open Synopsis at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0070 — Synopsis under reado-dark
**As a** user, **when I** view Synopsis in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0071 — Synopsis under reado-light
**As a** user, **when I** view Synopsis in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0072 — Synopsis under reado-sepia
**As a** user, **when I** view Synopsis in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0073 — Synopsis under reado-high-contrast
**As a** user, **when I** view Synopsis in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0074 — Audit dialog: opens
**As a** user, **when I** open Audit dialog, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0075 — Audit dialog: Escape closes
**As a** user, **when I** press Escape in Audit dialog, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0076 — Audit dialog: focus trap
**As a** keyboard user, **when I** Tab through Audit dialog, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0077 — Audit dialog: at zoom 2
**As a** user, **when I** open Audit dialog at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0078 — Audit dialog under reado-dark
**As a** user, **when I** view Audit dialog in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0079 — Audit dialog under reado-light
**As a** user, **when I** view Audit dialog in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0080 — Audit dialog under reado-sepia
**As a** user, **when I** view Audit dialog in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0081 — Audit dialog under reado-high-contrast
**As a** user, **when I** view Audit dialog in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0082 — Send-review dialog: opens
**As a** user, **when I** open Send-review dialog, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0083 — Send-review dialog: Escape closes
**As a** user, **when I** press Escape in Send-review dialog, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0084 — Send-review dialog: focus trap
**As a** keyboard user, **when I** Tab through Send-review dialog, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0085 — Send-review dialog: at zoom 2
**As a** user, **when I** open Send-review dialog at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0086 — Send-review dialog under reado-dark
**As a** user, **when I** view Send-review dialog in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0087 — Send-review dialog under reado-light
**As a** user, **when I** view Send-review dialog in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0088 — Send-review dialog under reado-sepia
**As a** user, **when I** view Send-review dialog in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0089 — Send-review dialog under reado-high-contrast
**As a** user, **when I** view Send-review dialog in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0090 — Tree-comment dialog: opens
**As a** user, **when I** open Tree-comment dialog, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0091 — Tree-comment dialog: Escape closes
**As a** user, **when I** press Escape in Tree-comment dialog, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0092 — Tree-comment dialog: focus trap
**As a** keyboard user, **when I** Tab through Tree-comment dialog, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0093 — Tree-comment dialog: at zoom 2
**As a** user, **when I** open Tree-comment dialog at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0094 — Tree-comment dialog under reado-dark
**As a** user, **when I** view Tree-comment dialog in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0095 — Tree-comment dialog under reado-light
**As a** user, **when I** view Tree-comment dialog in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0096 — Tree-comment dialog under reado-sepia
**As a** user, **when I** view Tree-comment dialog in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0097 — Tree-comment dialog under reado-high-contrast
**As a** user, **when I** view Tree-comment dialog in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0098 — Comment thread: opens
**As a** user, **when I** open Comment thread, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0099 — Comment thread: Escape closes
**As a** user, **when I** press Escape in Comment thread, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0100 — Comment thread: focus trap
**As a** keyboard user, **when I** Tab through Comment thread, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0101 — Comment thread: at zoom 2
**As a** user, **when I** open Comment thread at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0102 — Comment thread under reado-dark
**As a** user, **when I** view Comment thread in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0103 — Comment thread under reado-light
**As a** user, **when I** view Comment thread in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0104 — Comment thread under reado-sepia
**As a** user, **when I** view Comment thread in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0105 — Comment thread under reado-high-contrast
**As a** user, **when I** view Comment thread in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0106 — Comment composer: opens
**As a** user, **when I** open Comment composer, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0107 — Comment composer: Escape closes
**As a** user, **when I** press Escape in Comment composer, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0108 — Comment composer: focus trap
**As a** keyboard user, **when I** Tab through Comment composer, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0109 — Comment composer: at zoom 2
**As a** user, **when I** open Comment composer at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0110 — Comment composer under reado-dark
**As a** user, **when I** view Comment composer in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0111 — Comment composer under reado-light
**As a** user, **when I** view Comment composer in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0112 — Comment composer under reado-sepia
**As a** user, **when I** view Comment composer in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0113 — Comment composer under reado-high-contrast
**As a** user, **when I** view Comment composer in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0114 — Prompt dialog: opens
**As a** user, **when I** open Prompt dialog, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0115 — Prompt dialog: Escape closes
**As a** user, **when I** press Escape in Prompt dialog, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0116 — Prompt dialog: focus trap
**As a** keyboard user, **when I** Tab through Prompt dialog, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0117 — Prompt dialog: at zoom 2
**As a** user, **when I** open Prompt dialog at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0118 — Prompt dialog under reado-dark
**As a** user, **when I** view Prompt dialog in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0119 — Prompt dialog under reado-light
**As a** user, **when I** view Prompt dialog in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0120 — Prompt dialog under reado-sepia
**As a** user, **when I** view Prompt dialog in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0121 — Prompt dialog under reado-high-contrast
**As a** user, **when I** view Prompt dialog in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0122 — Gitignore prompt: opens
**As a** user, **when I** open Gitignore prompt, **I expect** it renders with its content.
- **Result:** TODO

### TC-MOD-0123 — Gitignore prompt: Escape closes
**As a** user, **when I** press Escape in Gitignore prompt, **I expect** it closes.
- **Result:** TODO

### TC-MOD-0124 — Gitignore prompt: focus trap
**As a** keyboard user, **when I** Tab through Gitignore prompt, **I expect** focus stays trapped inside.
- **Result:** TODO

### TC-MOD-0125 — Gitignore prompt: at zoom 2
**As a** user, **when I** open Gitignore prompt at zoom 2, **I expect** it stays viewport-anchored and correctly sized, not clipped.
- **Result:** TODO

### TC-MOD-0126 — Gitignore prompt under reado-dark
**As a** user, **when I** view Gitignore prompt in reado-dark, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0127 — Gitignore prompt under reado-light
**As a** user, **when I** view Gitignore prompt in reado-light, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0128 — Gitignore prompt under reado-sepia
**As a** user, **when I** view Gitignore prompt in reado-sepia, **I expect** correct colors and contrast.
- **Result:** TODO

### TC-MOD-0129 — Gitignore prompt under reado-high-contrast
**As a** user, **when I** view Gitignore prompt in reado-high-contrast, **I expect** correct colors and contrast.
- **Result:** TODO
