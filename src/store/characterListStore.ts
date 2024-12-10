import { create } from "zustand";
import { CharacterList, CharacterData } from "../models/characterList";

interface CharacterListStore {
  data: CharacterList | null;
  updateData: (data: CharacterList) => void;
  updateCharacterDataByIndex: (index: number, data: CharacterData) => void;
}

export const useCharacterListStore = create<CharacterListStore>()((set) => ({
  data: null,
  test: 0,
  updateData: (data) => set((state) => ({ data: data })),
  updateCharacterDataByIndex: (index, data) =>
    set((state: any) => ({
      data: {
        ...state.data,
        CharacterData: state.data?.CharacterData.map((e, i) => {
          if (i === index) {
            return data;
          }
          return e;
        }),
      },
    })),
}));
