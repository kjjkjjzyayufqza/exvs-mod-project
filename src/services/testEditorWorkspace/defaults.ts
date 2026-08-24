import {
  TEST_EDITOR_WORKSPACE_VERSION,
  type TestEditorWorkspaceDocument,
  type WorkspaceAssetRouteConfig,
  type WorkspaceAssetRouteId,
} from "./types";

function freezeRoute(route: WorkspaceAssetRouteConfig): WorkspaceAssetRouteConfig {
  return Object.freeze(route);
}

export const DEFAULT_TEST_EDITOR_WORKSPACE: TestEditorWorkspaceDocument = Object.freeze({
  version: TEST_EDITOR_WORKSPACE_VERSION,
  legacyReadFallback: true,
  assetRoutes: Object.freeze({
    "stage.model": freezeRoute({
      prefix: "001stage",
      kind: "fhm2d-pack",
      label: "Stage Model",
    }),
    "unit.model": freezeRoute({
      prefix: "002chara",
      kind: "fhm2d-pack",
      label: "Character Model",
    }),
    "unit.motion": freezeRoute({
      prefix: "003motion",
      kind: "fhm2d-pack",
      label: "Character Motion",
    }),
    "unit.effect": freezeRoute({
      prefix: "006effect",
      kind: "fhm2d-pack",
      label: "Character Effect",
    }),
    "unit.msc": freezeRoute({
      prefix: "040msc",
      kind: "fhm2d-pack",
      label: "Character MSC",
    }),
    "unit.param": freezeRoute({
      prefix: "041cpm",
      kind: "fhm2d-pack",
      label: "Character Param",
    }),
    "unit.sound": freezeRoute({
      prefix: "090sound",
      kind: "fhm2d-pack",
      label: "Character Sound",
    }),
    "list.character": freezeRoute({
      prefix: "012list",
      kind: "fhm2d-pack",
      label: "Character List",
    }),
    "list.series": freezeRoute({
      prefix: "012list",
      kind: "fhm2d-pack",
      label: "Series List",
    }),
    "list.stage": freezeRoute({
      prefix: "012list",
      kind: "fhm2d-pack",
      label: "Stage List",
    }),
    "list.navi": freezeRoute({
      prefix: "012list",
      kind: "fhm2d-pack",
      label: "Navi List",
    }),
    "gui.card-icons": freezeRoute({
      prefix: "009gui",
      kind: "fhm2d-pack",
      label: "Card Icons",
    }),
    "gui.series-icons": freezeRoute({
      prefix: "009gui",
      kind: "fhm2d-pack",
      label: "Series Icons",
    }),
    "gui.stage-icons": freezeRoute({
      prefix: "009gui",
      kind: "fhm2d-pack",
      label: "Stage Icons",
    }),
    "param.for-outgame": freezeRoute({
      prefix: "041cpm",
      kind: "fhm2d-pack",
      label: "For Outgame Params",
    }),
    "msc.workspace": freezeRoute({
      prefix: "040msc",
      kind: "fhm2d-pack",
      label: "MSC Workspace",
    }),
  }),
});

export const CHARACTER_ASSET_ROUTE_BY_FIELD: Readonly<Record<string, WorkspaceAssetRouteId>> =
  Object.freeze({
    Model: "unit.model",
    Effect: "unit.effect",
    Sound: "unit.sound",
    Param: "unit.param",
    Msc: "unit.msc",
    Motion: "unit.motion",
  });
