import type { MatlDataJson } from "./types";
import { ensureMatlDataSerdeFields } from "./daeSsbhTypes";
import mayaFixtureJson from "./fixtures/015gndmuc_004deltpl_001_body_normal__maya__.numatb.json";
import nustFixtureJson from "./fixtures/015gndmuc_004deltpl_001_body_normal__nust__.numatb.json";
import {
  ensureShaderLabelsOnEntries,
  stripTextureUrlStringsFromNumatbFile,
} from "./store/numatbTemplateStoreHelpers";

export function getExvsDefaultMayaProfileTemplate(): MatlDataJson {
  const raw = ensureMatlDataSerdeFields(mayaFixtureJson as MatlDataJson);
  return stripTextureUrlStringsFromNumatbFile(ensureShaderLabelsOnEntries(raw), {
    removeEmptyDiffuseCubeMap: true,
  });
}

export function getExvsDefaultNustProfileTemplate(): MatlDataJson {
  const raw = ensureMatlDataSerdeFields(nustFixtureJson as MatlDataJson);
  return stripTextureUrlStringsFromNumatbFile(ensureShaderLabelsOnEntries(raw), {
    removeEmptyDiffuseCubeMap: true,
  });
}
