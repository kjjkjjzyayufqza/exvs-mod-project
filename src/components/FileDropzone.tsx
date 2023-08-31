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
        position="center"
        spacing="xl"
        style={{ minHeight: rem(220), pointerEvents: "none" }}
      >
        <Dropzone.Accept>
          <IconUpload
            size="3.2rem"
            stroke={1.5}
            color={
              theme.colors[theme.primaryColor][
                theme.colorScheme === "dark" ? 4 : 6
              ]
            }
          />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX
            size="3.2rem"
            stroke={1.5}
            color={theme.colors.red[theme.colorScheme === "dark" ? 4 : 6]}
          />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconPhoto size="3.2rem" stroke={1.5} />
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
