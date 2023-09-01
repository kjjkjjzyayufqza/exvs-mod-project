import { Button } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../../hooks";
import { changeId, changeName } from "../../stateManager/slice/stuSlice";
import { Store } from "tauri-plugin-store-api";
import { getConfig, storeConfig } from "../../module/storeConfig";
import { useEffect } from "react";

export default function MainPage() {
  const dispatch = useAppDispatch();
  const stu = useAppSelector((state) => state.stu);

  const save = async () => {
    await storeConfig.set("config", {
      inputFileUrl: "a",
      outputFileUrl: "b",
    });
    await storeConfig.save();
  };
  const get = async () => {
    const a = getConfig();
    // const a = await storeConfig.get("inputFileUrl");
    // console.log(a)
  };

  // useEffect(() => {
  //   dispatch(getConfig());
  // }, [dispatch]);

  return (
    <div>
      Hello World
      <div>
        <div>我叫{stu.name}</div>
        <button onClick={() => dispatch(changeName("王武"))}>王武</button>
        <button onClick={() => dispatch(changeName("刘叔"))}>刘叔</button>
      </div>
      <Button onClick={save}>Save Test</Button>
      <Button onClick={get}>Get Test</Button>
    </div>
  );
}
