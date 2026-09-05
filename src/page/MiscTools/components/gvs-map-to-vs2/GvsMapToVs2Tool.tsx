import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useMemo, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { exists, mkdir, readDir, readFile, readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { basename, dirname, join, resourceDir } from "@tauri-apps/api/path"
import { Command } from "@tauri-apps/plugin-shell"
import JsonView from "@uiw/react-json-view"
import { vscodeTheme } from "@uiw/react-json-view/vscode"
import { Loader2, FileJson2, FolderOpen, ListTree, RefreshCcw, Copy } from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { AppRndModalShell } from "@/components/AppRndModalShell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { useConfigStore } from "@/store/configStore"
import { repackFolderUsingStructureToDir } from "@/utils/repackRunner"
import {
  createGvsMapToVs2Package,
  extractOnlyGraphicParamFile,
  extractOnlyNumatbFiles,
  type GvsMapToVs2OutputMeta,
} from "./gvsMapToVs2Service"

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
  convertedToJsonNumatbFiles: string[]
  editedJsonNumatbFiles: string[]
  fixedNumatbFiles: string[]
  failedNumatbFiles: Array<{
    name: string
    stage: "numatb_to_json" | "patch_json" | "json_to_numatb"
    reason: string
    detail?: string
  }>
  errorMessage?: string
  numatbErrorMessage?: string
  packErrorMessage?: string
}

type ShellExecOutput = {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
}

const GVS_TOOL_DIMENSIONS = {
  width: 1320,
  height: 820,
  minWidth: 820,
  minHeight: 560,
}
const GVS_LOG_DIMENSIONS = {
  width: 820,
  height: 620,
  minWidth: 520,
  minHeight: 380,
}
const GVS_REPORT_DIMENSIONS = {
  width: 1040,
  height: 720,
  minWidth: 640,
  minHeight: 420,
}

export function GvsMapToVs2Tool() {
  const { t } = useTranslation("misc-tools-a")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedBinPaths, setSelectedBinPaths] = useState<string[]>([])
  const [outputDir, setOutputDir] = useState("")
  const [isConverting, setIsConverting] = useState(false)
  const [isDebugGraphicParamExtracting, setIsDebugGraphicParamExtracting] = useState(false)
  const [isDebugNumatbExtracting, setIsDebugNumatbExtracting] = useState(false)
  const [isFixingNumatb, setIsFixingNumatb] = useState(false)
  const [isPacking, setIsPacking] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [isStep21DialogOpen, setIsStep21DialogOpen] = useState(false)
  const [isStep2ReportDialogOpen, setIsStep2ReportDialogOpen] = useState(false)
  const [isScanningGraphicParam, setIsScanningGraphicParam] = useState(false)
  const [isConvertingGraphicParamCsv, setIsConvertingGraphicParamCsv] = useState(false)
  const [graphicParamLogText, setGraphicParamLogText] = useState("")
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFile: "" })
  const [records, setRecords] = useState<ConvertRecord[]>([])
  const [selectedJsonPath, setSelectedJsonPath] = useState<string>("")
  const [selectedJsonData, setSelectedJsonData] = useState<GvsMapToVs2OutputMeta | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { obModPath, getSetting } = useConfigStore()
  const recordsListRef = useRef<HTMLDivElement | null>(null)
  const reportListRef = useRef<HTMLDivElement | null>(null)

  const isAnyDebugExtracting = isDebugGraphicParamExtracting || isDebugNumatbExtracting
  const canRunStep1 = selectedBinPaths.length > 0 && outputDir.trim().length > 0 && !isConverting && !isAnyDebugExtracting && !isFixingNumatb && !isPacking
  const canRunDebugGraphicParam = selectedBinPaths.length > 0 && outputDir.trim().length > 0 && !isConverting && !isAnyDebugExtracting && !isFixingNumatb && !isPacking
  const canRunDebugNumatb = selectedBinPaths.length > 0 && outputDir.trim().length > 0 && !isConverting && !isAnyDebugExtracting && !isFixingNumatb && !isPacking
  const canRunStep2 = records.some((item) => item.status === "success") && !isConverting && !isAnyDebugExtracting && !isFixingNumatb && !isPacking
  const canRunStep21 = records.some((item) => item.status === "success") && !isConverting && !isAnyDebugExtracting && !isFixingNumatb && !isPacking
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
    !isAnyDebugExtracting &&
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
  const step2FailureRecords = useMemo(
    () =>
      records.filter(
        (item) => item.failedNumatbFiles.length > 0 || item.numatbStatus === "fix_failed"
      ),
    [records]
  )
  const step2ReportRecords = useMemo(
    () =>
      records.filter(
        (item) =>
          item.status === "success" &&
          (item.numatbStatus === "fixed" ||
            item.numatbStatus === "fix_failed" ||
            item.numatbStatus === "no_numatb")
      ),
    [records]
  )
  const step2FailureFileCount = useMemo(
    () =>
      records.reduce((sum, item) => {
        const fallbackCount =
          item.numatbStatus === "fix_failed" && item.failedNumatbFiles.length === 0 ? 1 : 0
        return sum + item.failedNumatbFiles.length + fallbackCount
      }, 0),
    [records]
  )
  const getRecordsScrollElement = useCallback(() => recordsListRef.current, [])
  const recordsVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: getRecordsScrollElement,
    estimateSize: () => 168,
    getItemKey: (index) => records[index]?.inputPath ?? index,
    overscan: 6,
  })
  const getReportScrollElement = useCallback(() => reportListRef.current, [])
  const reportVirtualizer = useVirtualizer({
    count: step2ReportRecords.length,
    getScrollElement: getReportScrollElement,
    estimateSize: () => 280,
    getItemKey: (index) => step2ReportRecords[index]?.inputPath ?? index,
    overscan: 4,
  })

  const getObModOutputName = (sourceBinName: string): string => {
    const raw = sourceBinName.replace(/\.bin$/i, "").replace(/^0x/i, "")
    return `0x${raw.toUpperCase()}.fhm2d`
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
      toast.error(t("gvs.errors.noScanFolders"))
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
      toast.error(error instanceof Error ? error.message : t("gvs.errors.scanFailed"))
    })
  }

  const handleCopyGraphicParamLog = async () => {
    if (!graphicParamLogText.trim()) {
      toast.error(t("gvs.errors.noScanCopy"))
      return
    }
    await navigator.clipboard.writeText(graphicParamLogText)
    toast.success(t("gvs.success.copiedGraphicParam"))
  }

  const handleConvertGraphicParamToCsv = async () => {
    if (!graphicParamLogText.trim()) {
      toast.error(t("gvs.errors.noScanConvert"))
      return
    }

    const candidatePaths = graphicParamLogText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("[NOT_FOUND]"))

    if (candidatePaths.length === 0) {
      toast.error(t("gvs.errors.noGraphicParamPath"))
      return
    }

    setIsConvertingGraphicParamCsv(true)
    let successCount = 0
    const failedItems: Array<{ path: string; reason: string }> = []

    for (const sourcePath of candidatePaths) {
      try {
        const sourceData = await readFile(sourcePath)
        const parentDir = await dirname(sourcePath)
        const targetCsvPath = await join(parentDir, "graphic_param.csv")
        await writeFile(targetCsvPath, sourceData)
        successCount += 1
      } catch (error) {
        failedItems.push({
          path: sourcePath,
          reason: error instanceof Error ? error.message : t("common.unknownError"),
        })
      }
    }

    setIsConvertingGraphicParamCsv(false)
    if (successCount > 0) {
      toast.success(t("gvs.success.convertedCsv", { count: successCount }))
    }
    if (failedItems.length > 0) {
      toast.error(
        t("gvs.errors.convertFailed", {
          count: failedItems.length,
          path: failedItems[0].path,
          reason: failedItems[0].reason,
        })
      )
    }
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
          convertedToJsonNumatbFiles: [],
          editedJsonNumatbFiles: [],
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
      toast.error(t("gvs.errors.selectBin"))
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
          convertedToJsonNumatbFiles: [],
          editedJsonNumatbFiles: [],
          fixedNumatbFiles: [],
          failedNumatbFiles: [],
          errorMessage: hasStructureJson ? undefined : t("gvs.missingStructure"),
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
      toast.error(t("gvs.errors.selectStep2"))
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
      toast.error(t("gvs.errors.selectOutput"))
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
      toast.error(t("gvs.errors.loadDetail", {
        message: error instanceof Error ? error.message : t("common.unknownError"),
      }))
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
          convertedToJsonNumatbFiles: [],
          editedJsonNumatbFiles: [],
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
                convertedToJsonNumatbFiles: [],
                editedJsonNumatbFiles: [],
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
                  convertedToJsonNumatbFiles: [],
                  editedJsonNumatbFiles: [],
                  fixedNumatbFiles: [],
                  failedNumatbFiles: [],
                }
              : item
          )
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t("common.unknownError")
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
                  convertedToJsonNumatbFiles: [],
                  editedJsonNumatbFiles: [],
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
      toast.success(t("gvs.success.step1", { count: okCount }))
    }
    if (failCount > 0) {
      toast.error(t("gvs.errors.step1FailedCount", { count: failCount }))
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
        convertedToJsonNumatbFiles: [],
        editedJsonNumatbFiles: [],
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
        const errorMessage = error instanceof Error ? error.message : t("common.unknownError")
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
                  convertedToJsonNumatbFiles: [],
                  editedJsonNumatbFiles: [],
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
      toast.success(t("gvs.success.debugGraphicParam", { count: okCount }))
    }
    if (failCount > 0) {
      toast.error(t("gvs.errors.debugExtractFailed", { count: failCount }))
    }
  }

  const handleDebugExtractNumatbOnly = async () => {
    if (!canRunDebugNumatb) {
      return
    }

    setIsDebugNumatbExtracting(true)
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
        convertedToJsonNumatbFiles: [],
        editedJsonNumatbFiles: [],
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
        const numatbFiles = extractOnlyNumatbFiles(sourceBuffer, fileNameNoExt)

        const outputFolderPath = await join(outputDir, fileNameNoExt)
        await mkdir(outputFolderPath, { recursive: true })
        for (const file of numatbFiles) {
          const outputFilePath = await join(outputFolderPath, file.fileName)
          await writeFile(outputFilePath, file.data)
        }

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
                  fileCount: numatbFiles.length,
                }
              : item
          )
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t("common.unknownError")
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
                  convertedToJsonNumatbFiles: [],
                  editedJsonNumatbFiles: [],
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

    setIsDebugNumatbExtracting(false)
    if (okCount > 0) {
      toast.success(t("gvs.success.debugNumatb", { count: okCount }))
    }
    if (failCount > 0) {
      toast.error(t("gvs.errors.debugNumatbFailed", { count: failCount }))
    }
  }

  const handleStep2FixNumatbFiles = () => {
    void runStep2FixNumatbFiles().catch((error) => {
      toast.error(error instanceof Error ? error.message : t("gvs.errors.step2Failed"))
    })
  }

  const formatShellOutput = (result: ShellExecOutput): string => {
    const code = result.exitCode === null ? "null" : String(result.exitCode)
    const stdout = result.stdout.trim()
    const stderr = result.stderr.trim()
    const parts: string[] = [`exitCode=${code}`, `success=${String(result.success)}`]
    if (stdout.length > 0) {
      parts.push(`stdout=${stdout}`)
    }
    if (stderr.length > 0) {
      parts.push(`stderr=${stderr}`)
    }
    return parts.join(" | ")
  }

  const runProcessAndCapture = async (
    executable: string,
    args: string[]
  ): Promise<ShellExecOutput> => {
    const result = await invoke<ShellExecOutput>("exec_process_with_output", {
      executable,
      args,
    })
    return result
  }

  const waitForFileReady = async (
    filePath: string,
    options?: { retries?: number; intervalMs?: number }
  ): Promise<boolean> => {
    const retries = options?.retries ?? 5
    const intervalMs = options?.intervalMs ?? 80
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (await exists(filePath)) {
        return true
      }
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    }
    return false
  }

  const extractErrorDetail = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message
    }
    if (typeof error === "string" && error.trim().length > 0) {
      return error
    }
    if (error && typeof error === "object") {
      const raw = error as Record<string, unknown>
      if (typeof raw.message === "string" && raw.message.trim().length > 0) {
        return raw.message
      }
      if (typeof raw.error === "string" && raw.error.trim().length > 0) {
        return raw.error
      }
      try {
        return JSON.stringify(raw)
      } catch {
        return "Unknown non-Error object"
      }
    }
    return "Unknown error value"
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
              convertedToJsonNumatbFiles: [],
              editedJsonNumatbFiles: [],
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
                convertedToJsonNumatbFiles: [],
                editedJsonNumatbFiles: [],
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

        const convertedToJsonNumatbFiles: string[] = []
        const editedJsonNumatbFiles: string[] = []
        const fixedNumatbFiles: string[] = []
        const failedNumatbFiles: ConvertRecord["failedNumatbFiles"] = []

        for (const entry of numatbEntries) {
          const entryName = entry.name ?? ""
          const numatbPath = await join(target.outputFolderPath, entryName)
          const baseName = entryName.replace(/\.numatb$/i, "")
          const jsonPath = await join(target.outputFolderPath, `${baseName}.json`)
          let currentStage: ConvertRecord["failedNumatbFiles"][number]["stage"] = "numatb_to_json"

          try {
            const convertToJsonCommand = await runProcessAndCapture(toolPath, [
              numatbPath,
              jsonPath,
            ])
            if (!convertToJsonCommand.success) {
              throw new Error(
                `numatb_to_json failed: ${formatShellOutput(convertToJsonCommand)}`
              )
            }
            const jsonCreated = await waitForFileReady(jsonPath)
            if (!jsonCreated) {
              throw new Error(
                `numatb_to_json output missing: expected ${jsonPath} | ${formatShellOutput(convertToJsonCommand)}`
              )
            }
            convertedToJsonNumatbFiles.push(entryName)

            currentStage = "patch_json"
            const jsonBuffer = await readTextFile(jsonPath)
            const jsonContent = JSON.parse(jsonBuffer)
            jsonContent.minor_version = 6

            for (const row of jsonContent.entries) {
              const textures = row.textures ?? []
              const booleans = row.booleans ?? []

              const patchTextureParamId = (texture: { param_id: string; data: string }) => {
                const dataStr = typeof texture.data === "string" ? texture.data : ""
                if (texture.param_id === "DiffuseMap" && !dataStr.includes("_sky")) {
                  texture.param_id = "BaseColorMap"
                } else if (texture.param_id === "DiffuseMapLayer1") {
                  texture.param_id = "BaseColorMapLayer1"
                }
              }

              const hasBaseColorMapInTextures = () =>
                textures.some(
                  (t: { param_id: string }) =>
                    t.param_id === "BaseColorMap" || t.param_id === "BaseColorMapLayer1"
                )
              const hasUseBaseColorMap = () =>
                booleans.some((b: { param_id: string }) => b.param_id === "UseBaseColorMap")
              const hasUseDiffuseMap = () =>
                booleans.some((b: { param_id: string }) => b.param_id === "UseDiffuseMap")

              if (row.shader_label === "") {
                textures.forEach(patchTextureParamId)
              }

              if (row.shader_label !== "") {
                switch (row.shader_label) {
                  case "FeRendererMovableVertexColor":
                    row.shader_label = "vstgStandard_VertexColor"
                    break
                  case "FeRendererMovableBlend2MultiUV":
                    row.shader_label = "vstgStandard_MultiUV_LightAndShadowMap"
                    break
                  case "FeRendererMovableMultiUVVertexColorAO":
                    row.shader_label = "vstgStandard_MultiUV_LightAndShadowMap"
                    break
                  default:
                    break
                }
                textures.forEach(patchTextureParamId)

                for (const bool of booleans) {
                  if (bool.param_id === "UseDiffuseMap") {
                    bool.param_id = "UseBaseColorMap"
                  }
                }
                if (
                  hasBaseColorMapInTextures() &&
                  !hasUseBaseColorMap() &&
                  !hasUseDiffuseMap()
                ) {
                  booleans.push({ param_id: "UseBaseColorMap", data: true })
                }
              }
            }

            await writeTextFile(jsonPath, JSON.stringify(jsonContent, null, 2))
            editedJsonNumatbFiles.push(entryName)

            currentStage = "json_to_numatb"
            const convertToNumatbCommand = await runProcessAndCapture(toolPath, [
              jsonPath,
              numatbPath,
            ])
            if (!convertToNumatbCommand.success) {
              throw new Error(
                `json_to_numatb failed: ${formatShellOutput(convertToNumatbCommand)}`
              )
            }

            fixedNumatbFiles.push(entryName)
          } catch (fileError) {
            const detail = extractErrorDetail(fileError)
            const stage = currentStage
            failedNumatbFiles.push({
              name: entryName,
              stage,
              reason: `Failed in ${stage}`,
              detail,
            })
          }
        }

        if (failedNumatbFiles.length > 0) {
          failedCount += 1
        } else {
          fixedCount += 1
        }

        setRecords((prev) =>
          prev.map((item) =>
            item.inputPath === target.inputPath
              ? {
                  ...item,
                  numatbStatus: failedNumatbFiles.length > 0 ? "fix_failed" : "fixed",
                  numatbErrorMessage:
                    failedNumatbFiles.length > 0
                      ? `Failed ${failedNumatbFiles.length}/${numatbEntries.length} numatb file(s)`
                      : undefined,
                  convertedToJsonNumatbFiles,
                  editedJsonNumatbFiles,
                  fixedNumatbFiles,
                  failedNumatbFiles,
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
                  convertedToJsonNumatbFiles: [],
                  editedJsonNumatbFiles: [],
                  failedNumatbFiles: [
                    {
                      name: t("gvs.folderLevel"),
                      stage: "patch_json",
                      reason: t("gvs.failedBeforePerFile"),
                      detail: numatbErrorMessage,
                    },
                  ],
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
      toast.success(t("gvs.success.step2Fixed", { count: fixedCount }))
    }
    if (noNumatbCount > 0) {
      toast.info(t("gvs.success.step2NoNumatb", { count: noNumatbCount }))
    }
    if (failedCount > 0) {
      toast.error(t("gvs.errors.step2FailedCount", { count: failedCount }))
      setIsStep2ReportDialogOpen(true)
    }
  }

  const handleStep3PackToObModPath = () => {
    void runStep3PackToObModPath().catch((error) => {
      toast.error(error instanceof Error ? error.message : t("gvs.errors.step3Failed"))
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
      throw new Error(t("gvs.obModPathEmpty"))
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
      throw new Error(t("gvs.noStep3Candidates"))
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
        const renamedOutputName = getObModOutputName(target.fileName)
        const renamedOutputPath = await join(targetObModPath, renamedOutputName)

        const renameCommand = Command.create(
          "exec-cmd",
          ["/c", "move", "/Y", packedFhm2dPath.replace(/\//g, "\\"), renamedOutputPath.replace(/\//g, "\\")],
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
                  packedFilePath: renamedOutputPath,
                }
              : item
          )
        )
      } catch (error) {
        const packErrorMessage = error instanceof Error ? error.message : t("common.unknownError")
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
      toast.success(t("gvs.success.step3Packed", { count: packedCount }))
    }
    if (packFailedCount > 0) {
      toast.error(t("gvs.errors.step3FailedCount", { count: packFailedCount }))
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
  const handleClose = useCallback(() => {
    if (isConverting || isAnyDebugExtracting || isFixingNumatb || isPacking) {
      return
    }
    setIsStep21DialogOpen(false)
    setIsStep2ReportDialogOpen(false)
    setIsOpen(false)
  }, [isAnyDebugExtracting, isConverting, isFixingNumatb, isPacking])

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        {t("gvs.open")}
      </Button>
      {isOpen ? (
        <AppRndModalShell
          titleId="gvs-map-to-vs2-title"
          title={t("gvs.title")}
          subtitle={t("gvs.subtitle")}
          headerIcon={<ListTree className="h-4 w-4" />}
          dimensions={GVS_TOOL_DIMENSIONS}
          storageKey="gvs-map-to-vs2-dialog-size"
          closeDisabled={isConverting || isAnyDebugExtracting || isFixingNumatb || isPacking}
          onClose={handleClose}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-7 flex items-center gap-2">
            <Input
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder={t("gvs.outputPlaceholder")}
              disabled={isConverting || isAnyDebugExtracting || isFixingNumatb || isPacking}
            />
            <Button variant="outline" onClick={handleSelectOutputDir} disabled={isConverting || isAnyDebugExtracting || isFixingNumatb || isPacking}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <div className="md:col-span-5 flex items-center gap-2 justify-start md:justify-end">
            <Badge variant="outline">{t("gvs.selectedCount", { count: selectedBinPaths.length })}</Badge>
            <Badge variant="outline">{t("gvs.successCount", { count: successCount })}</Badge>
            {(isPending || isLoadingDetail) && <Badge variant="outline">{t("gvs.working")}</Badge>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* Row 1: Input selection */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleSelectBinFiles} disabled={isConverting || isAnyDebugExtracting || isFixingNumatb || isPacking}>
              <FolderOpen className="h-4 w-4 mr-2" />
              {t("gvs.selectBin")}
            </Button>
            <Button variant="outline" onClick={handleSelectStep2Folders} disabled={isConverting || isAnyDebugExtracting || isFixingNumatb || isPacking}>
              <FolderOpen className="h-4 w-4 mr-2" />
              {t("gvs.skipToStep2")}
            </Button>
          </div>
          {/* Row 2: Step1 workflow */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleStep1ExtractAndGenerateJson} disabled={!canRunStep1}>
              {isConverting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileJson2 className="h-4 w-4 mr-2" />}
              {t("gvs.step1")}
            </Button>
            <Button variant="outline" onClick={() => void handleDebugExtractGraphicParamOnly()} disabled={!canRunDebugGraphicParam}>
              {isDebugGraphicParamExtracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("gvs.debugGraphicParam")}
            </Button>
            <Button variant="outline" onClick={() => void handleDebugExtractNumatbOnly()} disabled={!canRunDebugNumatb}>
              {isDebugNumatbExtracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("gvs.debugNumatb")}
            </Button>
          </div>
          {/* Row 3: Step2 workflow */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleStep2FixNumatbFiles} disabled={!canRunStep2}>
              {isFixingNumatb ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("gvs.step2")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsStep2ReportDialogOpen(true)}
              disabled={step2ReportRecords.length === 0}
            >
              {t("gvs.step2Details", { count: step2FailureFileCount })}
            </Button>
            <Button variant="outline" onClick={handleOpenStep21Dialog} disabled={!canRunStep21}>
              {t("gvs.step21")}
            </Button>
          </div>
          {/* Row 4: Step3 workflow */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleStep3PackToObModPath} disabled={!canRunStep3}>
              {t("gvs.step3")}
            </Button>
          </div>
          {/* Row 5: Utility */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setShowGuide((prev) => !prev)}>
              {showGuide ? t("gvs.hideGuide") : t("gvs.showGuide")}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isConverting || isAnyDebugExtracting || isFixingNumatb || isPacking}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              {t("gvs.reset")}
            </Button>
          </div>
        </div>

        {showGuide && (
          <Card className="p-3 text-sm space-y-2">
            <div className="font-medium">{t("gvs.workflowGuide")}</div>
            <div>{t("gvs.guideStep1")}</div>
            <div>{t("gvs.guideDebugGraphicParam")}</div>
            <div>{t("gvs.guideDebugNumatb")}</div>
            <div>{t("gvs.guideDirectStep2")}</div>
            <div>{t("gvs.guideStep2")}</div>
            <div>{t("gvs.guideStep3")}</div>
          </Card>
        )}

        {isStep21DialogOpen
          ? createPortal(
              <AppRndModalShell
                titleId="gvs-graphic-param-log-title"
                title={t("gvs.logTitle")}
                subtitle={t("gvs.logSubtitle")}
                headerIcon={<FileJson2 className="h-4 w-4" />}
                dimensions={GVS_LOG_DIMENSIONS}
                storageKey="gvs-graphic-param-log-dialog-size"
                closeDisabled={isScanningGraphicParam || isConvertingGraphicParamCsv}
                onClose={() => setIsStep21DialogOpen(false)}
              >
                <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => void runGraphicParamScan()} disabled={isScanningGraphicParam}>
                      {isScanningGraphicParam ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("gvs.scanning")}
                        </>
                      ) : (
                        t("gvs.rescan")
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => void handleCopyGraphicParamLog()}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t("common.copy")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleConvertGraphicParamToCsv()}
                      disabled={isScanningGraphicParam || isConvertingGraphicParamCsv}
                    >
                      {isConvertingGraphicParamCsv ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("gvs.converting")}
                        </>
                      ) : (
                        t("gvs.convertCsv")
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={graphicParamLogText}
                    readOnly
                    className="min-h-0 flex-1 resize-none font-mono text-xs"
                    placeholder={t("gvs.scanPlaceholder")}
                    data-i18n-ignore=""
                  />
                </div>
              </AppRndModalShell>,
              document.body,
            )
          : null}

        {isStep2ReportDialogOpen
          ? createPortal(
              <AppRndModalShell
                titleId="gvs-step2-report-title"
                title={t("gvs.reportTitle")}
                subtitle={t("gvs.reportSubtitle")}
                headerIcon={<FileJson2 className="h-4 w-4" />}
                dimensions={GVS_REPORT_DIMENSIONS}
                storageKey="gvs-step2-report-dialog-size"
                onClose={() => setIsStep2ReportDialogOpen(false)}
              >
                <div className="flex min-h-0 flex-1 flex-col p-4">
                  <div
                    ref={reportListRef}
                    className="min-h-0 flex-1 overflow-auto rounded-md border overscroll-contain"
                  >
              <div className="relative w-full" style={{ height: reportVirtualizer.getTotalSize() }}>
                {reportVirtualizer.getVirtualItems().map((virtualRow) => {
                  const record = step2ReportRecords[virtualRow.index]
                  if (!record) return null
                  return (
                    <div
                      key={virtualRow.key}
                      ref={reportVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute left-0 top-0 w-full p-3 pb-0"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <Card className="p-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate pr-2" data-i18n-ignore="">{record.fileName}</div>
                      <Badge variant="destructive" data-i18n-ignore="">{record.numatbStatus}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground break-all">
                      {t("gvs.folder")} <span data-i18n-ignore="">{record.outputFolderPath || record.inputPath}</span>
                    </div>
                    {record.numatbErrorMessage && (
                      <div className="text-xs text-red-600">
                        {t("gvs.summary")} <span data-i18n-ignore="">{record.numatbErrorMessage}</span>
                      </div>
                    )}
                    <div className="text-xs space-y-2">
                      <div>
                        <div className="font-medium mb-1">
                          {t("gvs.stage1", { count: record.convertedToJsonNumatbFiles.length })}
                        </div>
                        {record.convertedToJsonNumatbFiles.length > 0 ? (
                          <div className="break-all" data-i18n-ignore="">
                            {record.convertedToJsonNumatbFiles.join(", ")}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">{t("gvs.none")}</div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium mb-1">
                          {t("gvs.stage2", { count: record.editedJsonNumatbFiles.length })}
                        </div>
                        {record.editedJsonNumatbFiles.length > 0 ? (
                          <div className="break-all" data-i18n-ignore="">
                            {record.editedJsonNumatbFiles.join(", ")}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">{t("gvs.none")}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="font-medium mb-1">{t("gvs.failedFiles")}</div>
                      {record.failedNumatbFiles.length > 0 ? (
                        <div className="space-y-2">
                          {record.failedNumatbFiles.map((failedFile, index) => (
                            <div
                              key={`${record.inputPath}-${failedFile.name}-${index}`}
                              className="rounded border p-2 space-y-1"
                            >
                              <div>
                                <span className="font-medium">{t("gvs.file")}</span> <span data-i18n-ignore="">{failedFile.name}</span>
                              </div>
                              <div>
                                <span className="font-medium">{t("gvs.stage")}</span> <span data-i18n-ignore="">{failedFile.stage}</span>
                              </div>
                              <div>
                                <span className="font-medium">{t("gvs.reason")}</span> <span data-i18n-ignore="">{failedFile.reason}</span>
                              </div>
                              {failedFile.detail && (
                                <div className="text-red-600 break-all">
                                  <span className="font-medium">{t("gvs.detail")}</span> <span data-i18n-ignore="">{failedFile.detail}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          {t("gvs.noPerFile")}
                        </div>
                      )}
                    </div>
                    {record.fixedNumatbFiles.length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium">{t("gvs.fixedFiles")}</span>{" "}
                        <span data-i18n-ignore="">{record.fixedNumatbFiles.join(", ")}</span>
                      </div>
                    )}
                      </Card>
                    </div>
                  )
                })}
                {step2ReportRecords.length === 0 && (
                  <div className="p-3 text-muted-foreground">
                    {t("gvs.noStep2Details")}
                  </div>
                )}
              </div>
                  </div>
                </div>
              </AppRndModalShell>,
              document.body,
            )
          : null}

        {progress.total > 0 && (
          <Card className="p-3">
            <div className="space-y-2">
              <div className="text-sm">
                {t("gvs.processing", { current: progress.current, total: progress.total })}
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
              <div className="font-medium">{t("gvs.selectedBinFiles")}</div>
              <Badge variant="outline">{records.length}</Badge>
            </div>
            <div
              ref={recordsListRef}
              className="min-h-0 flex-1 overflow-auto rounded-md border overscroll-contain"
            >
              <div className="relative w-full" style={{ height: recordsVirtualizer.getTotalSize() }}>
                {recordsVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = records[virtualRow.index]
                  if (!item) return null
                  return (
                  <div
                    key={virtualRow.key}
                    ref={recordsVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 w-full p-2 pb-0"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                  <button
                    className={`w-full text-left p-2 rounded border ${selectedJsonPath === item.outputJsonPath ? "border-primary bg-muted" : "border-border"}`}
                    onClick={() => {
                      if (item.status !== "success" || !item.outputJsonPath) {
                        if (item.status === "failed") {
                          toast.error(item.errorMessage ?? t("gvs.errors.step1Failed"))
                        } else if (item.status === "success" && !item.outputJsonPath) {
                          toast.error(item.errorMessage ?? t("gvs.missingStructureShort"))
                        } else if (item.numatbStatus === "fix_failed") {
                          toast.error(item.numatbErrorMessage ?? t("gvs.errors.step2Failed"))
                        } else if (item.packStatus === "pack_failed") {
                          toast.error(item.packErrorMessage ?? t("gvs.errors.step3Failed"))
                        }
                        return
                      }
                      void handleLoadDetail(item.outputJsonPath)
                    }}
                    disabled={isLoadingDetail}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate pr-2" data-i18n-ignore="">{item.fileName}</div>
                      <Badge
                        variant={
                          item.status === "success"
                            ? "secondary"
                            : item.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                        data-i18n-ignore=""
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-1" data-i18n-ignore="">
                      {item.status === "success"
                        ? item.outputFolderPath
                        : item.status === "failed"
                          ? item.errorMessage
                          : item.inputPath}
                    </div>
                    {item.status === "success" && (
                      <div className="text-xs mt-1 space-y-1">
                        <div>{t("gvs.source")} <span data-i18n-ignore="">{item.sourceType}</span></div>
                        <span data-i18n-ignore="">JSON: {item.outputJsonPath}</span>
                        <div>
                          {t("gvs.fixNumatb")}{" "}
                          <span data-i18n-ignore="">
                          {item.numatbStatus === "idle"
                            ? "idle"
                            : item.numatbStatus === "fixing"
                              ? "fixing"
                              : item.numatbStatus === "fixed"
                                ? "fixed"
                                : item.numatbStatus === "no_numatb"
                                  ? "no_numatb"
                                  : item.numatbErrorMessage}
                          </span>
                        </div>
                        {item.fixedNumatbFiles.length > 0 && (
                          <div>
                            {t("gvs.fixedFiles")} <span data-i18n-ignore="">{item.fixedNumatbFiles.join(", ")}</span>
                          </div>
                        )}
                        {item.failedNumatbFiles.length > 0 && (
                          <div>
                            {t("gvs.failedFilesLabel")}{" "}
                            <span data-i18n-ignore="">
                            {item.failedNumatbFiles
                              .map((file) => `${file.name}(${file.stage}: ${file.reason})`)
                              .join(", ")}
                            </span>
                          </div>
                        )}
                        <div>
                          {t("gvs.pack")}{" "}
                          <span data-i18n-ignore="">
                          {item.packStatus === "idle"
                            ? "idle"
                            : item.packStatus === "packing"
                              ? "packing"
                              : item.packStatus === "packed"
                                ? item.packedFilePath
                                : item.packErrorMessage}
                          </span>
                        </div>
                      </div>
                    )}
                  </button>
                  </div>
                  )
                })}
                {records.length === 0 && (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("gvs.noFiles")}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="col-span-8 p-3 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <ListTree className="h-4 w-4" />
              <div className="font-medium">{t("gvs.detailTitle")}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <div className="p-2 text-sm">
                {selectedJsonData ? (
                  <div data-i18n-ignore="">
                  <JsonView
                    value={selectedJsonData}
                    style={vscodeTheme}
                    displayDataTypes={false}
                    collapsed={1}
                    enableClipboard={false}
                  />
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    {t("gvs.selectDetail")}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  )
}
