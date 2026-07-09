/**
 * Icon set for Reado's UI.
 *
 * The named UI glyphs are thin wrappers over Phosphor Icons, exported under the
 * names the rest of the app already imports — so the whole codebase keeps
 * working while the underlying set becomes consistent and complete. Brand marks
 * (Claude, Codex, Copilot, Gemini, OpenCode, Discord) have no Phosphor
 * equivalent and stay as inline SVG below.
 *
 * `FileIcon` renders a per-extension glyph for the file tree (Phosphor's File*
 * family), tinted by language colour in "colored" mode.
 */
import type { Icon, IconWeight } from "@phosphor-icons/react";
import {
  CaretRightIcon as CaretRight,
  TriangleIcon as Triangle,
  DeviceMobileIcon as DeviceMobile,
  ArrowsInLineVerticalIcon as ArrowsInLineVertical,
  PuzzlePieceIcon as PuzzlePiece,
  ArrowLineDownIcon as ArrowLineDown,
  ArrowLineUpIcon as ArrowLineUp,
  ArrowsClockwiseIcon as ArrowsClockwise,
  ArrowsDownUpIcon as ArrowsDownUp,
  ArchiveIcon as Archive,
  DotsThreeIcon as DotsThree,
  MagnifyingGlassIcon as MagnifyingGlass,
  GearSixIcon as GearSix,
  XIcon as X,
  FolderIcon as Folder,
  FolderOpenIcon as FolderOpen,
  GitBranchIcon as GitBranch,
  FilesIcon as Files,
  EyeIcon as Eye,
  EyeSlashIcon as EyeSlash,
  GitDiffIcon as GitDiff,
  PencilSimpleIcon as PencilSimple,
  LinkBreakIcon as LinkBreak,
  BookOpenIcon as BookOpen,
  GraphIcon as Graph,
  PaperPlaneTiltIcon as PaperPlaneTilt,
  TerminalIcon as Terminal,
  SparkleIcon as Sparkle,
  SignpostIcon as Signpost,
  SwapIcon as Swap,
  SquareSplitHorizontalIcon as SquareSplitHorizontal,
  LayoutIcon as Layout,
  PlusIcon as Plus,
  FingerprintIcon as Fingerprint,
  ListBulletsIcon as ListBullets,
  ClipboardTextIcon as ClipboardText,
  MinusIcon as Minus,
  CompassIcon as Compass,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  TreeStructureIcon as TreeStructure,
  BookmarkSimpleIcon as BookmarkSimple,
  WarningIcon as Warning,
  TrashIcon as Trash,
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  ChatCircleIcon as ChatCircle,
  ChartDonutIcon as ChartDonut,
  // File-tree glyphs
  FileIcon as File,
  FileCodeIcon as FileCode,
  FileTsIcon as FileTs,
  FileTsxIcon as FileTsx,
  FileJsIcon as FileJs,
  FileJsxIcon as FileJsx,
  FileCssIcon as FileCss,
  FileHtmlIcon as FileHtml,
  FilePyIcon as FilePy,
  FileCIcon as FileC,
  FileCppIcon as FileCpp,
  FileCSharpIcon as FileCSharp,
  FileRsIcon as FileRs,
  FileVueIcon as FileVue,
  FileSqlIcon as FileSql,
  FileMdIcon as FileMd,
  FileSvgIcon as FileSvg,
  FileCsvIcon as FileCsv,
  FileTxtIcon as FileTxt,
  FileIniIcon as FileIni,
  FilePngIcon as FilePng,
  FileJpgIcon as FileJpg,
  FileImageIcon as FileImage,
  FilePdfIcon as FilePdf,
  FileDocIcon as FileDoc,
  FileXlsIcon as FileXls,
  FilePptIcon as FilePpt,
  FileZipIcon as FileZip,
  FileAudioIcon as FileAudio,
  FileVideoIcon as FileVideo,
} from "@phosphor-icons/react";

type IconProps = { className?: string; weight?: IconWeight };

/**
 * Adapt a Phosphor icon to Reado's `{ className }` component shape, with our
 * defaults: 16px, regular weight, `currentColor`. A caller's Tailwind size
 * classes still win — CSS width/height overrides the SVG size attribute, and an
 * optional `weight` lets a call site render e.g. the active tool as duotone.
 */
const wrap = (P: Icon) => {
  const Wrapped = ({ className, weight = "regular" }: IconProps) => (
    <P size={16} weight={weight} className={className} aria-hidden="true" />
  );
  return Wrapped;
};

export const ChevronIcon = wrap(CaretRight);
export const DeltaIcon = wrap(Triangle);
export const DeviceIcon = wrap(DeviceMobile);
export const CollapseAllIcon = wrap(ArrowsInLineVertical);
export const ExtensionsIcon = wrap(PuzzlePiece);
export const PullIcon = wrap(ArrowLineDown);
export const PushIcon = wrap(ArrowLineUp);
export const FetchIcon = wrap(ArrowsClockwise);
export const SyncIcon = wrap(ArrowsDownUp);
export const StashIcon = wrap(Archive);
export const MoreIcon = wrap(DotsThree);
export const SearchIcon = wrap(MagnifyingGlass);
export const SettingsIcon = wrap(GearSix);
export const CloseIcon = wrap(X);
export const FolderOpenIcon = wrap(FolderOpen);
export const GitBranchIcon = wrap(GitBranch);
export const FilesIcon = wrap(Files);
export const EyeIcon = wrap(Eye);
export const EyeOffIcon = wrap(EyeSlash);
export const DiffIcon = wrap(GitDiff);
export const EditIcon = wrap(PencilSimple);
export const UnlinkIcon = wrap(LinkBreak);
export const DocsIcon = wrap(BookOpen);
export const GraphIcon = wrap(Graph);
export const SendIcon = wrap(PaperPlaneTilt);
export const TerminalIcon = wrap(Terminal);
export const SparkleIcon = wrap(Sparkle);
export const RouteIcon = wrap(Signpost);
export const SwapIcon = wrap(Swap);
export const SplitIcon = wrap(SquareSplitHorizontal);
export const LayoutIcon = wrap(Layout);
export const PlusIcon = wrap(Plus);
export const BlameIcon = wrap(Fingerprint);
export const OutlineIcon = wrap(ListBullets);
export const CoverageIcon = wrap(ChartDonut);
export const SpecsIcon = wrap(ClipboardText);
export const MinusIcon = wrap(Minus);
export const TourIcon = wrap(Compass);
export const TimelineIcon = wrap(ClockCounterClockwise);
export const HierarchyIcon = wrap(TreeStructure);
export const BookmarkIcon = wrap(BookmarkSimple);
export const ProblemsIcon = wrap(Warning);
export const TrashIcon = wrap(Trash);
export const DiscardIcon = wrap(ArrowCounterClockwise);
export const MessageIcon = wrap(ChatCircle);

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

/** Google Gemini spark — self-coloured with Gemini's own brand gradient (the
 *  logo IS a gradient), so it renders correctly regardless of theme. */
export const GeminiIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" width={16} height={16} className={className} aria-hidden="true">
    <defs>
      <linearGradient id="reado-gemini" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#439DDF" />
        <stop offset="0.524" stopColor="#4F87ED" />
        <stop offset="0.781" stopColor="#9476C5" />
        <stop offset="0.888" stopColor="#BC688E" />
        <stop offset="1" stopColor="#D6645D" />
      </linearGradient>
    </defs>
    <path
      fill="url(#reado-gemini)"
      d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
    />
  </svg>
);

/** OpenCode block mark. Filled via currentColor (brand grey applied by caller). */
export const OpenCodeIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" />
  </svg>
);

export const DiscordIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9459 2.4189-2.1568 2.4189Z" />
  </svg>
);

/** Language/type colours keyed by file extension (GitHub-linguist palette), for
 *  the "colored" file-icon mode. Unknown types fall back to the neutral faint. */
const FILE_COLORS: Record<string, string> = {
  ts: "#3178C6", tsx: "#3178C6", mts: "#3178C6", cts: "#3178C6",
  js: "#F1E05A", jsx: "#F1E05A", mjs: "#F1E05A", cjs: "#F1E05A",
  rs: "#DEA584", py: "#3572A5", go: "#00ADD8", rb: "#701516",
  java: "#B07219", kt: "#A97BFF", kts: "#A97BFF", scala: "#C22D40",
  swift: "#F05138", c: "#555555", h: "#555555", cpp: "#F34B7D",
  cc: "#F34B7D", hpp: "#F34B7D", cs: "#178600", php: "#4F5D95",
  json: "#CBCB41", jsonc: "#CBCB41", yaml: "#CB171E", yml: "#CB171E",
  toml: "#9C4221", md: "#419BFF", markdown: "#419BFF", mdx: "#419BFF",
  html: "#E34C26", htm: "#E34C26", css: "#563D7C", scss: "#C6538C",
  sass: "#C6538C", less: "#1D365D", sh: "#89E051", bash: "#89E051",
  zsh: "#89E051", vue: "#41B883", svelte: "#FF3E00", sql: "#E38C00",
  lua: "#4A6FB3", dart: "#00B4AB", ex: "#6E4A7E", exs: "#6E4A7E",
  zig: "#EC915C", nim: "#FFC200", clj: "#5881D8", hs: "#5E5086",
  ml: "#EC6813", vim: "#199F4B", r: "#198CE7", pl: "#0298C3",
  proto: "#7E7E7E", graphql: "#E10098", tf: "#844FBA", svg: "#FFB13B",
  png: "#A074C4", jpg: "#A074C4", jpeg: "#A074C4", gif: "#A074C4",
  webp: "#A074C4", pdf: "#E34C26", zip: "#E8A33D",
};

/** File extension → Phosphor glyph. Unknown extensions fall back to a generic
 *  code-file glyph — reasonable for a code IDE. */
const FILE_GLYPHS: Record<string, Icon> = {
  ts: FileTs, mts: FileTs, cts: FileTs,
  tsx: FileTsx,
  js: FileJs, mjs: FileJs, cjs: FileJs,
  jsx: FileJsx,
  css: FileCss, scss: FileCss, sass: FileCss, less: FileCss,
  html: FileHtml, htm: FileHtml,
  py: FilePy,
  c: FileC, h: FileC,
  cpp: FileCpp, cc: FileCpp, cxx: FileCpp, hpp: FileCpp, hh: FileCpp,
  cs: FileCSharp,
  rs: FileRs,
  vue: FileVue,
  sql: FileSql,
  md: FileMd, markdown: FileMd, mdx: FileMd,
  svg: FileSvg,
  csv: FileCsv,
  txt: FileTxt,
  ini: FileIni, cfg: FileIni, conf: FileIni,
  json: FileCode, jsonc: FileCode, yaml: FileCode, yml: FileCode, toml: FileCode,
  png: FilePng,
  jpg: FileJpg, jpeg: FileJpg,
  gif: FileImage, webp: FileImage, bmp: FileImage, ico: FileImage, avif: FileImage,
  pdf: FilePdf,
  doc: FileDoc, docx: FileDoc,
  xls: FileXls, xlsx: FileXls,
  ppt: FilePpt, pptx: FilePpt,
  zip: FileZip, tar: FileZip, gz: FileZip, tgz: FileZip, rar: FileZip, "7z": FileZip,
  mp3: FileAudio, wav: FileAudio, flac: FileAudio, ogg: FileAudio, m4a: FileAudio,
  mp4: FileVideo, mov: FileVideo, webm: FileVideo, mkv: FileVideo, avi: FileVideo,
};

const extOf = (name?: string) => name?.split(".").pop()?.toLowerCase() ?? "";

/** How the file tree renders type glyphs: generic, per-type mono, or tinted. */
export type FileIconMode = "off" | "mono" | "colored";

/** A folder or file glyph for the tree. Folders open when expanded; files show
 *  a per-extension glyph (unless mode is "off"), tinted in "colored" mode. */
export const FileIcon = ({
  isDir,
  expanded,
  mode = "colored",
  name,
  className,
}: IconProps & {
  isDir: boolean;
  expanded?: boolean;
  mode?: FileIconMode;
  name?: string;
}) => {
  if (isDir) {
    const F = expanded ? FolderOpen : Folder;
    return (
      <F
        size={15}
        weight={expanded ? "fill" : "regular"}
        color="var(--accent)"
        className={className}
        style={{ flex: "none" }}
        aria-hidden="true"
      />
    );
  }
  const ext = extOf(name);
  const Glyph = mode === "off" ? File : (FILE_GLYPHS[ext] ?? FileCode);
  const color = mode === "colored" ? (FILE_COLORS[ext] ?? "var(--text-faint)") : "var(--text-faint)";
  return (
    <Glyph
      size={15}
      weight="regular"
      color={color}
      className={className}
      style={{ flex: "none" }}
      aria-hidden="true"
    />
  );
};
