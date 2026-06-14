import { useMemo, useState } from "react";
import { FilePenLine, Loader2 } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { FBXLoader } from "three-stdlib";
import { useDebounce } from "use-debounce";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";

type FbxItem = {
  id: string;
  name: string;
};

export type FbxItems = {
  mesh: FbxItem[];
  bone: FbxItem[];
};

type FbxNameDocument = {
  mesh?: unknown;
  bone?: unknown;
};

const FBX_RENAME_DIMENSIONS = {
  width: 920,
  height: 680,
  minWidth: 620,
  minHeight: 440,
};

function readNameArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  if (!value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must contain only strings.`);
  }
  return value;
}

export function applyFbxNameDocument(items: FbxItems, jsonText: string): FbxItems {
  const parsed = JSON.parse(jsonText) as FbxNameDocument;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The JSON root must be an object.");
  }

  const meshNames = readNameArray(parsed.mesh, "mesh");
  const boneNames = readNameArray(parsed.bone, "bone");

  return {
    mesh: items.mesh.map((item, index) => ({
      ...item,
      name: meshNames[index] ?? item.name,
    })),
    bone: items.bone.map((item, index) => ({
      ...item,
      name: boneNames[index] ?? item.name,
    })),
  };
}

function disposeFbxObject(object: {
  traverse: (callback: (child: Record<string, unknown>) => void) => void;
}) {
  const disposedTextures = new Set<object>();
  object.traverse((child) => {
    const geometry = child.geometry as { dispose?: () => void } | undefined;
    geometry?.dispose?.();

    const rawMaterial = child.material;
    const materials = Array.isArray(rawMaterial) ? rawMaterial : rawMaterial ? [rawMaterial] : [];
    for (const material of materials) {
      if (!material || typeof material !== "object") continue;
      for (const value of Object.values(material as Record<string, unknown>)) {
        if (
          value &&
          typeof value === "object" &&
          "isTexture" in value &&
          (value as { isTexture?: boolean }).isTexture &&
          !disposedTextures.has(value)
        ) {
          disposedTextures.add(value);
          (value as { dispose?: () => void }).dispose?.();
        }
      }
      (material as { dispose?: () => void }).dispose?.();
    }
  });
}

export function FBXItemRename() {
  const [fbxPath, setFbxPath] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fbxData, setFbxData] = useState<Uint8Array | null>(null);
  const [fbxItems, setFbxItems] = useState<FbxItems>({ mesh: [], bone: [] });
  const [jsonText, setJsonText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debouncedJsonText] = useDebounce(jsonText, 300);

  const jsonValidationError = useMemo(() => {
    if (!debouncedJsonText) return null;
    try {
      applyFbxNameDocument(fbxItems, debouncedJsonText);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [debouncedJsonText, fbxItems]);

  const loadFBXFile = async (filePath: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    let objectUrl: string | null = null;
    try {
      const fileData = await readFile(filePath);
      const file = new File([fileData], "model.fbx", { type: "application/octet-stream" });
      objectUrl = URL.createObjectURL(file);

      const loader = new FBXLoader();
      const object = await new Promise<{
        traverse: (callback: (child: Record<string, any>) => void) => void;
      }>((resolve, reject) => {
        loader.load(objectUrl!, resolve, undefined, reject);
      });

      const meshes: FbxItem[] = [];
      const bones: FbxItem[] = [];
      object.traverse((child) => {
        if (child.isMesh && child.material?.name) {
          meshes.push({ id: `mesh_${meshes.length}`, name: child.material.name });
        }
        if (child.isBone && child.name) {
          bones.push({ id: `bone_${bones.length}`, name: child.name });
        }
      });

      disposeFbxObject(object);
      setFbxData(fileData);
      setFbxItems({ mesh: meshes, bone: bones });
      setJsonText(
        JSON.stringify(
          {
            mesh: meshes.map((item) => item.name),
            bone: bones.map((item) => item.name),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error("Error loading FBX file:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setIsLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "FBX Files", extensions: ["fbx"] }],
      });
      if (selected && typeof selected === "string") {
        setFbxPath(selected);
        await loadFBXFile(selected);
      }
    } catch (error) {
      console.error("Error selecting file:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveFile = async () => {
    if (!fbxData) return;

    try {
      setErrorMessage(null);
      const savePath = await save({
        filters: [
          { name: "FBX Files", extensions: ["fbx"] },
          { name: "JSON Files", extensions: ["json"] },
        ],
      });
      if (!savePath) return;

      if (savePath.toLowerCase().endsWith(".json")) {
        const modifiedItems = applyFbxNameDocument(fbxItems, jsonText);
        const nameMapping = {
          originalFile: fbxPath,
          modifiedItems,
          exportDate: new Date().toISOString(),
          note: "This file contains name mappings. The source FBX binary is not modified.",
        };
        await writeFile(savePath, new TextEncoder().encode(JSON.stringify(nameMapping, null, 2)));
      } else {
        await writeFile(savePath, fbxData);
      }
    } catch (error) {
      console.error("Error saving file:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        Open FBX Item Rename
      </Button>

      {isOpen ? (
        <AppRndModalShell
          titleId="fbx-item-rename-title"
          title="FBX Item Rename"
          subtitle={
            fbxData
              ? `${fbxItems.mesh.length} meshes, ${fbxItems.bone.length} bones`
              : "Load an FBX file and edit its exported name mapping"
          }
          headerIcon={<FilePenLine className="h-5 w-5 text-primary" />}
          dimensions={FBX_RENAME_DIMENSIONS}
          storageKey="app.rnd-size.fbx-item-rename"
          onClose={() => setIsOpen(false)}
          closeDisabled={isLoading}
          footer={
            fbxData ? (
              <div className="flex flex-wrap justify-end gap-2 p-3">
                <Button variant="outline" onClick={() => void handleSelectFile()} disabled={isLoading}>
                  Load Another FBX
                </Button>
                <Button
                  onClick={() => void handleSaveFile()}
                  disabled={isLoading || Boolean(jsonValidationError)}
                >
                  Save FBX or Mapping
                </Button>
              </div>
            ) : undefined
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            {!fbxData ? (
              <div className="flex flex-1 items-center justify-center">
                <Button onClick={() => void handleSelectFile()} disabled={isLoading} size="lg">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isLoading ? "Loading..." : "Select FBX File"}
                </Button>
              </div>
            ) : (
              <>
                <p className="truncate text-xs text-muted-foreground" title={fbxPath}>
                  {fbxPath}
                </p>
                <textarea
                  className="min-h-0 flex-1 resize-none rounded-md border bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  spellCheck={false}
                  aria-label="FBX name mapping JSON"
                />
              </>
            )}

            {errorMessage || jsonValidationError ? (
              <p className="shrink-0 text-xs text-destructive">{errorMessage ?? jsonValidationError}</p>
            ) : null}
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
