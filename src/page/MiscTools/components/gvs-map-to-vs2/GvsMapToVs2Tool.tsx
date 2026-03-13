import { useMemo, useState, useTransition } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { exists, mkdir, readDir, readFile, readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { basename, dirname, join, resourceDir } from "@tauri-apps/api/path"
import { Command } from "@tauri-apps/plugin-shell"
import JsonView from "@uiw/react-json-view"
import { vscodeTheme } from "@uiw/react-json-view/vscode"
import { Loader2, FileJson2, FolderOpen, ListTree, RefreshCcw, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { useConfigStore } from "@/store/configStore"
import { repackFolderUsingStructureToDir } from "@/utils/repackRunner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { createGvsMapToVs2Package, extractOnlyGraphicParamFile, type GvsMapToVs2OutputMeta } from "./gvsMapToVs2Service"

type ConvertRecord = {
  sourceType: "bin" | "folder"
  inputPath: string
  status: "pending" | "running" | "success" | "failed"
  numatbStatus: "idle" | "fixing" | "fixed" | "no_numatb" | "fix_failed"
  packStatus: "idle" | "packing" | "packed" | "pack_failed"
  outputFolderPath: string
  outputJsonPath: string
  packedFilePath: string
  fileName: string
  fileCount: number
  fixedNumatbFiles: string[]
  failedNumatbFiles: Array<{ name: string; reason: string }>
  errorMessage?: string
  numatbErrorMessage?: string
  packErrorMessage?: string
}

export function GvsMapToVs2Tool() {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedBinPaths, setSelectedBinPaths] = useState<string[]>([])
  const [outputDir, setOutputDir] = useState("")
  const [isConverting, setIsConverting] = useState(false)
  const [isDebugGraphicParamExtracting, setIsDebugGraphicParamExtracting] = useState(false)
  const [isFixingNumatb, setIsFixingNumatb] = useState(false)
  const [isPacking, setIsPacking] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [isStep21DialogOpen, setIsStep21DialogOpen] = useState(false)
  const [isScanningGraphicParam, setIsScanningGraphicParam] = useState(false)
  const [graphicParamLogText, setGraphicParamLogText] = useState("")
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFile: "" })
  const [records, setRecords] = useState<ConvertRecord[]>([])
  const [selectedJsonPath, setSelectedJsonPath] = useState<string>("")
  const [selectedJsonData, setSelectedJsonData] = useState<GvsMapToVs2OutputMeta | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { obModPath, getSetting } = useConfigStore()

  const canRunStep1 = selectedBinPaths.length > 0 && outputDir.trim().length > 0 && !isConverting && !isDebugGraphicParamExtracting && !isFixingNumatb && !isPacking
  const canRunDebugGraphicParam = selectedBinPaths.length > 0 && outputDir.trim().length > 0 && !isConverting && !isDebugGraphicParamExtracting && !isFixingNumatb && !isPacking
  const canRunStep2 = records.some((item) => item.status === "success") && !isConverting && !isDebugGraphicParamExtracting && !isFixingNumatb && !isPacking
  const canRunStep21 = records.some((item) => item.status === "success") && !isConverting && !isDebugGraphicParamExtracting && !isFixingNumatb && !isPacking
  const canRunStep3 =
    records.some(
      (item) =>
        item.status === "success" &&
        item.outputJsonPath.trim().length > 0 &&
        (item.numatbStatus === "fixed" ||
          item.numatbStatus === "no_numatb" ||
          item.numatbStatus === "idle")
    ) &&
    !isConverting &&
    !isDebugGraphicParamExtracting &&
    !isFixingNumatb &&
    !isPacking
  const successCount = useMemo(
    () => records.filter((item) => item.status === "success").length,
    [records]
  )
  const progressPercent = useMemo(() => {
    if (progress.total === 0) {
      return 0
    }
    return Math.min(100, Math.round((progress.current / progress.total) * 100))
  }, [progress.current, progress.total])

  const getObModBinName = (sourceBinName: string): string => {
    const raw = sourceBinName.replace(/\.bin$/i, "").replace(/^0x/i, "")
    return `0x${raw.toUpperCase()}.bin`
  }

  const containsAsciiKeyword = (data: Uint8Array, keyword: string): boolean => {
    const keywordBytes = new TextEncoder().encode(keyword)
    if (keywordBytes.length === 0 || data.length < keywordBytes.length) {
      return false
    }
    for (let i = 0; i <= data.length - keywordBytes.length; i++) {
      let allMatch = true
      for (let j = 0; j < keywordBytes.length; j++) {
        if (data[i + j] !== keywordBytes[j]) {
          allMatch = false
          break
        }
      }
      if (allMatch) {
        return true
      }
    }
    return false
  }

  const runGraphicParamScan = async () => {
    const targets = records.filter((item) => item.status === "success")
    if (targets.length === 0) {
      setGraphicParamLogText("")
      toast.error("No successful folders available to scan")
      return
    }

    setIsScanningGraphicParam(true)
    const lines: string[] = []
    for (const target of targets) {
      const entries = await readDir(target.outputFolderPath)
      const fileEntries = entries.filter((entry) => entry.isFile)
      let foundPath = ""

      for (const entry of fileEntries) {
        const entryName = entry.name ?? ""
        const filePath = await join(target.outputFolderPath, entryName)
        const content = await readFile(filePath)
        if (containsAsciiKeyword(content, "directional_lighting")) {
          foundPath = filePath
          break
        }
      }

      if (foundPath) {
        lines.push(foundPath)
      } else {
        lines.push(`[NOT_FOUND] ${target.outputFolderPath}`)
      }
    }

    setGraphicParamLogText(lines.join("\n"))
    setIsScanningGraphicParam(false)
  }

  const handleOpenStep21Dialog = () => {
    setIsStep21DialogOpen(true)
    void runGraphicParamScan().catch((error) => {
      setIsScanningGraphicParam(false)
      toast.error(error instanceof Error ? error.message : "Failed to scan graphic_param files")
    })
  }

  const handleCopyGraphicParamLog = async () => {
    if (!graphicParamLogText.trim()) {
      toast.error("No scan content to copy")
      return
    }
    await navigator.clipboard.writeText(graphicParamLogText)
    toast.success("Copied graphic_param file list")
  }

  const handleSelectBinFiles = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: true,
        filters: [
          {
            name: "GVS BIN Files",
            extensions: ["bin"],
          },
        ],
      })

      if (!selected) {
        return
      }

      const selectedPaths = Array.isArray(selected) ? selected : [selected]
      const selectedRecords: ConvertRecord[] = []
      for (const selectedPath of selectedPaths) {
        const fileName = await basename(selectedPath)
        selectedRecords.push({
          sourceType: "bin",
          inputPath: selectedPath,
          status: "pending",
          numatbStatus: "idle",
          packStatus: "idle",
          outputFolderPath: "",
          outputJsonPath: "",
          packedFilePath: "",
          fileName,
          fileCount: 0,
          fixedNumatbFiles: [],
          failedNumatbFiles: [],
        })
      }

      startTransition(() => {
        setSelectedBinPaths(selectedPaths)
        setRecords(selectedRecords)
        setSelectedJsonPath("")
        setSelectedJsonData(null)
      })
    } catch (error) {
      console.error("Failed to select .bin files", error)
      toast.error("Failed to select .bin files")
    }
  }

  const handleSelectStep2Folders = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: true,
      })

      if (!selected) {
        return
      }

      const selectedFolders = Array.isArray(selected) ? selected : [selected]
      const folderRecords: ConvertRecord[] = []
      for (const folderPath of selectedFolders) {
        const folderName = await basename(folderPath)
        const parentDir = await dirname(folderPath)
        const structureJsonPath = await join(parentDir, `${folderName}.json`)
        const hasStructureJson = await exists(structureJsonPath)

        folderRecords.push({
          sourceType: "folder",
          inputPath: folderPath,
          status: "success",
          numatbStatus: "idle",
          packStatus: "idle",
          outputFolderPath: folderPath,
          outputJsonPath: hasStructureJson ? structureJsonPath : "",
          packedFilePath: "",
          fileName: `${folderName}.bin`,
          fileCount: 0,
          fixedNumatbFiles: [],
          failedNumatbFiles: [],
          errorMessage: hasStructureJson ? undefined : "Missing structure json beside selected folder",
        })
      }

      startTransition(() => {
        setSelectedBinPaths([])
        setRecords(folderRecords)
        setSelectedJsonPath("")
        setSelectedJsonData(null)
      })
    } catch (error) {
      console.error("Failed to select Step2 folders", error)
      toast.error("Failed to select Step2 folders")
    }
  }

  const handleSelectOutputDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      })
      if (!selected || Array.isArray(selected)) {
        return
      }
      setOutputDir(selected)
    } catch (error) {
      console.error("Failed to select output directory", error)
      toast.error("Failed to select output directory")
    }
  }

  const handleLoadDetail = async (jsonPath: string) => {
    setIsLoadingDetail(true)
    try {
      const raw = await readTextFile(jsonPath)
      const parsed = JSON.parse(raw) as GvsMapToVs2OutputMeta
      startTransition(() => {
        setSelectedJsonPath(jsonPath)
        setSelectedJsonData(parsed)
      })
    } catch (error) {
      console.error(`Failed to load detail: ${jsonPath}`, error)
      toast.error(`Failed to load detail: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const handleStep1ExtractAndGenerateJson = async () => {
    if (!canRunStep1) {
      return
    }

    setIsConverting(true)
    setProgress({ current: 0, total: selectedBinPaths.length, currentFile: "" })
    startTransition(() => {
      setRecords((prev) =>
        prev.map((item) => ({
          ...item,
          status: "pending",
          numatbStatus: "idle",
          packStatus: "idle",
          outputFolderPath: "",
          outputJsonPath: "",
          packedFilePath: "",
          fileCount: 0,
          fixedNumatbFiles: [],
          failedNumatbFiles: [],
          errorMessage: undefined,
          numatbErrorMessage: undefined,
          packErrorMessage: undefined,
        }))
      )
      setSelectedJsonPath("")
      setSelectedJsonData(null)
    })

    let okCount = 0
    let failCount = 0
    for (let i = 0; i < selectedBinPaths.length; i++) {
      const binPath = selectedBinPaths[i]
      const currentRecord = records.find((item) => item.inputPath === binPath)
      const currentFileName = currentRecord?.fileName ?? (await basename(binPath))
      setRecords((prev) =>
        prev.map((item) =>
          item.inputPath === binPath
            ? {
                ...item,
                status: "running",
                errorMessage: undefined,
                fixedNumatbFiles: [],
                failedNumatbFiles: [],
              }
            : item
        )
      )

      try {
        setProgress({
          current: i,
          total: selectedBinPaths.length,
          currentFile: currentFileName,
        })

        if (!currentFileName.toLowerCase().endsWith(".bin")) {
          throw new Error(`Invalid file extension: ${currentFileName}`)
        }

        const fileNameNoExt = currentFileName.replace(/\.bin$/i, "")
        const binBuffer = await readFile(binPath)
        const conversionResult = createGvsMapToVs2Package(binBuffer, fileNameNoExt)
        const outputFolderPath = await join(outputDir, fileNameNoExt)
        const outputJsonPath = await join(outputDir, `${fileNameNoExt}.json`)

        await mkdir(outputFolderPath, { recursive: true })

        for (const fileItem of conversionResult.flatFiles) {
          const outputFilePath = await join(outputFolderPath, fileItem.fileName)
          await writeFile(outputFilePath, fileItem.data)
        }

        await writeTextFile(
          outputJsonPath,
          JSON.stringify(conversionResult.outputMeta, null, 2)
        )

        okCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === binPath
              ? {
                  ...item,
                  status: "success",
                  numatbStatus: "idle",
                  outputFolderPath,
                  outputJsonPath,
                  packedFilePath: "",
                  fileCount: conversionResult.outputMeta.SubFileData.length,
                  fixedNumatbFiles: [],
                  failedNumatbFiles: [],
                }
              : item
          )
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        failCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === binPath
              ? {
                  ...item,
                  status: "failed",
                  numatbStatus: "idle",
                  outputFolderPath: "",
                  outputJsonPath: "",
                  packedFilePath: "",
                  fileCount: 0,
                  fixedNumatbFiles: [],
                  failedNumatbFiles: [],
                  errorMessage,
                  numatbErrorMessage: undefined,
                }
              : item
          )
        )
      }

      setProgress({
        current: i + 1,
        total: selectedBinPaths.length,
        currentFile: "",
      })
    }

    setIsConverting(false)
    if (okCount > 0) {
      toast.success(`Step1 completed for ${okCount} file(s)`)
    }
    if (failCount > 0) {
      toast.error(`Failed ${failCount} file(s). Click failed rows to inspect message.`)
    }
  }

  const handleDebugExtractGraphicParamOnly = async () => {
    if (!canRunDebugGraphicParam) {
      return
    }

    setIsDebugGraphicParamExtracting(true)
    setProgress({ current: 0, total: selectedBinPaths.length, currentFile: "" })
    setRecords((prev) =>
      prev.map((item) => ({
        ...item,
        status: "pending",
        numatbStatus: "idle",
        packStatus: "idle",
        outputFolderPath: "",
        outputJsonPath: "",
        packedFilePath: "",
        fileCount: 0,
        fixedNumatbFiles: [],
        failedNumatbFiles: [],
        errorMessage: undefined,
        numatbErrorMessage: undefined,
        packErrorMessage: undefined,
      }))
    )

    let okCount = 0
    let failCount = 0
    for (let i = 0; i < selectedBinPaths.length; i++) {
      const binPath = selectedBinPaths[i]
      const currentRecord = records.find((item) => item.inputPath === binPath)
      const currentFileName = currentRecord?.fileName ?? (await basename(binPath))

      setProgress({
        current: i,
        total: selectedBinPaths.length,
        currentFile: currentFileName,
      })
      setRecords((prev) =>
        prev.map((item) =>
          item.inputPath === binPath
            ? {
                ...item,
                status: "running",
                errorMessage: undefined,
              }
            : item
        )
      )

      try {
        const fileNameNoExt = currentFileName.replace(/\.bin$/i, "")
        const sourceBuffer = await readFile(binPath)
        const graphicParamFile = extractOnlyGraphicParamFile(
          sourceBuffer,
          fileNameNoExt,
          "directional_lighting"
        )

        const outputFolderPath = await join(outputDir, fileNameNoExt)
        await mkdir(outputFolderPath, { recursive: true })
        const outputFilePath = await join(outputFolderPath, graphicParamFile.fileName)
        await writeFile(outputFilePath, graphicParamFile.data)

        okCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === binPath
              ? {
                  ...item,
                  status: "success",
                  outputFolderPath,
                  outputJsonPath: "",
                  packedFilePath: "",
                  fileCount: 1,
                }
              : item
          )
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        failCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === binPath
              ? {
                  ...item,
                  status: "failed",
                  outputFolderPath: "",
                  outputJsonPath: "",
                  packedFilePath: "",
                  fileCount: 0,
                  errorMessage,
                }
              : item
          )
        )
      }

      setProgress({
        current: i + 1,
        total: selectedBinPaths.length,
        currentFile: "",
      })
    }

    setIsDebugGraphicParamExtracting(false)
    if (okCount > 0) {
      toast.success(`Debug extracted graphic_param for ${okCount} file(s)`)
    }
    if (failCount > 0) {
      toast.error(`Debug extract failed for ${failCount} file(s)`)
    }
  }

  const handleStep2FixNumatbFiles = () => {
    void runStep2FixNumatbFiles().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Step2 failed")
    })
  }

  const runStep2FixNumatbFiles = async () => {
    if (!canRunStep2) {
      return
    }

    const targets = records.filter((item) => item.status === "success")
    if (targets.length === 0) {
      throw new Error("No successful Step1 records available for Step2.")
    }

    const resourcePath = await resourceDir()
    const toolPath = await join(resourcePath, "tools", "ssbh_data_json.exe")
    const toolExists = await exists(toolPath)
    if (!toolExists) {
      throw new Error(`Tool not found: ${toolPath}`)
    }

    setIsFixingNumatb(true)
    setProgress({ current: 0, total: targets.length, currentFile: "" })
    setRecords((prev) =>
      prev.map((item) =>
        item.status === "success"
          ? {
              ...item,
              numatbStatus: "idle",
              numatbErrorMessage: undefined,
              fixedNumatbFiles: [],
              failedNumatbFiles: [],
            }
          : item
      )
    )

    let fixedCount = 0
    let noNumatbCount = 0
    let failedCount = 0

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      setProgress({
        current: i,
        total: targets.length,
        currentFile: target.fileName,
      })
      setRecords((prev) =>
        prev.map((item) =>
          item.inputPath === target.inputPath
            ? {
                ...item,
                numatbStatus: "fixing",
                numatbErrorMessage: undefined,
                fixedNumatbFiles: [],
                failedNumatbFiles: [],
              }
            : item
        )
      )

      try {
        const entries = await readDir(target.outputFolderPath)
        const numatbEntries = entries.filter(
          (entry) => entry.isFile && (entry.name ?? "").toLowerCase().endsWith(".numatb")
        )

        if (numatbEntries.length === 0) {
          noNumatbCount += 1
          setRecords((prev) =>
            prev.map((item) =>
              item.inputPath === target.inputPath
                ? {
                    ...item,
                    numatbStatus: "no_numatb",
                  }
                : item
            )
          )
          setProgress({
            current: i + 1,
            total: targets.length,
            currentFile: "",
          })
          continue
        }

        for (const entry of numatbEntries) {
          const entryName = entry.name ?? ""
          const numatbPath = await join(target.outputFolderPath, entryName)
          const baseName = entryName.replace(/\.numatb$/i, "")
          const jsonPath = await join(target.outputFolderPath, `${baseName}.json`)
          const convertToJsonCommand = await invoke("exec_shell_command", {
            command: `${toolPath} ${numatbPath} ${jsonPath}`,
          })
          if (typeof convertToJsonCommand !== "string") {
            console.error(`Failed to convert ${entryName} to JSON:`, convertToJsonCommand)
            setRecords((prev) =>
              prev.map((item) =>
                item.inputPath === target.inputPath
                  ? {
                      ...item,
                      failedNumatbFiles: [
                        ...item.failedNumatbFiles,
                        { name: entryName, reason: "numatb->json failed" },
                      ],
                    }
                  : item
              )
            )
            continue
          }

          const jsonBuffer = await readTextFile(jsonPath)
          const jsonContent = JSON.parse(jsonBuffer)
          jsonContent.minor_version = 6

          for (const row of jsonContent.entries) {
            if (row.shader_label === "") {
              row.textures.forEach((texture: any) => {
                if (texture.param_id === "DiffuseMap" && !texture.data.includes("_sky")) {
                  texture.param_id = "BaseColorMap"
                }
              })
            }

            if (row.shader_label !== "") {
              switch (row.shader_label) {
                case "FeRendererMovableVertexColor":
                  row.shader_label = "vstgStandard_VertexColor"
                  break
                case "FeRendererMovableBlend2MultiUV":
                  row.shader_label = "vstgStandard_MultiUV_LightAndShadowMap"
                  break
                default:
                  break
              }
              row.textures.forEach((texture: any) => {
                if (texture.param_id === "DiffuseMap" && !texture.data.includes("_sky")) {
                  texture.param_id = "BaseColorMap"
                }
              })
            }
          }

          await writeTextFile(jsonPath, JSON.stringify(jsonContent, null, 2))

          const convertToNumatbCommand = await invoke("exec_shell_command", {
            command: `${toolPath} ${jsonPath} ${numatbPath}`,
          })
          if (typeof convertToNumatbCommand !== "string") {
            console.error(`Failed to convert JSON back to numatb for ${entryName}:`, convertToNumatbCommand)
            setRecords((prev) =>
              prev.map((item) =>
                item.inputPath === target.inputPath
                  ? {
                      ...item,
                      failedNumatbFiles: [
                        ...item.failedNumatbFiles,
                        { name: entryName, reason: "json->numatb failed" },
                      ],
                    }
                  : item
              )
            )
            continue
          }

          setRecords((prev) =>
            prev.map((item) =>
              item.inputPath === target.inputPath
                ? {
                    ...item,
                    fixedNumatbFiles: [...item.fixedNumatbFiles, entryName],
                  }
                : item
            )
          )
        }

        fixedCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === target.inputPath
              ? {
                  ...item,
                  numatbStatus: "fixed",
                }
              : item
          )
        )
      } catch (error) {
        const numatbErrorMessage = error instanceof Error ? error.message : "Unknown error"
        failedCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === target.inputPath
              ? {
                  ...item,
                  numatbStatus: "fix_failed",
                  numatbErrorMessage,
                }
              : item
          )
        )
      }

      setProgress({
        current: i + 1,
        total: targets.length,
        currentFile: "",
      })
    }

    setIsFixingNumatb(false)
    if (fixedCount > 0) {
      toast.success(`Step2 fixed numatb for ${fixedCount} file(s)`)
    }
    if (noNumatbCount > 0) {
      toast.info(`Step2 found no numatb in ${noNumatbCount} file(s)`)
    }
    if (failedCount > 0) {
      toast.error(`Step2 failed for ${failedCount} file(s)`)
    }
  }

  const handleStep3PackToObModPath = () => {
    void runStep3PackToObModPath().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Step3 failed")
    })
  }

  const runStep3PackToObModPath = async () => {
    if (!canRunStep3) {
      return
    }

    let targetObModPath = (obModPath ?? "").trim()
    if (!targetObModPath) {
      const fromStore = await getSetting<string>("obModPath")
      targetObModPath = String(fromStore ?? "").trim()
    }
    if (!targetObModPath) {
      throw new Error("obModPath is empty. Please configure it in Config page first.")
    }

    const step3Targets = records.filter(
      (item) =>
        item.status === "success" &&
        item.outputJsonPath.trim().length > 0 &&
        (item.numatbStatus === "fixed" ||
          item.numatbStatus === "no_numatb" ||
          item.numatbStatus === "idle")
    )
    if (step3Targets.length === 0) {
      throw new Error("No Step3 candidates found. Ensure each folder has its sibling json file.")
    }

    setIsPacking(true)
    setProgress({ current: 0, total: step3Targets.length, currentFile: "" })
    setRecords((prev) =>
      prev.map((item) =>
        step3Targets.some((t) => t.inputPath === item.inputPath)
          ? {
              ...item,
              packStatus: "idle",
              packedFilePath: "",
              packErrorMessage: undefined,
            }
          : item
      )
    )

    let packedCount = 0
    let packFailedCount = 0

    for (let i = 0; i < step3Targets.length; i++) {
      const target = step3Targets[i]
      setProgress({
        current: i,
        total: step3Targets.length,
        currentFile: target.fileName,
      })
      setRecords((prev) =>
        prev.map((item) =>
          item.inputPath === target.inputPath
            ? {
                ...item,
                packStatus: "packing",
                packErrorMessage: undefined,
              }
            : item
        )
      )

      try {
        await repackFolderUsingStructureToDir({
          structurePath: target.outputJsonPath,
          inputFolderPath: target.outputFolderPath,
          outputDir: targetObModPath,
        })

        const packedFhm2dName = target.fileName.replace(/\.bin$/i, ".fhm2d")
        const packedFhm2dPath = await join(targetObModPath, packedFhm2dName)
        const renamedBinName = getObModBinName(target.fileName)
        const renamedBinPath = await join(targetObModPath, renamedBinName)

        const renameCommand = Command.create(
          "exec-cmd",
          ["/c", "move", "/Y", packedFhm2dPath.replace(/\//g, "\\"), renamedBinPath.replace(/\//g, "\\")],
          { encoding: "utf-8" }
        )
        const renameResult = await renameCommand.execute()
        if (renameResult.code !== 0) {
          throw new Error(renameResult.stderr || `Failed to rename packed file: ${packedFhm2dName}`)
        }

        packedCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === target.inputPath
              ? {
                  ...item,
                  packStatus: "packed",
                  packedFilePath: renamedBinPath,
                }
              : item
          )
        )
      } catch (error) {
        const packErrorMessage = error instanceof Error ? error.message : "Unknown error"
        packFailedCount += 1
        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === target.inputPath
              ? {
                  ...item,
                  packStatus: "pack_failed",
                  packedFilePath: "",
                  packErrorMessage,
                }
              : item
          )
        )
      }

      setProgress({
        current: i + 1,
        total: step3Targets.length,
        currentFile: "",
      })
    }

    setIsPacking(false)
    if (packedCount > 0) {
      toast.success(`Step3 packed ${packedCount} file(s) to obModPath`)
    }
    if (packFailedCount > 0) {
      toast.error(`Step3 failed for ${packFailedCount} file(s)`)
    }
  }

  const handleReset = () => {
    startTransition(() => {
      setSelectedBinPaths([])
      setOutputDir("")
      setRecords([])
      setSelectedJsonPath("")
      setSelectedJsonData(null)
    })
    setProgress({ current: 0, total: 0, currentFile: "" })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Open GVS Map to VS2
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-7xl h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>GVS Map to VS2</DialogTitle>
          <DialogDescription>
            Step1 extracts data, Step2 fixes numatb, Step3 packs output to obModPath.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-7 flex items-center gap-2">
            <Input
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder="Select output directory, e.g. D:\\exports"
              disabled={isConverting || isDebugGraphicParamExtracting || isFixingNumatb || isPacking}
            />
            <Button variant="outline" onClick={handleSelectOutputDir} disabled={isConverting || isDebugGraphicParamExtracting || isFixingNumatb || isPacking}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <div className="md:col-span-5 flex items-center gap-2 justify-start md:justify-end">
            <Badge variant="outline">Selected: {selectedBinPaths.length}</Badge>
            <Badge variant="outline">Success: {successCount}</Badge>
            {(isPending || isLoadingDetail) && <Badge variant="outline">Working...</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleSelectBinFiles} disabled={isConverting || isDebugGraphicParamExtracting || isFixingNumatb || isPacking}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Select .bin Files
          </Button>
          <Button onClick={handleStep1ExtractAndGenerateJson} disabled={!canRunStep1}>
            {isConverting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileJson2 className="h-4 w-4 mr-2" />}
            Step1: Extract and Generate JSON
          </Button>
          <Button variant="outline" onClick={() => void handleDebugExtractGraphicParamOnly()} disabled={!canRunDebugGraphicParam}>
            {isDebugGraphicParamExtracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Debug: only extract graphic_param file
          </Button>
          <Button variant="outline" onClick={handleStep2FixNumatbFiles} disabled={!canRunStep2}>
            Step2: Fix Numatb Files
          </Button>
          <Button variant="outline" onClick={handleOpenStep21Dialog} disabled={!canRunStep21}>
            Step2.1: log all graphic_param file url
          </Button>
          <Button variant="outline" onClick={handleStep3PackToObModPath} disabled={!canRunStep3}>
            Step3: Pack to obModPath
          </Button>
          <Button variant="outline" onClick={() => setShowGuide((prev) => !prev)}>
            {showGuide ? "Hide Guide" : "User Guide"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isConverting || isDebugGraphicParamExtracting || isFixingNumatb || isPacking}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleSelectStep2Folders} disabled={isConverting || isDebugGraphicParamExtracting || isFixingNumatb || isPacking}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Skip to Step2: Select Step2 Folders
          </Button>
        </div>

        {showGuide && (
          <Card className="p-3 text-sm space-y-2">
            <div className="font-medium">Workflow Guide</div>
            <div>Step1: Extract flat files and generate hash JSON from selected GVS .bin files.</div>
            <div>Debug: scan raw data by directional_lighting and extract only graphic_param file.</div>
            <div>Direct Step2: Select extracted folders directly and run numatb fix without Step1.</div>
            <div>Step2: Migrate extracted `.numatb` files from GVS format to EXVS2-compatible settings.</div>
            <div>Step3: Pack the folder using compression.js and output to `obModPath` as `0xHASH.bin`.</div>
          </Card>
        )}

        <Dialog open={isStep21DialogOpen} onOpenChange={setIsStep21DialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Step2.1 Graphic Param URL Log</DialogTitle>
              <DialogDescription>
                把这个内容复制给AI，叫AI参考side7的graphic_param进行改动
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void runGraphicParamScan()} disabled={isScanningGraphicParam}>
                  {isScanningGraphicParam ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    "Re-scan"
                  )}
                </Button>
                <Button variant="outline" onClick={() => void handleCopyGraphicParamLog()}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </div>
              <Textarea
                value={graphicParamLogText}
                readOnly
                className="min-h-[360px] font-mono text-xs"
                placeholder="Scan result will appear here. One file path per line."
              />
            </div>
          </DialogContent>
        </Dialog>

        {progress.total > 0 && (
          <Card className="p-3">
            <div className="space-y-2">
              <div className="text-sm">
                Processing {progress.current}/{progress.total}
                {progress.currentFile ? ` - ${progress.currentFile}` : ""}
              </div>
              <Progress value={progressPercent} />
            </div>
          </Card>
        )}

        <Separator />

        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
          <Card className="col-span-4 p-3 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Selected BIN Files</div>
              <Badge variant="outline">{records.length}</Badge>
            </div>
            <ScrollArea className="flex-1 border rounded-md">
              <div className="p-2 space-y-2">
                {records.map((item) => (
                  <button
                    key={item.inputPath}
                    className={`w-full text-left p-2 rounded border ${selectedJsonPath === item.outputJsonPath ? "border-primary bg-muted" : "border-border"}`}
                    onClick={() => {
                      if (item.status !== "success" || !item.outputJsonPath) {
                        if (item.status === "failed") {
                          toast.error(item.errorMessage ?? "Step1 failed")
                        } else if (item.status === "success" && !item.outputJsonPath) {
                          toast.error(item.errorMessage ?? "Missing structure json")
                        } else if (item.numatbStatus === "fix_failed") {
                          toast.error(item.numatbErrorMessage ?? "Step2 failed")
                        } else if (item.packStatus === "pack_failed") {
                          toast.error(item.packErrorMessage ?? "Step3 failed")
                        }
                        return
                      }
                      void handleLoadDetail(item.outputJsonPath)
                    }}
                    disabled={isLoadingDetail}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate pr-2">{item.fileName}</div>
                      <Badge
                        variant={
                          item.status === "success"
                            ? "secondary"
                            : item.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-1">
                      {item.status === "success"
                        ? item.outputFolderPath
                        : item.status === "failed"
                          ? item.errorMessage
                          : item.inputPath}
                    </div>
                    {item.status === "success" && (
                      <div className="text-xs mt-1 space-y-1">
                        <div>Source: {item.sourceType}</div>
                        JSON: {item.outputJsonPath}
                        <div>
                          Fix Numatb:{" "}
                          {item.numatbStatus === "idle"
                            ? "idle"
                            : item.numatbStatus === "fixing"
                              ? "fixing"
                              : item.numatbStatus === "fixed"
                                ? "fixed"
                                : item.numatbStatus === "no_numatb"
                                  ? "no_numatb"
                                  : item.numatbErrorMessage}
                        </div>
                        {item.fixedNumatbFiles.length > 0 && (
                          <div>
                            Fixed files: {item.fixedNumatbFiles.join(", ")}
                          </div>
                        )}
                        {item.failedNumatbFiles.length > 0 && (
                          <div>
                            Failed files: {item.failedNumatbFiles.map((file) => `${file.name}(${file.reason})`).join(", ")}
                          </div>
                        )}
                        <div>
                          Pack:{" "}
                          {item.packStatus === "idle"
                            ? "idle"
                            : item.packStatus === "packing"
                              ? "packing"
                              : item.packStatus === "packed"
                                ? item.packedFilePath
                                : item.packErrorMessage}
                        </div>
                      </div>
                    )}
                  </button>
                ))}
                {records.length === 0 && (
                  <div className="text-sm text-muted-foreground p-2">
                    No selected files yet
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>

          <Card className="col-span-8 p-3 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <ListTree className="h-4 w-4" />
              <div className="font-medium">Detail</div>
            </div>
            <ScrollArea className="flex-1 border rounded-md">
              <div className="p-2 text-sm">
                {selectedJsonData ? (
                  <JsonView
                    value={selectedJsonData}
                    style={vscodeTheme}
                    displayDataTypes={false}
                    collapsed={1}
                    enableClipboard={false}
                  />
                ) : (
                  <div className="text-muted-foreground">
                    Select a generated JSON file to view detail
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
