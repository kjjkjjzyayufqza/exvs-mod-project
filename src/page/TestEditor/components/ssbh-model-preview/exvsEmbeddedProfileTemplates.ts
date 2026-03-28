import type { NumatbFileJson } from "./daeSsbhTypes";
import mayaFixtureJson from "./fixtures/015gndmuc_004deltpl_001_body_normal__maya__.numatb.json";
import nustFixtureJson from "./fixtures/015gndmuc_004deltpl_001_body_normal__nust__.numatb.json";
import {
  ensureShaderLabelsOnEntries,
  stripTextureUrlStringsFromNumatbFile,
} from "./store/numatbTemplateStoreHelpers";

function asNumatbFileJson(value: unknown): NumatbFileJson {
  return value as NumatbFileJson;
}

export function getExvsDefaultMayaProfileTemplate(): NumatbFileJson {
  const raw = asNumatbFileJson(mayaFixtureJson);
  return stripTextureUrlStringsFromNumatbFile(ensureShaderLabelsOnEntries(raw));
}

export function getExvsDefaultNustProfileTemplate(): NumatbFileJson {
  const raw = asNumatbFileJson(nustFixtureJson);
  return stripTextureUrlStringsFromNumatbFile(ensureShaderLabelsOnEntries(raw));
}
