import { configureStore } from '@reduxjs/toolkit'
import stu from './stateManager/slice/stuSlice'

const store = configureStore({
    reducer: {
        stu: stu
    }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export default store