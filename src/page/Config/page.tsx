import { useEffect } from "react";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from 'react-hook-form';
import { FilePathInput } from '../../components/ui/filePathInput';
import { CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY, useConfigStore } from '../../store/configStore';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

const formSchema = z.object({
  obDplCachePath: z.string(),
  obModPath: z.string(),
  extractOutputPath: z.string(),
  characterIdDebugMscOutputPath: z.string(),
})

export default function ConfigPage() {
  const { store, setSetting } = useConfigStore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      obDplCachePath: "",
      obModPath: "",
      extractOutputPath: "",
      characterIdDebugMscOutputPath: "",
    },
  })

  const initFormData = async () => {
    if (store) {
      const obDplCachePath: string = await store.get("obDplCachePath") || "";
      form.setValue("obDplCachePath", obDplCachePath);

      const obModPath: string = await store.get("obModPath") || "";
      form.setValue("obModPath", obModPath);
      
      const extractOutputPath: string = await store.get("extractOutputPath") || "";
      form.setValue("extractOutputPath", extractOutputPath);

      const characterIdDebugMscOutputPath: string = await store.get(CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY) || "";
      form.setValue("characterIdDebugMscOutputPath", characterIdDebugMscOutputPath);
    }
  }

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!store) {
      toast("Store not initialized, please try again");
      return;
    }

    await setSetting("obDplCachePath", data.obDplCachePath);
    await setSetting("obModPath", data.obModPath);
    await setSetting("extractOutputPath", data.extractOutputPath);
    await setSetting(CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY, data.characterIdDebugMscOutputPath);
    toast("Configuration saved successfully");
  }

  useEffect(() => {
    initFormData();
  }, [store]);

  return (
    <div className="h-full">
      <div className="flex flex-col space-y-6">
        <h1 className="text-2xl font-bold">Configuration</h1>
        
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Configure application paths and defaults</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="obDplCachePath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>OB dplcache_release Directory</FormLabel>
                      <FormControl>
                        <FilePathInput
                          placeholder="Select OB dplcache_release folder..."
                          {...field}
                          storeKey="obDplCachePath"
                          picker={{
                            kind: "folder",
                            multiple: false,
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Path to OB dplcache_release directory
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="obModPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>OB Mod Directory</FormLabel>
                      <FormControl>
                        <FilePathInput
                          placeholder="Select OB mod folder..."
                          {...field}
                          storeKey="obModPath"
                          picker={{
                            kind: "folder",
                            multiple: false,
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Path to OB mod directory used by Character ID Table checks
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="extractOutputPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Extract Output Path</FormLabel>
                      <FormControl>
                        <FilePathInput
                          placeholder="Select extract output folder..."
                          {...field}
                          storeKey="extractOutputPath"
                          picker={{
                            kind: "folder",
                            multiple: false,
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional secondary extract root (Character ID table: Extract to Output Folder).
                        Extract to Workspace / Extract All use the Test Editor workspace path instead.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="characterIdDebugMscOutputPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Character ID Debug MSC Output Root</FormLabel>
                      <FormControl>
                        <FilePathInput
                          placeholder="Select MSC debug output root..."
                          {...field}
                          storeKey={CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY}
                          picker={{
                            kind: "folder",
                            multiple: false,
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Root folder for Debug Extract All MSC; the 040msc route folder is appended automatically
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button type="submit">Save Configuration</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
