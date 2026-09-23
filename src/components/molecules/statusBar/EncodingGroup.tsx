import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Dropdown, MenuLabel, MenuRow } from "@/components/atoms/Dropdown"
import { listEncodings } from "@/lib/api"
import { reopenWithEncoding, setEncoding, useDocInfo } from "@/lib/docInfo"
import { notify } from "@/lib/notice"
import { ITEM, type StatusItemProps } from "./shared"

/** The file's charset: re-read it with another, or pick what the next save writes. */
export function EncodingGroup({ rel }: StatusItemProps) {
  const encoding = useDocInfo((s) => s.encoding)
  const { t } = useTranslation()
  // The list comes from the backend so the menu and the decoder can't disagree
  // about what Reado supports.
  const [encodings, setEncodings] = useState<string[]>([])
  useEffect(() => {
    listEncodings()
      .then(setEncodings)
      .catch(() => setEncodings([]))
  }, [])
  if (!rel) return null
  return (
    <Dropdown
      label={t("status.encoding")}
      triggerClassName={ITEM}
      trigger={encoding}
      className="max-h-72 w-56 overflow-y-auto"
    >
      {/* Two different acts, not one: re-decoding the bytes you have,
          and choosing what the next save writes. Merging them would
          silently rewrite a file you only wanted to look at. */}
      <MenuLabel>{t("status.reopenWith")}</MenuLabel>
      {encodings.map((name) => (
        <MenuRow
          key={`r:${name}`}
          value={`r:${name}`}
          label={name}
          checked={name === encoding}
          onClick={() => void reopenWithEncoding(name)}
        />
      ))}
      <MenuLabel>{t("status.saveWith")}</MenuLabel>
      {encodings.map((name) => (
        <MenuRow
          key={`s:${name}`}
          value={`s:${name}`}
          label={name}
          onClick={() => {
            const view = useDocInfo.getState().view
            if (!view) return
            setEncoding(view, name)
            notify("info", t("status.encodingSaveSet", { name }))
          }}
        />
      ))}
    </Dropdown>
  )
}
