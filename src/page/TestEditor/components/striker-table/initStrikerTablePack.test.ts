import { describe, expect, it } from "vitest";
import { STRIKER_TABLE_PACK_HASH } from "./strikerTableDocument";
import { buildStrikerTableSourceFhm2dPath } from "./initStrikerTablePack";

describe("initStrikerTablePack", () => {
  it("builds the dplcache source path for 0xFEEB79F0", () => {
    expect(buildStrikerTableSourceFhm2dPath("E:\\OBHK0.3_v27\\data\\x64\\dplcache_release")).toBe(
      `E:\\OBHK0.3_v27\\data\\x64\\dplcache_release\\${STRIKER_TABLE_PACK_HASH}.fhm2d`,
    );
  });
});
