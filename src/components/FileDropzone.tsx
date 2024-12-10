import { Group, Text, useMantineTheme, rem } from "@mantine/core";
import { IconUpload, IconPhoto, IconX } from "@tabler/icons-react";
import { Dropzone, DropzoneProps, FileWithPath } from "@mantine/dropzone";
import { FC } from "react";
interface FileDropzoneModel {
  props?: Partial<DropzoneProps>;
  fileReturn: (files: FileWithPath[]) => void;
}
export const FileDropzone: FC<FileDropzoneModel> = ({ props, fileReturn }) => {
  const theme = useMantineTheme();
  return (
    <Dropzone
      onDrop={fileReturn}
      onReject={(files) => console.log("rejected files", files)}
      {...props}
      
    >
      <Group
        justify="center"
        gap="xl"
        mih={220}
        style={{ pointerEvents: "none" }}
      >
        <Dropzone.Accept>
          <IconUpload
            style={{
              width: rem(52),
              height: rem(52),
              color: "var(--mantine-color-blue-6)",
            }}
            stroke={1.5}
          />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX
            style={{
              width: rem(52),
              height: rem(52),
              color: "var(--mantine-color-red-6)",
            }}
            stroke={1.5}
          />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconPhoto
            style={{
              width: rem(52),
              height: rem(52),
              color: "var(--mantine-color-dimmed)",
            }}
            stroke={1.5}
          />
        </Dropzone.Idle>

        <div>
          <Text size="xl" inline>
            Drag images here or click to select files
          </Text>
          <Text size="sm" color="dimmed" inline mt={7}>
            Attach as files as you like
          </Text>
        </div>
      </Group>
    </Dropzone>
  );
};
