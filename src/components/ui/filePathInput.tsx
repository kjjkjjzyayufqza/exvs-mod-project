import * as React from "react"

import { cn } from "@/lib/utils"
import { open, type DialogFilter } from "@tauri-apps/plugin-dialog"
import { dirname } from "@tauri-apps/api/path"
import { useConfigStore } from "@/store/configStore"

type PickerKind = "file" | "folder"
const DIALOG_DEFAULT_PATH_STORE_KEY = "dialogDefaultPath"

type DialogDefaultPathMap = Record<string, string | undefined>

export interface FilePathInputPickerOptions {
  kind: PickerKind
  multiple?: boolean
  title?: string
  filters?: DialogFilter[]
  /**
   * If provided, the dialog will try to open at this path first.
   * If omitted, the component will resolve it from store keys (if available).
   */
  defaultPath?: string
  /**
   * Store key used to remember the last dialog open path.
   * If omitted and `storeKey` is provided, it will use `storeKey`.
   *
   * Stored in Tauri store under the object key `dialogDefaultPath`:
   * `dialogDefaultPath: { [defaultPathKey]: "..." }`
   */
  defaultPathKey?: string
  /**
   * When true (default), update `defaultPathKey` after the user picks a path.
   */
  persistDefaultPath?: boolean
}

export interface FilePathInputProps extends React.ComponentProps<"input"> {
  /**
   * If provided, the component will read the initial value from Tauri store
   * and (optionally) persist picked values back to the same key.
   */
  storeKey?: string
  /**
   * If provided, clicking the input will open a Tauri dialog based on these options.
   */
  picker?: FilePathInputPickerOptions
  /**
   * When true (default), clicking the input triggers the picker when `picker` is set.
   */
  autoPick?: boolean
  /**
   * When true (default), picked values are persisted to `storeKey`.
   */
  persistPickedValue?: boolean
  /**
   * Called after user picks a value successfully.
   */
  onPickedValue?: (value: string | string[]) => void
  /**
   * For multi-select, controls how the input displays selected values.
   * Defaults to joining with "; ".
   */
  formatMultiValue?: (values: string[]) => string
}

const FilePathInput = React.forwardRef<HTMLInputElement, FilePathInputProps>(
  (
    {
      className,
      type,
      storeKey,
      picker,
      autoPick = true,
      persistPickedValue = true,
      onPickedValue,
      formatMultiValue,
      value,
      defaultValue,
      readOnly,
      onClick,
      onChange,
      ...props
    },
    ref
  ) => {
    const store = useConfigStore(s => s.store)
    const getSetting = useConfigStore(s => s.getSetting)
    const setSetting = useConfigStore(s => s.setSetting)

    const isControlled = value !== undefined
    const [uncontrolledValue, setUncontrolledValue] = React.useState<string>(
      typeof defaultValue === "string" ? defaultValue : ""
    )

    const hasSyncedFromStoreRef = React.useRef(false)

    const formatMulti = React.useCallback(
      (values: string[]) => {
        if (formatMultiValue) return formatMultiValue(values)
        return values.join("; ")
      },
      [formatMultiValue]
    )

    const toDisplay = React.useCallback(
      (raw: unknown): string => {
        if (Array.isArray(raw)) return formatMulti(raw.map(String))
        if (typeof raw === "string") return raw
        return ""
      },
      [formatMulti]
    )

    const emitChange = React.useCallback(
      (nextValue: string) => {
        if (onChange) {
          const event = {
            target: { value: nextValue },
            currentTarget: { value: nextValue },
          } as unknown as React.ChangeEvent<HTMLInputElement>
          onChange(event)
        }
        if (!isControlled) setUncontrolledValue(nextValue)
      },
      [isControlled, onChange]
    )

    React.useEffect(() => {
      if (!storeKey) return
      if (!store) return
      if (hasSyncedFromStoreRef.current) return

      ;(async () => {
        const stored = await getSetting<unknown>(storeKey)
        const display = toDisplay(stored)
        if (!display) {
          hasSyncedFromStoreRef.current = true
          return
        }

        // If the input is controlled (e.g. react-hook-form), push the store value to parent once.
        if (isControlled) {
          const current = typeof value === "string" ? value : ""
          if (!current) emitChange(display)
        } else {
          setUncontrolledValue(display)
        }

        hasSyncedFromStoreRef.current = true
      })()
    }, [store, storeKey, getSetting, isControlled, value, emitChange, toDisplay])

    const resolveDialogDefaultPath = React.useCallback(async (): Promise<string | undefined> => {
      const explicit = picker?.defaultPath
      if (explicit) return explicit

      const mapKey = picker?.defaultPathKey ?? storeKey
      if (mapKey) {
        const map = (await getSetting<DialogDefaultPathMap>(DIALOG_DEFAULT_PATH_STORE_KEY)) ?? {}
        const fromMap = map[mapKey]
        if (typeof fromMap === "string" && fromMap) return fromMap
      }

      if (storeKey) {
        const fromValueKey = await getSetting<unknown>(storeKey)
        if (typeof fromValueKey === "string" && fromValueKey) {
          if (picker?.kind === "folder") return fromValueKey
          if (picker?.kind === "file") return await dirname(fromValueKey)
        }
      }

      return undefined
    }, [getSetting, picker, storeKey])

    const persistDialogDefaultPath = React.useCallback(
      async (picked: string | string[]) => {
        if (!picker) return
        const persist = picker.persistDefaultPath !== false
        if (!persist) return

        const mapKey = picker.defaultPathKey ?? storeKey
        if (!mapKey) return

        let nextDefaultPath: string | undefined
        if (picker.kind === "folder") {
          nextDefaultPath = Array.isArray(picked) ? picked[0] : picked
        } else {
          const first = Array.isArray(picked) ? picked[0] : picked
          if (first) nextDefaultPath = await dirname(first)
        }

        if (!nextDefaultPath) return

        const map = (await getSetting<DialogDefaultPathMap>(DIALOG_DEFAULT_PATH_STORE_KEY)) ?? {}
        const nextMap: DialogDefaultPathMap = { ...map, [mapKey]: nextDefaultPath }
        await setSetting(DIALOG_DEFAULT_PATH_STORE_KEY, nextMap)
      },
      [getSetting, picker, setSetting, storeKey]
    )

    const handlePick = React.useCallback(async () => {
      if (!picker) return
      const defaultPath = await resolveDialogDefaultPath()

      const selected = await open({
        multiple: picker.multiple ?? false,
        directory: picker.kind === "folder",
        title: picker.title,
        filters: picker.filters,
        defaultPath,
      })

      if (!selected) return
      const rawValue = selected as string | string[]
      const display = toDisplay(rawValue)

      emitChange(display)
      onPickedValue?.(rawValue)

      if (storeKey && persistPickedValue) {
        await setSetting(storeKey, rawValue)
      }

      await persistDialogDefaultPath(rawValue)
    }, [
      emitChange,
      onPickedValue,
      persistDialogDefaultPath,
      persistPickedValue,
      picker,
      resolveDialogDefaultPath,
      setSetting,
      storeKey,
      toDisplay,
    ])

    const handleClick = React.useCallback(
      async (e: React.MouseEvent<HTMLInputElement>) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        if (!picker) return
        if (!autoPick) return
        if (props.disabled) return
        await handlePick()
      },
      [autoPick, handlePick, onClick, picker, props.disabled]
    )

    const finalType = picker ? "text" : type
    const finalReadOnly = picker ? (readOnly ?? true) : readOnly
    const finalValue = isControlled ? (value as any) : uncontrolledValue

    return (
      <input
        type={finalType}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        value={finalValue}
        readOnly={finalReadOnly}
        onClick={handleClick}
        {...props}
      />
    )
  }
)
FilePathInput.displayName = "FilePathInput"

export { FilePathInput }
