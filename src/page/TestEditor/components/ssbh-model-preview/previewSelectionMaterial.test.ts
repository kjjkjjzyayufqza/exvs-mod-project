import { describe, expect, it } from "vitest";
import { createPreviewSelectionUniforms, previewSelectionOnBeforeCompile } from "./previewSelectionMaterial";

describe("previewSelectionOnBeforeCompile", () => {
  it("patches shaders that still use the opaque_fragment include", () => {
    const uniforms = createPreviewSelectionUniforms();
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: `#include <common>
void main() {
  vec4 diffuseColor = vec4(1.0);
  vec3 outgoingLight = vec3(1.0);
  #include <opaque_fragment>
}`,
    };

    previewSelectionOnBeforeCompile(uniforms)(shader);

    expect(shader.fragmentShader).toContain("uniform float uSelectionEnabled;");
    expect(shader.fragmentShader).toContain("vec3 selectionColor = outgoingLight;");
    expect(shader.fragmentShader).toContain("#include <opaque_fragment>");
    expect(shader.uniforms.uSelectionEnabled).toBe(uniforms.uSelectionEnabled);
    expect(shader.uniforms.uSelectionColor).toBe(uniforms.uSelectionColor);
    expect(shader.uniforms.uSelectionTime).toBe(uniforms.uSelectionTime);
  });

  it("throws when neither opaque_fragment nor direct final color output exists", () => {
    const uniforms = createPreviewSelectionUniforms();
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: `#include <common>
void main() {
  vec3 outgoingLight = vec3(1.0);
}`,
    };

    expect(() => previewSelectionOnBeforeCompile(uniforms)(shader)).toThrow(
      /failed to patch final fragment color/i,
    );
  });
});
