import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../store"; //引入类型

//声明状态进行接收
interface stuState {
  id: number;
  name: string;
  classes: string[];
}

const initialState: stuState = {
  id: 1,
  name: "老王",
  classes: [],
};

export const stuSlice = createSlice({
  name: "goodjob", //类似于命名空间，（取个名字）
  initialState, //引用你写的状态
  //reducers 里面包裹的是同步的方法
  reducers: {
    changeName: (state, action: PayloadAction<string>) => {
      state.name = action.payload;
    },
    changeId: (state, action: PayloadAction<number>) => {
      state.id = action.payload;
    },
  },

  //我们在extraReducers中放入的是异步的方法，我们在action中声明的TT方法可以在此处使用
  //在此处我们可以监听创建好的异步action，此处有三个取值是比较常用的
  // 1、fulfilled 成功之后需要做的操作
  // 2、pending 加载时需要做的操作
  // 3、rejected失败后需要做什么处理

  // extraReducers: (builder) => {
  //   builder.addCase(
  //     myApi.fulfilled,
  //     (state: stuState, { payload }: PayloadAction<number>) => {
  //       state.id = payload;
  //     }
  //   );
  // },
});

export const { changeName, changeId } = stuSlice.actions;
export const student = (state: RootState) => state.stu;
export default stuSlice.reducer;
