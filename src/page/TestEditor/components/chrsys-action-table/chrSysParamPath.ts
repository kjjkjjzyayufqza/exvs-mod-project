const CHRSYSPARAM_FILE_NAME = "chrsysparam.csyspm"
const MSC_ROUTE_PREFIX = "040msc"
const PARAM_ROUTE_PREFIX = "041cpm"
/** Unit folders are sometimes suffixed per route, e.g. `<unit>_msc` next to a plain `<unit>` param folder. */
const UNIT_FOLDER_SUFFIXES = ["_msc"]

function splitPath(path: string): string[] {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").split("/")
}

function joinPath(segments: string[], useBackslash: boolean): string {
  return segments.join(useBackslash ? "\\" : "/")
}

function unitFolderNames(unitFolder: string): string[] {
  const names = [unitFolder]
  for (const suffix of UNIT_FOLDER_SUFFIXES) {
    if (unitFolder.length > suffix.length && unitFolder.endsWith(suffix)) {
      names.push(unitFolder.slice(0, -suffix.length))
    }
  }
  return names
}

/**
 * Candidate `chrsysparam.csyspm` paths for a unit MSC folder, most likely first. The unit MSC
 * folder `<root>/040msc/<unit>` is paired with `<root>/041cpm/<unit>`; the param route root is
 * passed in when the workspace knows it, otherwise the sibling prefix is swapped. Returns an
 * empty list when the folder does not look like a unit route folder at all.
 */
export function resolveChrSysParamCandidates(
  mscFolderPath: string,
  paramRouteRoot?: string | null,
): string[] {
  const trimmed = mscFolderPath.trim()
  if (!trimmed) return []
  const segments = splitPath(trimmed)
  const unitFolder = segments[segments.length - 1]
  if (!unitFolder) return []
  const names = unitFolderNames(unitFolder)

  const root = paramRouteRoot?.trim()
  if (root) {
    const rootSegments = splitPath(root)
    const useBackslash = root.includes("\\")
    return names.map((name) => joinPath([...rootSegments, name, CHRSYSPARAM_FILE_NAME], useBackslash))
  }

  const parentIndex = segments.length - 2
  if (segments[parentIndex] !== MSC_ROUTE_PREFIX) return []
  const useBackslash = trimmed.includes("\\")
  return names.map((name) => {
    const swapped = [...segments]
    swapped[parentIndex] = PARAM_ROUTE_PREFIX
    swapped[segments.length - 1] = name
    return joinPath([...swapped, CHRSYSPARAM_FILE_NAME], useBackslash)
  })
}

export { CHRSYSPARAM_FILE_NAME }
