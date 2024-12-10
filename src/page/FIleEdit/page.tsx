import { FC, useState } from "react";
import { CharacterData, CharacterListOutPut } from "../../models/characterList";
import { Card, Image, Text, Badge, Group, Container, Tabs, Grid, Button, Box, TextInput, Flex, SimpleGrid } from "@mantine/core";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, BaseDirectory, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { CharacterList } from "../../models/characterList";
import { Buffer } from "buffer";
import { useCharacterListStore } from "../../store/characterListStore";
import _ from "lodash";
export default function FileEdit() {
  const characterListData = useCharacterListStore((state) => state.data);
  const setCharacterListData = useCharacterListStore((state) => state.updateData);
  const updateCharacterDataByIndex = useCharacterListStore((state) => state.updateCharacterDataByIndex);
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number>();
  const handleFile = async () => {
    const file = await open({});
    const fileData = await readFile(file?.path as string);
    const data = new CharacterList(Buffer.from(fileData));
    setCharacterListData(data);

    console.log(data);
  };

  const handleOutputFile = async () => {
    const path = (await open({
      directory: true,
    })) as string;
    if (characterListData) CharacterListOutPut(characterListData, path);
  };

  const handleAddNewCharacter = () => {
    const newCharacter = new CharacterData(Buffer.alloc(0x13c), Buffer.alloc(0x13c), 0);
    setCharacterListData({ ...characterListData, CharacterData: [...(characterListData?.CharacterData as any), newCharacter] } as any);
  };

  return (
    <Box>
      <Tabs defaultValue="test">
        <Tabs.List>
          <Tabs.Tab value="test">Unit</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="test" pt="xs">
          <Grid>
            <Grid.Col span={2}>
              <Button onClick={handleFile}>Select File</Button>
              <Button onClick={handleOutputFile}>Export</Button>
            </Grid.Col>
            <Grid.Col span={2}>
              <TextInput label="Search By Id" mb={10} />
              <Button onClick={handleAddNewCharacter}>Add New</Button>
              <Button onClick={()=>{
                console.log(characterListData?.CharacterData.length)
              }}>Log</Button>
              <Text>Total : {characterListData?.CharacterData.length}</Text>
              <SimpleGrid
                cols={1}
                spacing="xs"
                verticalSpacing="xs"
                p={3}
                style={{
                  overflowY: "auto",
                  maxHeight: "calc(100vh - 200px)",
                }}
              >
                {characterListData ? (
                  characterListData.CharacterData.map((e, i) => {
                    return (
                      <UnitIdCard
                        key={i}
                        data={e}
                        onClick={(id) => {
                          setSelectedCharacterIndex(i);
                        }}
                      />
                    );
                  })
                ) : (
                  <>No Data</>
                )}
                {/* <Button onClick={() => {}}>Test</Button> */}
              </SimpleGrid>
            </Grid.Col>
            <Grid.Col span={8}>
              <UnitDetailInfoBox
                data={characterListData?.CharacterData?.[selectedCharacterIndex!]}
                onChange={(data) => {
                  const index = selectedCharacterIndex!;
                  updateCharacterDataByIndex(index, data);
                }}
              />
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

const UnitIdCard: FC<{ data: CharacterData; onClick: (id: number) => void }> = ({ data, onClick }) => {
  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      onClick={() => {
        onClick(data.CharacterId);
      }}
      style={
        {
          // outline: selectedId == data.CharacterId ? "3px solid #ff9d07" : "",
        }
      }
    >
      <Group mt="md" mb="xs">
        <Text>{data.CharacterId}</Text>
        <Badge color="pink" variant="light">
          Unit
        </Badge>
      </Group>
    </Card>
  );
};

const UnitDetailInfoBox: FC<{
  data?: CharacterData;
  onChange: (data: CharacterData) => void;
}> = ({ data, onChange }) => {
  if (!data)
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        No Data
      </Card>
    );
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Grid>
        <Grid.Col span={12}>
          <TextInput
            label="CharacterId"
            description="Input description"
            placeholder="Input placeholder"
            value={data?.CharacterId}
            onChange={(e) => {
              onChange({ ...data, CharacterId: parseFloat(e.target.value) });
            }}
          />
          <TextInput
            label="CharacterId_Unique"
            description="Input description"
            placeholder="Input placeholder"
            value={data?.CharacterId_Unique}
            onChange={(e) => {
              onChange({ ...data, CharacterId_Unique: parseFloat(e.target.value) });
            }}
          />
          <TextInput
            label="MS_card_icon_index"
            description="Input description"
            placeholder="Input placeholder"
            value={data?.MS_card_icon_index}
            onChange={(e) => {
              onChange({ ...data, MS_card_icon_index: parseFloat(e.target.value) });
            }}
          />
          <Text>CharacterId_Unique: {data?.CharacterId_Unique}</Text>
          <Text>MS_card_icon_index: {data?.MS_card_icon_index}</Text>
          <Text>CharacterName: {JSON.stringify(data?.CharacterNameOffset.StringBufferData)}</Text>
          <Text>UnkStringOffset1: {JSON.stringify(data?.UnkStringOffset1.StringBufferData)}</Text>
          <Text>UnkStringOffset2: {JSON.stringify(data?.UnkStringOffset2.StringBufferData)}</Text>
          <Text>UnkStringOffset3: {JSON.stringify(data?.UnkStringOffset3.StringBufferData)}</Text>
          <Text>UnkStringOffset4: {JSON.stringify(data?.UnkStringOffset4.StringBufferData)}</Text>
          <Text>UnkStringOffset5: {JSON.stringify(data?.UnkStringOffset5.StringBufferData)}</Text>
          <Text>UnkStringOffset6: {JSON.stringify(data?.UnkStringOffset6.StringBufferData)}</Text>
          <Text>UnkStringOffset7: {JSON.stringify(data?.UnkStringOffset7.StringBufferData)}</Text>
          <Text>UnkStringOffset8: {JSON.stringify(data?.UnkStringOffset8.StringBufferData)}</Text>
          <Text>UnkStringOffset9: {JSON.stringify(data?.UnkStringOffset9.StringBufferData)}</Text>
          <Text>UnkStringOffset10: {JSON.stringify(data?.UnkStringOffset10.StringBufferData)}</Text>
          <Text>UnkStringOffset11: {JSON.stringify(data?.UnkStringOffset11.StringBufferData)}</Text>
          <Text>UnkStringOffset12: {JSON.stringify(data?.UnkStringOffset12.StringBufferData)}</Text>
          <Text>UnkStringOffset13: {JSON.stringify(data?.UnkStringOffset13.StringBufferData)}</Text>
          <Text>UnkStringOffset14: {JSON.stringify(data?.UnkStringOffset14.StringBufferData)}</Text>
        </Grid.Col>
      </Grid>
    </Card>
  );
};
