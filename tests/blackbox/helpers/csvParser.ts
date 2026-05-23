export type PlacementEntry = {
  vdkType: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  objectNumber: number | null;
  rawFields: string[];
};

export function parsePlacementCsv(content: string): PlacementEntry[] {
  return content
    .trim()
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const fields = line.split(",");
      const fieldMap = new Map<string, string>();
      for (let i = 0; i < fields.length - 1; i += 2) {
        fieldMap.set(fields[i], fields[i + 1]);
      }
      return {
        vdkType: fieldMap.get("VDK_TYPE") ?? "",
        positionX: parseFloat(fieldMap.get("VDK_POSITION_X") ?? "0"),
        positionY: parseFloat(fieldMap.get("VDK_POSITION_Y") ?? "0"),
        positionZ: parseFloat(fieldMap.get("VDK_POSITION_Z") ?? "0"),
        rotationX: parseFloat(fieldMap.get("VDK_ROTATION_X") ?? "0"),
        rotationY: parseFloat(fieldMap.get("VDK_ROTATION_Y") ?? "0"),
        rotationZ: parseFloat(fieldMap.get("VDK_ROTATION_Z") ?? "0"),
        scaleX: parseFloat(fieldMap.get("VDK_SCALE_X") ?? "1"),
        scaleY: parseFloat(fieldMap.get("VDK_SCALE_Y") ?? "1"),
        scaleZ: parseFloat(fieldMap.get("VDK_SCALE_Z") ?? "1"),
        objectNumber: fieldMap.has("VDK_OBJECTNUMBER")
          ? parseInt(fieldMap.get("VDK_OBJECTNUMBER")!, 10)
          : null,
        rawFields: fields,
      };
    });
}

export type GraphicParam = { key: string; value: string };

export function parseGraphicParamCsv(content: string): GraphicParam[] {
  return content
    .trim()
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const commaIdx = line.indexOf(",");
      if (commaIdx === -1) throw new Error(`Invalid graphic param line: ${line}`);
      return {
        key: line.slice(0, commaIdx),
        value: line.slice(commaIdx + 1),
      };
    });
}
