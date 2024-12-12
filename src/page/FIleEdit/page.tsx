import { FC, useState } from "react";
import { CharacterData, CharacterListOutPut } from "../../models/characterList";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, BaseDirectory, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { CharacterList } from "../../models/characterList";
import { Buffer } from "buffer";
import _ from "lodash";
export default function FileEdit() {
  const handleFile = async () => {
    const file = await open({});
    const fileData = await readFile(file?.path as string);
    const data = new CharacterList(Buffer.from(fileData));
    // setCharacterListData(data);

    console.log(data);
  };

  const handleOutputFile = async () => {
    const path = (await open({
      directory: true,
    })) as string;
    // if (characterListData) CharacterListOutPut(characterListData, path);
  };

  const handleAddNewCharacter = () => {
    const newCharacter = new CharacterData(Buffer.alloc(0x13c), Buffer.alloc(0x13c), 0);
    // setCharacterListData({ ...characterListData, CharacterData: [...(characterListData?.CharacterData as any), newCharacter] } as any);
  };

  return (
    <div>
    </div>
  );
}

const UnitIdCard: FC<{ data: CharacterData; onClick: (id: number) => void }> = ({ data, onClick }) => {
  return (
    <div>
      No Data
    </div>
  );
};

const UnitDetailInfoBox: FC<{
  data?: CharacterData;
  onChange: (data: CharacterData) => void;
}> = ({ data, onChange }) => {
  if (!data)
    return (
      <div>
        No Data
      </div>
    );
  return (
    <div>
      No Data
    </div>
  );
};
