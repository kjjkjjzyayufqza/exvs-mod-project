import { Button } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../../hooks";
import { changeName } from "../../stateManager/slice/stuSlice";
import { getConfig, storeConfig } from "../../module/storeConfig";
import { useEffect } from "react";
import { Command } from "@tauri-apps/api/shell";
import { open } from "@tauri-apps/api/dialog";
import { readBinaryFile } from "@tauri-apps/api/fs";
import Pako from "pako";

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
    const a = await getConfig();
    // const a = await storeConfig.get("inputFileUrl");
    console.log(a);
  };

  const test = async () => {
    const a = await open({})
    const b = await readBinaryFile(a as string)
    const input = new Uint8Array(b);
    //... fill input data here
    console.log(b.length)
    // const command = new Command("node", ["..\\src\\outSrc\\test.js", `${b.toString()}`]);
    // command.on("close", (data) => {
    //   console.log(
    //     `command finished with code ${data.code} and signal ${data.signal}`
    //   );
    // });
    // command.on("error", (error) => console.error(`command error: "${error}"`));
    // command.stdout.on("data", (line) => console.log(line));
    // command.stderr.on("data", (line) => console.log(line));

    // const child = await command.spawn();
    // console.log("pid:", child.pid);
  };

  useEffect(() => {}, []);

  return (
    <div>
      Hello World
      <div>
        <div>我叫{stu.name}</div>
        <button onClick={() => dispatch(changeName("王武"))}>王武</button>
        <button onClick={() => dispatch(changeName("刘叔"))}>刘叔</button>
      </div>
      <Button onClick={save}>Save Test</Button>
      <Button onClick={test}>Test</Button>
    </div>
  );
}
