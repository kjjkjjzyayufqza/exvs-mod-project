interface Item {
  type: string;
  unk1: string;
  fileIndex: number;
  unk2: string;
  unk3: number;
}

interface Folder {
  type: string;
  unk1: string;
  folderCount: number;
  unk2: string;
  unk3: number;
}

interface EndMark {
  type: string;
  endMarkCount: number;
}

type Entry = Item | Folder | EndMark;

export function generateFileStructure(data: Entry[]): string {
  let result = "";

  const stack: { name: string; count: number }[] = [];
  let currentIndex = -1;

  data.forEach((entry) => {
    if (entry.type === "Folder") {
      currentIndex++;
      const folder = entry as Folder;
      const folderName = `Folder${currentIndex}`;
      const folderCount = folder.folderCount;
      stack.push({ name: folderName, count: folderCount });
    } else if (entry.type === "Item") {
      const item = entry as Item;
      const folderName = stack[stack.length - 1].name;
      const fileIndex = item.fileIndex;
      result += `- Item ${fileIndex} (File: ${folderName}/${fileIndex}.bin)\n`;
    } else if (entry.type === "EndMark") {
      const endMark = entry as EndMark;
      const endMarkCount = endMark.endMarkCount;
      result += `- EndMark (endMarkCount: ${endMarkCount})\n`;
      for (let i = 0; i < endMarkCount; i++) {
        stack.pop();
      }
    }
  });

  return result;
}

