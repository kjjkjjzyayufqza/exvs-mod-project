import { Button } from "@chakra-ui/react";
import { Container, FileInput, Group, Tabs } from "@mantine/core";
import { FileDropzone } from "../../components/FileDropzone";
import { FileWithPath } from "react-dropzone";
import { useRef } from "react";
import { bufferReader } from "../../module/reader";
import { unitSelectList } from "../../module/List/unitSelectList";

export default function FileEdit() {
  const handleFile = async (file: FileWithPath) => {
    const fileData = await bufferReader(file);
    unitSelectList(fileData)
  };

  return (
    <Container>
      <Tabs defaultValue="test">
        <Tabs.List>
          <Tabs.Tab value="test">Gallery</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="test" pt="xs">
          <div className="w-40">
          <FileDropzone
            fileReturn={(file) => {
              handleFile(file[0]);
            }}
          />
          </div>
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
