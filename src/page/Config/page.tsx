import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Separator } from "@/components/ui/separator";
import {
  CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY,
  TEST_EDITOR_FOLDER_STORE_KEY,
  useConfigStore,
} from "@/store/configStore";
import { RawSettingsEditor } from "./components/RawSettingsEditor";

const formSchema = z.object({
  obDplCachePath: z.string(),
  obModPath: z.string(),
  extractOutputPath: z.string(),
  characterIdDebugMscOutputPath: z.string(),
});

type ConfigFormValues = z.infer<typeof formSchema>;

/** Store keys backed by a typed field below; surfaced in the raw list as "has a field above". */
const MANAGED_SETTING_KEYS = [
  "obDplCachePath",
  "obModPath",
  "extractOutputPath",
  CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY,
  TEST_EDITOR_FOLDER_STORE_KEY,
] as const;

const PATH_FIELDS: Array<{
  name: keyof ConfigFormValues;
  storeKey: string;
  label: string;
  placeholder: string;
  description: string;
}> = [
  {
    name: "obDplCachePath",
    storeKey: "obDplCachePath",
    label: "OB dplcache_release directory",
    placeholder: "Select OB dplcache_release folder...",
    description: "Source of the unmodified game archives.",
  },
  {
    name: "obModPath",
    storeKey: "obModPath",
    label: "OB mod directory",
    placeholder: "Select OB mod folder...",
    description: "Destination the repack pipeline writes finished packs into.",
  },
  {
    name: "extractOutputPath",
    storeKey: "extractOutputPath",
    label: "Extract output path",
    placeholder: "Select extract output folder...",
    description:
      "Optional secondary extract root used by Character ID table > Extract to Output Folder. Extract to Workspace uses the EXVS2 Workspace root instead.",
  },
  {
    name: "characterIdDebugMscOutputPath",
    storeKey: CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY,
    label: "Character ID debug MSC output root",
    placeholder: "Select MSC debug output root...",
    description: "Debug Extract All MSC root; the 040msc route folder is appended automatically.",
  },
];

export default function ConfigPage() {
  const store = useConfigStore((s) => s.store);
  const setSetting = useConfigStore((s) => s.setSetting);
  const initStore = useConfigStore((s) => s.initStore);
  const [rawReloadToken, setRawReloadToken] = useState(0);

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      obDplCachePath: "",
      obModPath: "",
      extractOutputPath: "",
      characterIdDebugMscOutputPath: "",
    },
  });

  const { reset } = form;

  const loadFormFromStore = useCallback(async () => {
    if (!store) return;
    const [obDplCachePath, obModPath, extractOutputPath, characterIdDebugMscOutputPath] =
      await Promise.all([
        store.get<string>("obDplCachePath"),
        store.get<string>("obModPath"),
        store.get<string>("extractOutputPath"),
        store.get<string>(CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY),
      ]);
    reset({
      obDplCachePath: obDplCachePath ?? "",
      obModPath: obModPath ?? "",
      extractOutputPath: extractOutputPath ?? "",
      characterIdDebugMscOutputPath: characterIdDebugMscOutputPath ?? "",
    });
  }, [store, reset]);

  useEffect(() => {
    void loadFormFromStore();
  }, [loadFormFromStore]);

  /**
   * Raw writes go through `setSetting` so the Zustand mirror other pages read
   * stays in sync with the on-disk store, then the typed form above reloads.
   */
  const writeRawSetting = useCallback(
    async (key: string, value: unknown) => {
      await setSetting(key, value);
      await loadFormFromStore();
    },
    [setSetting, loadFormFromStore],
  );

  /** No typed delete exists, so the whole store is re-read to drop stale mirrored fields. */
  const deleteRawSetting = useCallback(
    async (key: string) => {
      if (!store) throw new Error("Settings store is not initialized yet");
      await store.delete(key);
      await store.save();
      await initStore();
      await loadFormFromStore();
    },
    [store, initStore, loadFormFromStore],
  );

  const onSubmit = async (data: ConfigFormValues) => {
    if (!store) {
      toast.error("Settings store is not initialized yet");
      return;
    }
    await setSetting("obDplCachePath", data.obDplCachePath);
    await setSetting("obModPath", data.obModPath);
    await setSetting("extractOutputPath", data.extractOutputPath);
    await setSetting(
      CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY,
      data.characterIdDebugMscOutputPath,
    );
    setRawReloadToken((token) => token + 1);
    toast.success("Configuration saved");
  };

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-16">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Configuration</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Common paths have typed fields. Everything else in the settings store is editable below
            at raw JSON level.
          </p>
        </header>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">Paths</h2>
            <p className="text-sm text-muted-foreground">
              Written to <code className="font-mono text-xs">settings.json</code> on save.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {PATH_FIELDS.map((field) => (
                <FormField
                  key={field.name}
                  control={form.control}
                  name={field.name}
                  render={({ field: controllerField }) => (
                    <FormItem className="max-w-3xl">
                      <FormLabel>{field.label}</FormLabel>
                      <FormControl>
                        <FilePathInput
                          placeholder={field.placeholder}
                          {...controllerField}
                          storeKey={field.storeKey}
                          picker={{ kind: "folder", multiple: false }}
                        />
                      </FormControl>
                      <FormDescription>{field.description}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}

              <Button type="submit" disabled={form.formState.isSubmitting}>
                <Save className="h-4 w-4" />
                Save paths
              </Button>
            </form>
          </Form>
        </section>

        <Separator />

        <RawSettingsEditor
          key={rawReloadToken}
          store={store}
          managedKeys={MANAGED_SETTING_KEYS}
          onWriteSetting={writeRawSetting}
          onDeleteSetting={deleteRawSetting}
        />
      </div>
    </div>
  );
}
