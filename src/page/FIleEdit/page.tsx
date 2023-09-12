import { FileDropzone } from "../../components/FileDropzone";
import { FileWithPath } from "react-dropzone";
import { FC, useState } from "react";
import { bufferReader } from "../../module/reader";
import { Buffer } from "buffer";
import { CharacterData } from "../../models/characterList";
import {
  Card,
  Image,
  Text,
  Badge,
  Group,
  Container,
  Tabs,
  Grid,
  Button,
} from "@mantine/core";
import { open } from "@tauri-apps/api/dialog";
import {
  BaseDirectory,
  copyFile,
  readBinaryFile,
  writeBinaryFile,
} from "@tauri-apps/api/fs";
import { characterList } from "../../models/characterList";
export default function FileEdit() {
  const [data, setData] = useState<characterList>();
  const handleFile = async (file: FileWithPath) => {
    const fileData = await bufferReader(file);
    const data = new characterList(fileData);
    setData(data);
    console.log(data);
    let list: number[] = [];
    // data.UintIdData.map((e) => {
    //   list.push(e.Data.index);
    // });
    // // console.log(list.sort((a, b) => a - b));
    // console.log(list);
  };

  // const test = async () => {
  //   const path = (await open({})) as string;
  //   const contents = await readBinaryFile(path);
  //   console.log(path);

  //   const bufferData = Buffer.from(contents);
  //   const zakoCount = bufferData.readInt32LE(0x10);
  //   const commandCount = bufferData.readInt32LE(0x14);

  //   const headerLength = 0x20 + commandCount * 4 + commandCount * 0xc;

  //   let zakoId: number[] = [];
  //   for (let i = 0; i < zakoCount; i++) {
  //     zakoId.push(bufferData.readInt32LE(headerLength + i * 0x4));
  //   }

  //   let Id = 223; //超过400了，后面就不显示了
  //   let outDataBuffer: Buffer = Buffer.alloc(0);
  //   for (let i = 0; i < zakoCount; i++) {
  //     let zakoImageName = bufferData
  //       .readUIntBE(0x318 + i * 0x50, 0x4)
  //       .toString(16)
  //       .toUpperCase();
  //     // 补足前导零，确保输出始终为4位
  //     while (zakoImageName.length < 8) {
  //       zakoImageName = "0" + zakoImageName;
  //     }
  //     const firstPart =
  //       `00 00 00 00 00 00 00 00 00 00 00 00 6F 16 F3 92 ${zakoImageName} A0 19 01 00 00 00 00 00 03 00 00 00 02 00 00 00 03 00 00 00 ${zakoImageName} 04 00 00 00 29 E0 D8 54 00 00 00 00 00 00 00 00 73 F5 04 DB 01 00 00 00 AD 19 01 00 00 00 00 00 E4 63 02 C9 00 00 00 00 BA 19 01 00 00 00 00 00 C7 19 01 00 00 00 00 00 00 00 00 00 02 1A 01 00 00 00 00 00 1B 1A 01 00 00 00 00 00 00 00 00 00 28 1A 01 00 00 00 00 00 00 00 00 00 00 00 00 00 69 E0 F4 B1 32 1A 01 00 00 00 00 00 5E 1A 01 00 00 00 00 00 00 00 00 00 00 00 00 00 C0 EC E1 0C C0 EC E1 0C 01 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 00 00 71 1A 01 00 00 00 00 00 A6 B5 D7 BB`.replace(
  //         /\s/g,
  //         ""
  //       );
  //     const lastPart =
  //       `8A 1A 01 00 00 00 00 00 01 00 00 00 97 1A 01 00 00 00 00 00 34 4B 1E 03 00 00 00 00 A6 B5 D7 BB ${zakoImageName} 31 7A 71 57 A4 1A 01 00 00 00 00 00 15 85 D4 07 C0 1A 01 00 00 00 00 00 11 3D 7A 25 00 00 00 00 EA C9 2E B0 CD 1A 01 00 00 00 00 00 D8 48 13 EC 5B D0 90 19 03 F1 36 64 B6 EB 6A CA 02 00 00 00`.replace(
  //         /\s/g,
  //         ""
  //       );

  //     let firstPartByteArray = Buffer.from(firstPart, "hex");
  //     let IdData = Buffer.alloc(4);
  //     IdData.writeInt32LE(Id, 0);
  //     let lastPartByteArray = Buffer.from(lastPart, "hex");
  //     let outData = Buffer.concat([
  //       firstPartByteArray,
  //       IdData,
  //       lastPartByteArray,
  //     ]);
  //     Id += 1;
  //     outDataBuffer = Buffer.concat([outDataBuffer, outData]);
  //   }

  //   let outputIdBufferData: Buffer = Buffer.alloc(0x4 * zakoCount);
  //   for (let i = 0; i < zakoCount; i++) {
  //     outputIdBufferData.writeInt32LE(zakoId[i], i * 0x4);
  //   }

  //   await writeBinaryFile(`${path}_id`, outputIdBufferData);
  //   await writeBinaryFile(`${path}_data`, outDataBuffer);
  // };

  // const test2 = async () => {
  //   const path = (await open({})) as string;
  //   const contents = await readBinaryFile(path);
  //   console.log(path);

  //   const bufferData = Buffer.from(contents);
  //   const unitCount = bufferData.readInt32LE(0x10);

  //   let startNumber = 223;
  //   const startOffset = 0xa70;
  //   for (let i = 0; i < unitCount; i++) {
  //     if (i == startNumber) {
  //       const offset = startOffset + 0x13c * i;
  //       bufferData.writeInt32LE(i + 1, offset);
  //       startNumber++;
  //     }
  //   }
  //   await writeBinaryFile(`${path}_path`, bufferData);
  // };

  // const test3 = async () => {
  //   const path = (await open({})) as string;
  //   const contents = await readBinaryFile(path);
  //   console.log(path);

  //   const bufferData = Buffer.from(contents);
  //   const zakoCount = bufferData.readInt32LE(0x10);
  //   const commandCount = bufferData.readInt32LE(0x14);

  //   const headerLength = 0x20 + commandCount * 4 + commandCount * 0xc;
  //   let zakoId: number[] = [];
  //   for (let i = 0; i < zakoCount; i++) {
  //     zakoId.push(bufferData.readInt32LE(headerLength + i * 0x4));
  //   }
  //   let Id = 222;

  //   for (let i = 0; i < zakoCount; i++) {
  //     let zakoImageName = bufferData
  //       .readUIntBE(0x314 + i * 0x50, 0x4)
  //       .toString(16)
  //       .toUpperCase();
  //     // 补足前导零，确保输出始终为4位
  //     while (zakoImageName.length < 8) {
  //       zakoImageName = "0" + zakoImageName;
  //     }
  //     // 每两组反转
  //     let tempName = "";
  //     for (let k = 0; k < 4; k++) {
  //       if (k == 0) {
  //         tempName += zakoImageName[6] + zakoImageName[7];
  //       }
  //       if (k == 1) {
  //         tempName += zakoImageName[4] + zakoImageName[5];
  //       }
  //       if (k == 2) {
  //         tempName += zakoImageName[2] + zakoImageName[3];
  //       }
  //       if (k == 3) {
  //         tempName += zakoImageName[0] + zakoImageName[1];
  //       }
  //     }

  //     let fileName = `M:\\XB\\XB\\data\\x64\\dplcache_release\\0x${tempName}.fhm2d`;
  //     let moveFileName = `M:\\XB\\解包\\xb\\test_file\\${Id}`;
  //     await copyFile(fileName, moveFileName);
  //     Id++;
  //   }
  // };

  return (
    <Container>
      <Tabs defaultValue="test">
        <Tabs.List>
          <Tabs.Tab value="test">Gallery</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="test" pt="xs">
          <Grid>
            <Grid.Col span="auto">
              <FileDropzone
                fileReturn={(file) => {
                  handleFile(file[0]);
                }}
              />
            </Grid.Col>
            <Grid.Col span={10}>
              {data ? (
                <div>
                  {data.CharacterData.map((e, i) => {
                    return <UintIdCard key={i} data={e} />;
                  })}
                </div>
              ) : (
                <>No Data</>
              )}
              {/* <Button onClick={() => {}}>Test</Button> */}
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}

const UintIdCard: FC<{ data: CharacterData }> = ({ data }) => {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section>
        <Image
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/RedCat_8727.jpg/1200px-RedCat_8727.jpg"
          height={160}
          alt="Norway"
          className="object-cover"
        />
      </Card.Section>

      <Group position="apart" mt="md" mb="xs">
        <Text weight={500}>{data.CharacterId}</Text>
        <Badge color="pink" variant="light">
          On Sale
        </Badge>
      </Group>

      <Text size="sm" color="dimmed">
        With Fjord Tours you can explore more of the magical fjord landscapes
        with tours and activities on and around the fjords of Norway
      </Text>

      <Button variant="light" color="blue" fullWidth mt="md" radius="md">
        Book classic tour now
      </Button>
    </Card>
  );
};
