/**
 * First-comment prompt: offer to add `.reado/` to the project `.gitignore`.
 *
 * Reado defaults to keeping comments local (not committed). The prompt appears
 * once, after the first comment creates `.reado/`, and honours a "don't ask
 * again" choice persisted in settings.
 */
import { useState } from "react";
import { addReadoGitignore } from "../../lib/api";
import { useComments } from "../../lib/comments";
import { useProject, useSettings } from "../../lib/store";

import { Modal } from "../atoms/Modal";
import { Button } from "../atoms/Button";
import { Checkbox } from "../atoms/Checkbox";
import { useTranslation } from "react-i18next";

export function GitignorePrompt() {
  const open = useComments((s) => s.gitignorePromptOpen);
  const setOpen = useComments((s) => s.setGitignorePrompt);
  const root = useProject((s) => s.root);
  const { versionReado, set } = useSettings();
  const [dontAsk, setDontAsk] = useState(false);
  const { t } = useTranslation();

  const close = () => {
    if (dontAsk) set({ gitignoreDontAsk: true });
    setOpen(false);
  };

  const add = async () => {
    await addReadoGitignore(root, versionReado).catch(() => {});
    close();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      ariaLabel={t("gitignore.title")}
      className="w-[min(440px,92vw)] p-5"
    >
      <h2 className="m-0 text-lg font-semibold">{t("gitignore.title")}</h2>
      <p className="mt-2 mb-4 text-sm text-muted">{t("gitignore.body")}</p>

      <Checkbox
        checked={dontAsk}
        onChange={setDontAsk}
        label={t("gitignore.dontAsk")}
        className="mb-4 text-sm text-muted"
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {t("gitignore.keep")}
        </Button>
        <Button variant="primary" onClick={add}>
          {t("gitignore.add")}
        </Button>
      </div>
    </Modal>
  );
}
