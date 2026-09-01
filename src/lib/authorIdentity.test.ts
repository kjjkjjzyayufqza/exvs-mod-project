import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_CANARY,
  AUTHOR_HANDLE,
  BUNDLE_ID,
  PRODUCT_NAME,
  SUPPORT_HOME,
} from "./authorIdentity";

describe("authorIdentity", () => {
  it("keeps the public identity strings stable", () => {
    expect(AUTHOR_HANDLE).toBe("kjjkjjzyayufqza");
    expect(PRODUCT_NAME).toBe("EXVS Mod Project");
    expect(BUNDLE_ID).toBe("com.kjjkjjzyayufqza.exvsmod");
    expect(SUPPORT_HOME).toBe("https://github.com/kjjkjjzyayufqza/exvs-mod-project");
    expect(ATTRIBUTION_CANARY).toContain(AUTHOR_HANDLE);
  });
});
