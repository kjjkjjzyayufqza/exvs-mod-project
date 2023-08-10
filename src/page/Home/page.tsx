import { Button, Card, CardBody, Container } from "@chakra-ui/react";
import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import Buffer from "buffer";
import { NutexbCard } from "./NutexbCard";

const baseStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "20px",
  borderWidth: 2,
  borderRadius: 2,
  borderColor: "#eeeeee",
  borderStyle: "dashed",
  backgroundColor: "#fafafa",
  color: "#bdbdbd",
  outline: "none",
  transition: "border .24s ease-in-out",
};

const focusedStyle = {
  borderColor: "#2196f3",
};

const acceptStyle = {
  borderColor: "#00e676",
};

const rejectStyle = {
  borderColor: "#ff1744",
};

export default function HomePage() {
  const [nutexbCardList, setNutexbCardList] = useState<ReactNode[]>([]);
  const onDrop = useCallback((acceptedFiles: any) => {
    setNutexbCardList(
      acceptedFiles.map((e: any, i: number) => {
        return <NutexbCard key={i} file={e} />;
      })
    );
  }, []);
  const { getRootProps, getInputProps, isFocused, isDragAccept, isDragReject } =
    useDropzone({
      accept: {},
      onDrop,
    });

  const style = useMemo<any>(
    () => ({
      ...baseStyle,
      ...(isFocused ? focusedStyle : {}),
      ...(isDragAccept ? acceptStyle : {}),
      ...(isDragReject ? rejectStyle : {}),
    }),
    [isFocused, isDragAccept, isDragReject]
  );

  useEffect(() => {}, []);

  return (
    <Container className="justify-between items-center flex flex-col p-24">
      <div></div>

      <div className="container gap-5">
        <div className="text-4xl font-black text-gray-900 dark:text-white">
          NUTEXB to DDS
        </div>
        <div>
          <div
            {...getRootProps({ style, onClick: (evt) => evt.preventDefault() })}
          >
            <input {...getInputProps()} />
            <p>Drag 'n' drop some files here, or click to select files</p>
          </div>
          <div className="pt-3 grid gap-4">{nutexbCardList}</div>
        </div>
        <Button>Cov</Button>
      </div>
      <div></div>
    </Container>
  );
}
