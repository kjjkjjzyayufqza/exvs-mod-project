import { createAsyncThunk } from "@reduxjs/toolkit";
import { Store } from "tauri-plugin-store-api";
import { ConfigModel } from "../models/configModel";
export const storeConfig = new Store(".config.json");

export const getConfig = createAsyncThunk("store/getConfig", async () => {
  const response = await storeConfig.get("config");
  return response;
});

// export const updateConfig = async (key: string, value: any) => {
//   const old_value = await getConfig();
//   console.log(old_value);
//   await storeConfig.set("config", { ...old_value, ...{ [key]: value } });
//   await storeConfig.save();
// };

export const updateConfig = createAsyncThunk(
  "store/updateConfig",
  async ({ key, value }: { key: string; value: any }) => {
    const old_value: ConfigModel | null = await storeConfig.get("config");
    const updatedConfig = { ...old_value, ...{ [key]: value } };
    await storeConfig.set("config", updatedConfig);
    await storeConfig.save();
  }
);
