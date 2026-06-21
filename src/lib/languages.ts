/**
 * CodeMirror language list: the bundled `@codemirror/language-data` set plus a
 * few packs it doesn't ship. Languages load lazily on first match, so adding one
 * here costs nothing until a matching file is opened.
 */
import { LanguageDescription } from "@codemirror/language";
import { languages as cmLanguages } from "@codemirror/language-data";

const extra: LanguageDescription[] = [
  LanguageDescription.of({
    name: "Solidity",
    extensions: ["sol"],
    load: () => import("@replit/codemirror-lang-solidity").then((m) => m.solidity),
  }),
];

export const languages = [...cmLanguages, ...extra];
