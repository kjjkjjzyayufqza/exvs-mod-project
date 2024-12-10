import { Button } from "@/components/ui/button"
import { useAppSelector, useAppDispatch } from "../../hooks";
import { changeName } from "../../stateManager/slice/stuSlice";
import { useEffect, useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { Resource, invoke } from '@tauri-apps/api/core';

export default function MainPage() {
  const dispatch = useAppDispatch();
  const stu = useAppSelector((state) => state.stu);

  const save = async () => { };
  const get = async () => {
    const selected = await open({ multiple: false, directory: false });
    let timeList = []
    for (let i = 0; i < 1; i++) {
      console.log(`Test ${i + 1}`); // 输出测试次数
      const startTime = performance.now();
      const byte = await readFile(selected as any);
      const endTime = performance.now();
      const duration = endTime - startTime; // 计算持续时间
      timeList.push(duration)
    }
    // 计算平均时间
    const average = timeList.reduce((a, b) => a + b) / timeList.length;
    console.log(`Average time: ${average.toFixed(2)} ms`); // 输出平均时间
  };

  const invokeTest = async () => {
    const selected = await open({ multiple: false, directory: false });
    let timeList = []
    for (let i = 0; i < 1; i++) {
      console.log(`Test ${i + 1}`); // 输出测试次数
      const startTime = performance.now();
      const content = await invoke("read_file", { path: selected });
      const endTime = performance.now();
      const duration = endTime - startTime; // 计算持续时间
      timeList.push(duration)
    }
    // 计算平均时间
    const average = timeList.reduce((a, b) => a + b) / timeList.length;
    console.log(`Average time: ${average.toFixed(2)} ms`); // 输出平均时间
  }

  const [file, setFile] = useState<any>(null);

  const test = async () => { };

  useEffect(() => { }, []);

  return (
    <div>
      Hello World
      <div>
        <div>我叫{stu.name}</div>
        <button onClick={() => dispatch(changeName("王武"))}>王武</button>
        <button onClick={() => dispatch(changeName("刘叔"))}>刘叔</button>
      </div>
      <Button onClick={save}>
        Save Test
      </Button>
      <Button onClick={get}>Read file test</Button>
      <Button onClick={invokeTest}>Invoke Test</Button>
      <>{file}</>
    </div>
  );
}
