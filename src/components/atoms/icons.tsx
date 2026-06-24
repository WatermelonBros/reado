/**
 * Inline SVG icons (stroke style, currentColor).
 *
 * Kept as a tiny local set rather than an icon dependency — Reado needs only a
 * handful, and inline SVG keeps them themeable via `currentColor`.
 */
type IconProps = { className?: string };

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const ChevronIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const CollapseAllIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M7 5l5 5 5-5M7 19l5-5 5 5" />
  </svg>
);

export const ExtensionsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
  </svg>
);

export const PullIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M12 3v11M8 10l4 4 4-4M5 21h14" />
  </svg>
);

export const PushIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M12 21V10M8 14l4-4 4 4M5 3h14" />
  </svg>
);

export const FetchIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v4h-4" />
  </svg>
);

export const StashIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M3 7h18v5H3zM3 12v7h18v-7M9 15h6" />
  </svg>
);

export const MoreIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export const SettingsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const CloseIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const FolderOpenIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1" />
    <path d="M3 8h17.5a1 1 0 0 1 .97 1.24l-1.5 7A1 1 0 0 1 19 17H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const GitBranchIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="8" r="2.5" />
    <path d="M6 8.5v7M18 10.5c0 4-6 2-6 5.5" />
  </svg>
);

export const FilesIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.4.6L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const EyeIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13 13 0 0 1-2.16 2.86M6.6 6.6A13 13 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 4.4-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </svg>
);

export const DiffIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M5 3v14M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 6H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H12M12 4v4M12 14v4" />
  </svg>
);

export const EditIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

export const UnlinkIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 3.5 8.54M8 12h3M2 2l20 20" />
  </svg>
);

export const DocsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M14 3v5h5M8 13h8M8 17h6" />
  </svg>
);

export const GraphIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <circle cx="5" cy="6" r="2.2" />
    <circle cx="18" cy="5" r="2.2" />
    <circle cx="12" cy="18" r="2.2" />
    <path d="M7 7l4 9M16.5 6.8 13 16M7 6.4 16 5.2" />
  </svg>
);

export const SendIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);

export const TerminalIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M4 17l6-5-6-5M12 19h8" />
  </svg>
);

/** A single sparkle — the neutral "ask AI" glyph (used for Audit). */
export const SparkleIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M12 4l1.7 4.8L18.5 10.5l-4.8 1.7L12 17l-1.7-4.8L5.5 10.5l4.8-1.7z" />
  </svg>
);

/** Two-way arrows — swap the split panes. */
export const SwapIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M17 4l3 3-3 3M20 7H8M7 20l-3-3 3-3M4 17h12" />
  </svg>
);

/** Split glyph: a frame divided evenly in two (add/arrange a second pane). */
export const SplitIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </svg>
);

/** Panel-dock glyph: a frame with a split-off side panel. */
export const LayoutIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const BlameIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const OutlineIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M4 6h4M4 12h4M4 18h4" />
    <path d="M11 6h9M11 12h9M11 18h9" opacity="0.55" />
  </svg>
);

export const SpecsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <rect x="5" y="5" width="14" height="16" rx="2" />
    <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    <path d="M8.5 12l1.4 1.4 2.6-3" />
    <path d="M14.5 12.5H16M8.5 17h7" />
  </svg>
);

export const MinusIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
);

export const ProblemsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

export const DiscardIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M3 7v6h6" />
    <path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7" />
  </svg>
);

export const MessageIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-9 8.3 8.5 8.5 0 0 1-3.8-.9L3 20l1.1-3.3A8.38 8.38 0 0 1 12 3.5a8.38 8.38 0 0 1 9 8z" />
  </svg>
);

/** Claude's official mark. Filled via currentColor. */
export const ClaudeIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
  </svg>
);

/** OpenAI Codex blossom mark. Filled via currentColor. */
export const CodexIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
);

/** GitHub Copilot's official mark. Filled via currentColor. */
export const CopilotIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" />
  </svg>
);

const folderPath =
  "M3 7a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.4.6L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const filePath =
  "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5";

/** A folder or file glyph. The folder differs subtly when expanded. */
export const FileIcon = ({
  isDir,
  expanded,
  className,
}: IconProps & { isDir: boolean; expanded?: boolean; name?: string }) => (
  <svg
    {...base}
    width={15}
    height={15}
    className={className}
    style={{ color: isDir ? "var(--accent)" : "var(--text-faint)", flex: "none" }}
    aria-hidden="true"
  >
    {isDir ? (
      <path d={folderPath} fillOpacity={expanded ? 0.12 : 0} fill="currentColor" />
    ) : (
      <path d={filePath} />
    )}
  </svg>
);
