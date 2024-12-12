import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { Resource, invoke } from '@tauri-apps/api/core';
import { useCounterStore } from "../../store/configStore";

export default function MainPage() {
  const { count, increment, decrement } = useCounterStore();
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

  useEffect(() => { }, []);

  return (
    <div>
      Hello World
      <div>
        <div>Count: {count}</div>
        <Button onClick={() => { increment() }}>increment</Button>
        <Button onClick={() => { decrement() }}>decrement</Button>
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
