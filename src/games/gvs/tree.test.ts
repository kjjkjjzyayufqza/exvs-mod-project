/**
 * ================================================
 * EXVS Mod Project is authored by kjjkjjzyayufqza
 *   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line intact.
 * Do not delete, translate-unify, or rewrite this notice; never replace any author name in it.
 * GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza to the PS4 Gundam Versus
 *   build.
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * ================================================
 */

import { describe, expect, it } from "vitest";
import { defaultExpanded, flattenTree, listFolders, nodeAt, targetFolder } from "./tree";
import type { GvsMemberView, GvsNode } from "./types";

const fields = { nameHash: 0, kind: 0, reservedA: 0, link: 0, reservedB: 0 };
const root: GvsNode = {
  node: "folder",
  name: "",
  fields,
  children: [
    {
      node: "folder",
      name: "00",
      fields,
      children: [
        { node: "item", fields, file: 0 },
        { node: "item", fields, file: 1 },
      ],
    },
    { node: "item", fields, file: 2 },
  ],
};

const member = (index: number, path: string, kind: GvsMemberView["kind"]): GvsMemberView => ({
  index,
  path,
  typeId: 0,
  kind,
  label: kind,
  size: 16,
  exists: true,
  listings: 1,
});
const members = [
  member(0, "00/model.numshb", "mesh"),
  member(1, "00/body_col.nutexb", "nutexb"),
  member(2, "0.bscex", "msc"),
];

describe("GVS structure tree", () => {
  it("lists folders with readable labels", () => {
    expect(listFolders(root).map((folder) => [folder.label, folder.nodePath])).toEqual([
      ["/", []],
      ["00", [0]],
    ]);
  });

  it("flattens with expansion and indents children", () => {
    const collapsed = flattenTree(root, members, new Set(), "", "all");
    expect(collapsed.map((row) => row.name)).toEqual(["00", "0.bscex"]);
    const open = flattenTree(root, members, defaultExpanded(root), "", "all");
    expect(open.map((row) => [row.name, row.depth])).toEqual([
      ["00", 0],
      ["model.numshb", 1],
      ["body_col.nutexb", 1],
      ["0.bscex", 0],
    ]);
  });

  it("filters flat by query and kind", () => {
    const textures = flattenTree(root, members, new Set(), "", "nutexb");
    expect(textures.map((row) => row.name)).toEqual(["00/body_col.nutexb"]);
    const query = flattenTree(root, members, new Set(), "model", "all");
    expect(query.map((row) => row.nodePath)).toEqual([[0, 0]]);
  });

  it("resolves nodes and the folder new files go into", () => {
    expect(nodeAt(root, [0, 1])).toEqual({ node: "item", fields, file: 1 });
    expect(targetFolder(root, [0, 1])).toEqual([0]);
    expect(targetFolder(root, [0])).toEqual([0]);
    expect(targetFolder(root, undefined)).toEqual([]);
  });
});
