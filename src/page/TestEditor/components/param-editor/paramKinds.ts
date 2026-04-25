import { detectFileType } from "@/models/commandTable"

export type ParamKindId =
  | "armsparam"
  | "bulletparam"
  | "characterparam"
  | "chrsysparam"
  | "grapparam"
  | "hitgroupiddef"
  | "interactionid"
  | "projectile_depiction_table"
  | "speedparam"
  | "effect_project_named"
  | "vernier_table_named"

export type ParamKindRow =
  | {
      id: Exclude<ParamKindId, "chrsysparam" | "effect_project_named" | "vernier_table_named">
      label: string
      pathKey: string
      mode: "typed"
      fileType: string
    }
  | {
      id: "chrsysparam"
      label: string
      pathKey: string
      mode: "chrsys"
    }
  | {
      id: "effect_project_named"
      label: string
      pathKey: string
      mode: "typed"
      nameMustResolveTo: "effect_project"
    }
  | {
      id: "vernier_table_named"
      label: string
      pathKey: string
      mode: "typed"
      nameMustResolveTo: "vernier_table"
    }

export const PARAM_KINDS: ParamKindRow[] = [
  { id: "armsparam", label: "Arms param", pathKey: "paramEditor.v2.fp.armsparam", mode: "typed", fileType: "armsparam" },
  { id: "bulletparam", label: "Bullet param", pathKey: "paramEditor.v2.fp.bulletparam", mode: "typed", fileType: "bulletparam" },
  { id: "characterparam", label: "Character param", pathKey: "paramEditor.v2.fp.characterparam", mode: "typed", fileType: "characterparam" },
  { id: "chrsysparam", label: "Chr sys param", pathKey: "paramEditor.v2.fp.chrsysparam", mode: "chrsys" },
  { id: "grapparam", label: "Grap param", pathKey: "paramEditor.v2.fp.grapparam", mode: "typed", fileType: "grapparam" },
  { id: "hitgroupiddef", label: "Hit group ID def", pathKey: "paramEditor.v2.fp.hitgroupiddef", mode: "typed", fileType: "hitgroupiddef" },
  { id: "interactionid", label: "Interaction ID", pathKey: "paramEditor.v2.fp.interactionid", mode: "typed", fileType: "interactionid" },
  { id: "projectile_depiction_table", label: "Projectile depiction table", pathKey: "paramEditor.v2.fp.projectile_depiction_table", mode: "typed", fileType: "projectile_depiction_table" },
  { id: "speedparam", label: "Speed param", pathKey: "paramEditor.v2.fp.speedparam", mode: "typed", fileType: "speedparam" },
  {
    id: "effect_project_named",
    label: "Effect project (e.g. effect_project_*.bin)",
    pathKey: "paramEditor.v2.fp.effect_project_named",
    mode: "typed",
    nameMustResolveTo: "effect_project",
  },
  {
    id: "vernier_table_named",
    label: "Vernier table (e.g. vernier_table_*.bin)",
    pathKey: "paramEditor.v2.fp.vernier_table_named",
    mode: "typed",
    nameMustResolveTo: "vernier_table",
  },
]

export function getParamKind(id: string): ParamKindRow | undefined {
  return PARAM_KINDS.find((k) => k.id === id)
}

function fileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? filePath
}

export function resolveTypedFileTypeForPath(row: ParamKindRow, filePath: string): string {
  if (row.mode !== "typed") {
    throw new Error("Not a typed-param kind")
  }
  if ("fileType" in row && row.fileType) {
    return row.fileType
  }
  if ("nameMustResolveTo" in row) {
    const t = detectFileType(fileNameFromPath(filePath))
    if (t !== row.nameMustResolveTo) {
      throw new Error(`File name must resolve to format "${row.nameMustResolveTo}" (use path containing that substring), got "${t}"`)
    }
    return t
  }
  throw new Error("Invalid param kind")
}
