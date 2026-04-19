import { Vector3 } from "three";

export type PreviewSelectionUniforms = {
  uSelectionEnabled: { value: number };
  uSelectionColor: { value: Vector3 };
  uSelectionTime: { value: number };
};

export function createPreviewSelectionUniforms(): PreviewSelectionUniforms {
  return {
    uSelectionEnabled: { value: 0 },
    uSelectionColor: { value: new Vector3(1.0, 0.72, 0.18) },
    uSelectionTime: { value: 0 },
  };
}

export function previewSelectionOnBeforeCompile(uniforms: PreviewSelectionUniforms) {
  return (shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> }) => {
    const withUniforms = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform float uSelectionEnabled;
uniform vec3 uSelectionColor;
uniform float uSelectionTime;
`,
    );
    if (withUniforms === shader.fragmentShader) {
      throw new Error("previewSelectionMaterial: failed to inject uniforms after #include <common>");
    }
    shader.fragmentShader = withUniforms;

    const selectionPatch = `vec3 selectionColor = outgoingLight;
if (uSelectionEnabled > 0.5) {
  float ndv = max(dot(normalize(geometryNormal), normalize(geometryViewDir)), 0.0);
  float fresnel = pow(max(0.0, 1.0 - ndv), 2.4);
  float sweep = 0.5 + 0.5 * sin(uSelectionTime * 2.35 + vViewPosition.y * 0.06);
  selectionColor += uSelectionColor * (0.22 + fresnel * 0.45 + sweep * 0.12);
  selectionColor = mix(selectionColor, selectionColor + uSelectionColor * 0.18, 0.45);
}
outgoingLight = selectionColor;`;

    let withHighlight = shader.fragmentShader;
    if (withHighlight.includes("#include <opaque_fragment>")) {
      withHighlight = withHighlight.replace(
        "#include <opaque_fragment>",
        `${selectionPatch}
#include <opaque_fragment>`,
      );
    } else {
      withHighlight = withHighlight.replace(
        "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
        `${selectionPatch}
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,
      );
    }
    if (withHighlight === shader.fragmentShader) {
      throw new Error("previewSelectionMaterial: failed to patch final fragment color");
    }
    shader.fragmentShader = withHighlight;

    shader.uniforms.uSelectionEnabled = uniforms.uSelectionEnabled;
    shader.uniforms.uSelectionColor = uniforms.uSelectionColor;
    shader.uniforms.uSelectionTime = uniforms.uSelectionTime;
  };
}
