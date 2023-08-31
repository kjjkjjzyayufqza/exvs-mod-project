import { Button } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../../hooks";
import { changeId, changeName } from "../../stateManager/slice/stuSlice";
import { Store } from "tauri-plugin-store-api";

export default function MainPage() {
  const dispatch = useAppDispatch();
  const stu = useAppSelector((state) => state.stu);

  const test = async () => {
    const store = new Store(".settings.json");

    await store.set("app-theme", "dark");
    await store.save();

    const theme = await store.get("app-theme");
    console.log(theme);
  };
  return (
    <div>
      Hello World
      <div>
        <div>我叫{stu.name}</div>
        <button onClick={() => dispatch(changeName("王武"))}>王武</button>
        <button onClick={() => dispatch(changeName("刘叔"))}>刘叔</button>
      </div>
      <Button onClick={test}>Save Test</Button>
    </div>
  );
}
