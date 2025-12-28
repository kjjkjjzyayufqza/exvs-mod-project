import { open } from '@tauri-apps/plugin-dialog';
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
import { useConfigStore } from '../../store/configStore';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

const formSchema = z.object({
  obDplCachePath: z.string(),
  extractOutputPath: z.string()
})

export default function ConfigPage() {
  const { store } = useConfigStore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      obDplCachePath: "",
      extractOutputPath: "",
    },
  })

  const openSelectFolderDialog = async (value: "obDplCachePath" | "extractOutputPath") => {
    const selected = await open({ multiple: false, directory: true });
    if (selected) {
      store?.set(value, selected as any);
      form.setValue(value, selected as any);
      toast(`${value} path updated`);
    }
  }

  const initFormData = async () => {
    if (store) {
      const obDplCachePath: string = await store.get("obDplCachePath") || "";
      form.setValue("obDplCachePath", obDplCachePath);
      
      const extractOutputPath: string = await store.get("extractOutputPath") || "";
      form.setValue("extractOutputPath", extractOutputPath);
    }
  }

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (store) {
      await store.set("obDplCachePath", data.obDplCachePath);
      await store.set("extractOutputPath", data.extractOutputPath);
      await store.save();
      toast("Configuration saved successfully");
    } else {
      toast("Store not initialized, please try again");
    }
  }

  useEffect(() => {
    initFormData();
  }, [store]);

  return (
    <div>
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
                          onClick={() => openSelectFolderDialog("obDplCachePath")} />
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
                  name="extractOutputPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Extract Output Path</FormLabel>
                      <FormControl>
                        <FilePathInput
                          placeholder="Select extract output folder..."
                          {...field}
                          onClick={() => openSelectFolderDialog("extractOutputPath")} />
                      </FormControl>
                      <FormDescription>
                        Default directory for extracted files
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
