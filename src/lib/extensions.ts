/**
 * Declarative extensions: the curated half of the marketplace.
 *
 * Each entry is a manifest, not code: metadata + how to install the server, per
 * OS. The actual binary that gets spawned is chosen by the Rust allowlist keyed
 * on `id` (so a manifest can't make Reado run an arbitrary command). The
 * marketplace reads this list; `useExtensions` persists which are disabled.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createLogger } from "./logger"

const log = createLogger("extensions")

export type OS = "mac" | "linux" | "windows"

/** The current platform, from the webview's user agent (no extra capability). */
export function currentOS(): OS {
  const ua = navigator.userAgent
  if (/Mac/i.test(ua)) return "mac"
  if (/Win/i.test(ua)) return "windows"
  return "linux"
}

export type LinuxPm = "apt" | "dnf" | "pacman" | "zypper" | "brew"

/** Install command per OS. `linux` may be a single string (a distro-agnostic
 * installer like npm/cargo/brew) or a per-package-manager map for system
 * packages that differ by distro. An OS/manager may be omitted when there's no
 * clean one-liner (the marketplace then shows "manual" + the prerequisite). */
interface Install {
  mac?: string
  windows?: string
  linux?: string | Partial<Record<LinuxPm, string>>
}

/** Same command on every OS (npm/rustup/go/dotnet/gem/coursier are portable). */
const all = (cmd: string): Install => ({ mac: cmd, linux: cmd, windows: cmd })

/** The install command for the current OS (and Linux package manager), or
 * undefined when none is configured (→ manual install). */
export function installCmd(
  ext: { install: Install },
  os: OS,
  linuxPm: LinuxPm | null,
): string | undefined {
  if (os !== "linux") return ext.install[os]
  const l = ext.install.linux
  if (typeof l === "string") return l
  return l && linuxPm ? l[linuxPm] : undefined
}

export interface LangServerExt {
  /** Must match the Rust `server_command` id and the LSP `SERVERS` id. */
  id: string
  name: string
  description: string
  /** How to install the server, per OS. */
  install: Install
  /** Prerequisite toolchain, shown up front (e.g. "Node.js"). */
  requires?: string
}

export const LANG_SERVERS: LangServerExt[] = [
  {
    id: "typescript",
    name: "TypeScript / JavaScript / React",
    description:
      "Types, diagnostics, imports and navigation for TS, JS and React (JSX/TSX). A project on TypeScript 7 needs nothing installed — its own compiler answers; older projects use typescript-language-server.",
    install: all("npm install -g typescript-language-server typescript"),
    requires: "Node.js",
  },
  {
    id: "angular",
    name: "Angular",
    description:
      "Angular language server — template type-checking and IntelliSense; auto-used in projects with angular.json.",
    install: all("npm install -g @angular/language-server typescript"),
    requires: "Node.js",
  },
  {
    id: "rust",
    name: "Rust",
    description: "rust-analyzer — the official Rust language server.",
    install: all("rustup component add rust-analyzer"),
    requires: "rustup",
  },
  {
    id: "python",
    name: "Python",
    description: "Pyright — fast type checking and IntelliSense for Python.",
    install: all("npm install -g pyright"),
    requires: "Node.js",
  },
  {
    id: "go",
    name: "Go",
    description: "gopls — the official Go language server.",
    install: all("go install golang.org/x/tools/gopls@latest"),
    requires: "Go toolchain",
  },
  {
    id: "cpp",
    name: "C / C++",
    description: "clangd — language server from the LLVM project.",
    install: {
      mac: "brew install llvm",
      windows: "winget install LLVM.LLVM",
      linux: {
        apt: "sudo apt install clangd",
        dnf: "sudo dnf install clang-tools-extra",
        pacman: "sudo pacman -S clang",
        zypper: "sudo zypper install clang-tools",
        brew: "brew install llvm",
      },
    },
    requires: "LLVM / clangd",
  },
  {
    id: "bash",
    name: "Bash",
    description: "bash-language-server — diagnostics and completion for shell scripts.",
    install: all("npm install -g bash-language-server"),
    requires: "Node.js",
  },
  {
    id: "csharp",
    name: "C#",
    description: "csharp-ls — a lightweight C# language server.",
    install: all("dotnet tool install --global csharp-ls"),
    requires: ".NET SDK",
  },
  {
    id: "java",
    name: "Java",
    description: "Eclipse JDT Language Server (jdtls).",
    install: {
      mac: "brew install jdtls",
      windows: "scoop install jdtls",
      linux: { brew: "brew install jdtls" },
    },
    requires: "Java 17+",
  },
  {
    id: "kotlin",
    name: "Kotlin",
    description: "kotlin-language-server — IDE features for Kotlin.",
    install: {
      mac: "brew install kotlin-language-server",
      windows: "scoop install kotlin-language-server",
      linux: { brew: "brew install kotlin-language-server" },
    },
    requires: "Java",
  },
  {
    id: "scala",
    name: "Scala",
    description: "Metals — the Scala language server.",
    install: all("cs install metals"),
    requires: "Coursier (cs)",
  },
  {
    id: "ruby",
    name: "Ruby",
    description: "ruby-lsp — Shopify's Ruby language server.",
    install: all("gem install ruby-lsp"),
    requires: "Ruby",
  },
  {
    id: "php",
    name: "PHP",
    description: "Intelephense — PHP code intelligence.",
    install: all("npm install -g intelephense"),
    requires: "Node.js",
  },
  {
    id: "lua",
    name: "Lua",
    description: "lua-language-server — from the LuaLS project.",
    install: {
      mac: "brew install lua-language-server",
      windows: "winget install LuaLS.lua-language-server",
      linux: {
        pacman: "sudo pacman -S lua-language-server",
        brew: "brew install lua-language-server",
      },
    },
    requires: "—",
  },
  {
    id: "swift",
    name: "Swift",
    description: "SourceKit-LSP — ships with the Swift toolchain.",
    install: { mac: "xcode-select --install" },
    requires: "Swift toolchain (swift.org) / Xcode",
  },
  {
    id: "zig",
    name: "Zig",
    description: "zls — the Zig language server.",
    install: {
      mac: "brew install zls",
      windows: "scoop install zls",
      linux: { pacman: "sudo pacman -S zls", brew: "brew install zls" },
    },
    requires: "—",
  },
  {
    id: "html",
    name: "HTML",
    description: "vscode-html-language-server (from vscode-langservers-extracted).",
    install: all("npm install -g vscode-langservers-extracted"),
    requires: "Node.js",
  },
  {
    id: "css",
    name: "CSS / SCSS / Less",
    description: "vscode-css-language-server (from vscode-langservers-extracted).",
    install: all("npm install -g vscode-langservers-extracted"),
    requires: "Node.js",
  },
  {
    id: "json",
    name: "JSON",
    description: "vscode-json-language-server (from vscode-langservers-extracted).",
    install: all("npm install -g vscode-langservers-extracted"),
    requires: "Node.js",
  },
  {
    id: "yaml",
    name: "YAML",
    description: "yaml-language-server — schema-aware YAML support.",
    install: all("npm install -g yaml-language-server"),
    requires: "Node.js",
  },
  {
    id: "vue",
    name: "Vue",
    description: "Vue language server (@vue/language-server).",
    install: all("npm install -g @vue/language-server"),
    requires: "Node.js",
  },
  {
    id: "svelte",
    name: "Svelte",
    description: "svelte-language-server.",
    install: all("npm install -g svelte-language-server"),
    requires: "Node.js",
  },
  {
    id: "solidity",
    name: "Solidity",
    description: "solidity-ls — language server for Solidity smart contracts.",
    install: all("npm install -g solidity-ls"),
    requires: "Node.js",
  },
  {
    id: "terraform",
    name: "Terraform",
    description: "terraform-ls — HashiCorp's official language server.",
    install: {
      mac: "brew install hashicorp/tap/terraform-ls",
      windows: "winget install HashiCorp.terraform-ls",
      linux: { brew: "brew install hashicorp/tap/terraform-ls" },
    },
    requires: "—",
  },
  {
    id: "toml",
    name: "TOML",
    description: "Taplo — TOML toolkit and language server.",
    install: {
      mac: "brew install taplo",
      windows: "cargo install taplo-cli --locked",
      // cargo is distro-agnostic; brew as an alternative where present.
      linux: {
        apt: "cargo install taplo-cli --locked",
        dnf: "cargo install taplo-cli --locked",
        pacman: "sudo pacman -S taplo-cli",
        zypper: "cargo install taplo-cli --locked",
        brew: "brew install taplo",
      },
    },
    requires: "Rust (cargo) or Homebrew",
  },
]

/**
 * Whether turning `id` on or off is invisible until the window is rebuilt.
 *
 * A language server is a running process; a grammar or a snippet set is
 * compiled into an editor when a file opens. A theme, a file-icon set and a
 * formatter are re-read live and say nothing.
 */
function noteReloadIfNeeded(id: string): void {
  void import("./marketplace").then(({ changeNeedsReload, useMarketplace }) => {
    const ext = useMarketplace.getState().byId(id)
    const needed = ext ? changeNeedsReload(ext.manifest) : LANG_SERVERS.some((s) => s.id === id)
    if (needed) useMarketplace.getState().noteReloadNeeded()
  })
}

interface ExtensionsState {
  /** Ids the user has disabled (persisted). Everything else is enabled. */
  disabled: string[]
  isEnabled: (id: string) => boolean
  toggle: (id: string, enabled: boolean) => void
}

export const useExtensions = create<ExtensionsState>()(
  persist(
    (set, get) => ({
      disabled: [],
      isEnabled: (id) => !get().disabled.includes(id),
      toggle: (id, enabled) => {
        log.info(enabled ? "extension enabled" : "extension disabled", { id })
        // Here, not at the call sites: there were three of them computing it
        // three different ways, and `settingsSync` restoring a bundle bypassed
        // all of them — you'd get the old highlighting with no explanation.
        noteReloadIfNeeded(id)
        set((s) => ({
          disabled: enabled
            ? s.disabled.filter((x) => x !== id)
            : s.disabled.includes(id)
              ? s.disabled
              : [...s.disabled, id],
        }))
      },
    }),
    { name: "reado.extensions" },
  ),
)

/**
 * Formatters, as manifests.
 *
 * Same shape and same rule as the language servers: the manifest carries the
 * name, the description and the install command, and the backend's allowlist —
 * keyed on `id` — decides what actually gets spawned. A formatter makes Reado
 * run a program, so it can never come from an open registry.
 */
export interface FormatterExt {
  /** Must match the Rust allowlist id (and the binary's name). */
  id: string
  name: string
  description: string
  install: Install
  requires?: string
  /** How the project is expected to declare it, shown when it doesn't. */
  declaredBy: string
}

export const FORMATTERS: FormatterExt[] = [
  {
    id: "biome",
    name: "Biome",
    description: "One fast formatter for JavaScript, TypeScript, JSON, CSS and GraphQL.",
    install: all("npm install --save-dev --save-exact @biomejs/biome"),
    requires: "Node.js",
    declaredBy: "biome.json, or @biomejs/biome in package.json",
  },
  {
    id: "prettier",
    name: "Prettier",
    description: "The web's default formatter — JS, TS, JSON, CSS, HTML, Markdown, YAML and more.",
    install: all("npm install --save-dev prettier"),
    requires: "Node.js",
    declaredBy: ".prettierrc, prettier.config.*, or prettier in package.json",
  },
  {
    id: "rustfmt",
    name: "rustfmt",
    description: "Rust's official formatter; ships with the toolchain.",
    install: all("rustup component add rustfmt"),
    requires: "rustup",
    declaredBy: "being installed — Rust has one formatter and nothing to disambiguate",
  },
  {
    id: "gofmt",
    name: "gofmt",
    description: "Go's official formatter; ships with the toolchain.",
    install: {
      mac: "brew install go",
      windows: "winget install GoLang.Go",
      linux: {
        apt: "sudo apt install golang-go",
        dnf: "sudo dnf install golang",
        pacman: "sudo pacman -S go",
        zypper: "sudo zypper install go",
        brew: "brew install go",
      },
    },
    requires: "Go toolchain",
    declaredBy: "being installed — Go has one formatter and nothing to disambiguate",
  },
  {
    id: "shfmt",
    name: "shfmt",
    description: "Shell script formatter.",
    install: {
      mac: "brew install shfmt",
      windows: "winget install mvdan.shfmt",
      linux: {
        apt: "sudo apt install shfmt",
        dnf: "sudo dnf install shfmt",
        pacman: "sudo pacman -S shfmt",
        zypper: "sudo zypper install shfmt",
        brew: "brew install shfmt",
      },
    },
    declaredBy: "being installed — shell has one conventional formatter",
  },
  {
    id: "ruff",
    name: "Ruff",
    description: "Fast Python formatter and linter.",
    install: all("pip install ruff"),
    requires: "Python (pip)",
    declaredBy: "ruff.toml, or [tool.ruff] in pyproject.toml",
  },
  {
    id: "black",
    name: "Black",
    description: "The uncompromising Python formatter.",
    install: all("pip install black"),
    requires: "Python (pip)",
    declaredBy: "[tool.black] in pyproject.toml",
  },
  {
    id: "rubocop",
    name: "RuboCop",
    description: "Ruby formatter and linter.",
    install: all("gem install rubocop"),
    requires: "Ruby (gem)",
    declaredBy: ".rubocop.yml, or rubocop in the Gemfile",
  },
]

/**
 * Password managers, as manifests.
 *
 * The browser pane can fill a login from the user's own vault, but only through
 * the vendor's CLI — a system webview has no extension host, so Bitwarden's and
 * 1Password's browser extensions cannot live in it. Someone running the desktop
 * app has no way to guess that, so the CLI is listed here like anything else
 * Reado can use: installed, it shows up among your extensions; missing, it is
 * one row and one install command away.
 *
 * Same rule as the rest of this file: the manifest names it, the Rust side
 * decides what may actually be spawned (`vault.rs` runs `op`/`bw` and nothing
 * else).
 */
export interface VaultExt {
  /** The binary's name, and what `vault.rs` looks for on the PATH. */
  id: "op" | "bw"
  name: string
  description: string
  install: Install
  requires?: string
}

export const VAULTS: VaultExt[] = [
  {
    id: "op",
    name: "1Password CLI",
    description:
      "Fill logins, one-time codes and new credentials in the browser pane from your 1Password vault.",
    install: {
      mac: "brew install 1password-cli",
      windows: "winget install AgileBits.1Password.CLI",
      linux: { brew: "brew install 1password-cli" },
    },
    requires: "the 1Password app, with Developer → “Integrate with 1Password CLI” turned on",
  },
  {
    id: "bw",
    name: "Bitwarden CLI",
    description:
      "Fill logins, one-time codes and new credentials in the browser pane from your Bitwarden vault.",
    install: {
      mac: "brew install bitwarden-cli",
      windows: "winget install Bitwarden.CLI",
      linux: "npm install -g @bitwarden/cli",
    },
    requires: "a Bitwarden account (`bw login`, then unlock from the pane)",
  },
]
