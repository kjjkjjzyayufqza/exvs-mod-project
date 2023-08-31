import { open } from "@tauri-apps/api/dialog";
import { useForm } from "@mantine/form";
import {
  Button,
  TextInput,
  Checkbox,
  Code,
  Text,
  Box,
  Grid,
  Group,
} from "@mantine/core";
import ReactJson from "react-json-view";

interface FromModel {
  inputFileUrl: string;
  outputFileUrl: string;
}

export default function ExtractFilePage() {
  const OpenFile = async () => {
    const selected = await open({});
    if (selected) {
      form.setFieldValue("inputFileUrl", selected as string);
    }
  };

  const OpenPath = async () => {
    const path = await open({ directory: true });
    if (path) {
      form.setFieldValue("outputFileUrl", path as string);
    }
  };

  const form = useForm<FromModel>({
    initialValues: {
      inputFileUrl: "",
      outputFileUrl: "",
    },
  });

  return (
    <div>
      <h1>Extract .FHM2D</h1>
      <div className="p-5">
        <Grid>
          <Grid.Col span={6}>
            <Box>
              <TextInput
                label="inputFileUrl"
                placeholder="inputFileUrl"
                {...form.getInputProps("inputFileUrl")}
              />
              <Group position="right" mt="md">
                <Button onClick={() => OpenFile()}>Select File</Button>
              </Group>
            </Box>
            <Box>
              <TextInput
                label="outputFileUrl"
                placeholder="outputFileUrl"
                mt="md"
                {...form.getInputProps("outputFileUrl")}
              />

              <Group position="right" mt="md">
                <Button onClick={() => OpenPath()}>Select Path</Button>
              </Group>
            </Box>
          </Grid.Col>
          <Grid.Col span={6}>
            <Text size="sm" weight={500} mt="xl">
              Form values:
            </Text>
            <Code block mt={5}>
              <ReactJson
                src={form.values}
                displayDataTypes={false}
                name={null}
              />
            </Code>
          </Grid.Col>
        </Grid>
      </div>
    </div>
  );
}
