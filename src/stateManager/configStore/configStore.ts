import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../store"; //引入类型
import { getConfig, storeConfig, updateConfig } from "../../module/storeConfig";

//声明状态进行接收
interface configState {
  inputFileUrl: string;
  outputFileUrl: string;
}

const initialState: configState = {
  inputFileUrl: "",
  outputFileUrl: "",
};

export const configStoreSlice = createSlice({
  name: "configStore", //类似于命名空间，（取个名字）
  initialState, //引用你写的状态
  //reducers 里面包裹的是同步的方法
  reducers: {
    setInputFileUrl: (state, action: PayloadAction<string>) => {
      state.inputFileUrl = action.payload;
    //   updateConfig("inputFileUrl", state.inputFileUrl).then(() => {});
    },
    setOutputFileUrl: (state, action: PayloadAction<string>) => {
      state.outputFileUrl = action.payload;
    //   updateConfig("outputFileUrl", state.outputFileUrl).then(() => {});
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getConfig.fulfilled, (state: configState, action: any) => {
        state.inputFileUrl = action.payload.inputFileUrl;
        state.outputFileUrl = action.payload.outputFileUrl;
      })
      .addCase(updateConfig.fulfilled, (state, action) => {
        return action.payload; // 更新状态为新的配置
      });
  },
});

export const { setInputFileUrl, setOutputFileUrl } = configStoreSlice.actions;
export const configStore = (state: RootState) => state.configStore;
export default configStoreSlice.reducer;
