/**
 * Declarative extensions (Phase 1: language servers).
 *
 * Each entry is a manifest, not code: metadata + how to install the server, per
 * OS. The actual binary that gets spawned is chosen by the Rust allowlist keyed
 * on `id` (so a manifest can't make Reado run an arbitrary command). The
 * marketplace reads this list; `useExtensions` persists which are disabled.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OS = "mac" | "linux" | "windows";

/** The current platform, from the webview's user agent (no extra capability). */
export function currentOS(): OS {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return "linux";
}

export type LinuxPm = "apt" | "dnf" | "pacman" | "zypper" | "brew";

/** Install command per OS. `linux` may be a single string (a distro-agnostic
 * installer like npm/cargo/brew) or a per-package-manager map for system
 * packages that differ by distro. An OS/manager may be omitted when there's no
 * clean one-liner (the marketplace then shows "manual" + the prerequisite). */
interface Install {
  mac?: string;
  windows?: string;
  linux?: string | Partial<Record<LinuxPm, string>>;
}

/** Same command on every OS (npm/rustup/go/dotnet/gem/coursier are portable). */
const all = (cmd: string): Install => ({ mac: cmd, linux: cmd, windows: cmd });

/** The install command for the current OS (and Linux package manager), or
 * undefined when none is configured (→ manual install). */
export function installCmd(
  ext: LangServerExt,
  os: OS,
  linuxPm: LinuxPm | null,
): string | undefined {
  if (os !== "linux") return ext.install[os];
  const l = ext.install.linux;
  if (typeof l === "string") return l;
  return l && linuxPm ? l[linuxPm] : undefined;
}

export interface LangServerExt {
  /** Must match the Rust `server_command` id and the LSP `SERVERS` id. */
  id: string;
  name: string;
  description: string;
  /** How to install the server, per OS. */
  install: Install;
  /** Prerequisite toolchain, shown up front (e.g. "Node.js"). */
  requires?: string;
}

export const LANG_SERVERS: LangServerExt[] = [
  {
    id: "typescript",
    name: "TypeScript / JavaScript / React",
    description:
      "typescript-language-server — types, diagnostics and navigation for TS, JS, and React (JSX/TSX).",
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
      linux: { apt: "cargo install taplo-cli --locked", dnf: "cargo install taplo-cli --locked", pacman: "sudo pacman -S taplo-cli", zypper: "cargo install taplo-cli --locked", brew: "brew install taplo" },
    },
    requires: "Rust (cargo) or Homebrew",
  },
];

interface ExtensionsState {
  /** Ids the user has disabled (persisted). Everything else is enabled. */
  disabled: string[];
  isEnabled: (id: string) => boolean;
  toggle: (id: string, enabled: boolean) => void;
}

export const useExtensions = create<ExtensionsState>()(
  persist(
    (set, get) => ({
      disabled: [],
      isEnabled: (id) => !get().disabled.includes(id),
      toggle: (id, enabled) =>
        set((s) => ({
          disabled: enabled
            ? s.disabled.filter((x) => x !== id)
            : s.disabled.includes(id)
              ? s.disabled
              : [...s.disabled, id],
        })),
    }),
    { name: "reado.extensions" },
  ),
);
