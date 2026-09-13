import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cjk =
  /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;

export function assertEnglishReleaseNotes(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Release notes are empty");
  }
  if (cjk.test(text)) {
    throw new Error(
      "Release notes must be English only. Remove CJK from -NotesFile or git log subjects.",
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--help") {
      console.log("Usage: node assert-english-release-notes.mjs <notes-file>");
    } else if (args.length !== 1) {
      throw new Error("Usage: node assert-english-release-notes.mjs <notes-file>");
    } else {
      assertEnglishReleaseNotes(readFileSync(args[0], "utf8"));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
