import { configureStore } from "@reduxjs/toolkit";
import stu from "./stateManager/slice/stuSlice";
import configStore from "./stateManager/configStore/configStore";

const store = configureStore({
  reducer: {
    stu: stu,
    configStore: configStore,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
