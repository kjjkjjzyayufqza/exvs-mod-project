import { FC, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, BaseDirectory, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { Buffer } from "buffer";
import _ from "lodash";
import { Button } from "../../components/ui/button";
import { CharacterDataOB, CharacterListOB } from "../../models/characterListOB";
export default function UnitEdit() {
  const [characterListData, setCharacterListData] = useState<CharacterListOB>();
  const [newCharacter, setNewCharacter] = useState<CharacterDataOB>();

  const handleFile = async () => {
    const file = await open({});
    const fileData = await readFile(file as string);
    const data = new CharacterListOB(Buffer.from(fileData));
    setCharacterListData(data);

    console.log(data);
  };

  const handleOutputFile = async () => {
    const path = (await open({
      directory: true,
    })) as string;
    // if (characterListData) CharacterListOutPut(characterListData, path);
  };

  const handleAddNewCharacter = () => {
    const newCharacter = new CharacterDataOB(Buffer.alloc(0x13c), Buffer.alloc(0x13c), 0);
    setNewCharacter(newCharacter);
  };

  return (
    <div>
      <Button onClick={handleFile}>Open File</Button>
      <Button onClick={handleOutputFile}>Output File</Button>
      <Button onClick={handleAddNewCharacter}>Add New Character</Button>
      <UnitIdCard data={newCharacter} onClick={() => { }} />
      <UnitDetailInfoBox data={newCharacter} onChange={() => { }} />
    </div>
  );
}

const UnitIdCard: FC<{ data?: CharacterDataOB; onClick: (id: number) => void }> = ({ data, onClick }) => {
  return (
    <div>
      No Data
    </div>
  );
};

const UnitDetailInfoBox: FC<{
  data?: CharacterDataOB;
  onChange: (data: CharacterDataOB) => void;
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
