import type {
  EffectFolderFileItem,
  EffectFolderHash,
  EffectFolderInventory,
  EfxbnControlLookupEntry,
  EfxbnControlReferenceSummary,
  EfxbnEffectSummary,
  EfxbnModelControlSummary,
} from "@/services/effectFolder/effectFolderService";
import type { EffectListItem } from "./effectFolderEditorUtils";

export type EffectFolderPreviewTarget = {
  effectIndex: number | null;
  modelHash: EffectFolderHash;
  modelPath: string;
  animationHash: EffectFolderHash | null;
  animationPath: string | null;
};

/**
 * The four texture-parameter slots a block can reference, in block layout order.
 *
 * `colorTextureParameterIndex[2]` and `uvTextureParameterIndex[2]` sit next to each other at
 * block offsets `0x150`-`0x15c`, so the flat `modelControlIndices` view of the same bytes
 * loses which map plays which role.
 */
export const EFXBN_TEXTURE_SLOTS = ["color0", "color1", "uv0", "uv1"] as const;

export type EfxbnTextureSlot = (typeof EFXBN_TEXTURE_SLOTS)[number];

export type EffectFolderPreviewTextureBinding = {
  effectIndex: number;
  slot: EfxbnTextureSlot;
  controlIndex: number;
  parameter: EfxbnModelControlSummary;
  file: EffectFolderFileItem | null;
};

export type EffectFolderPreviewPlan = {
  kind: "efxbn" | "model";
  key: string;
  targets: EffectFolderPreviewTarget[];
  localAnimationCount: number;
  unresolvedModelHashes: EffectFolderHash[];
  unresolvedAnimationHashes: EffectFolderHash[];
  unresolvedTextureHashes: EffectFolderHash[];
  textureParameters: EfxbnModelControlSummary[];
  textureBindings: EffectFolderPreviewTextureBinding[];
  localTextureCount: number;
  effectBlocks: EfxbnEffectSummary[];
  controlLookupEntries: EfxbnControlLookupEntry[];
};

/**
 * `hkImageAddressMode::Enum`, read from the engine's own name table at `0x1415CB9B0`.
 *
 * `sub_1401777A0` copies the authored `addressingMode` straight into the sampler's U, V and W
 * address modes, so this is an identity mapping rather than a remap. Over the shipped corpus the
 * bound texture parameters are 76% `wrap`, 17% `mirror`, 4.5% `border` and 3% `clamp`; `border`
 * uses the D3D default transparent-black border.
 */
export const EFXBN_ADDRESS_MODE = {
  wrap: 0,
  mirror: 1,
  clamp: 2,
  border: 3,
  mirrorOnce: 4,
} as const;

export type EfxbnUvTransform = {
  scale: [number, number];
  offset: [number, number];
};

export type EfxbnUvEvaluationOptions = {
  particleSeed?: number;
  modelParticle?: boolean;
};

function positiveModulo(value: number, divisor: number): number {
  if (divisor <= 0) return value;
  return ((value % divisor) + divisor) % divisor;
}

function seededUnit(seed: number, lane: number): number {
  let value = (seed ^ Math.imul(lane + 1, 0x9e3779b9)) >>> 0;
  value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
  return value / 4_294_967_296;
}

function authoredUvRange(values: readonly number[] | undefined, dimension: number): [number, number] {
  if (!values || values.length === 0 || values.some((value) => !Number.isFinite(value))) return [0, 1];
  const minimum = Math.min(...values) / dimension;
  const maximum = Math.max(...values) / dimension;
  return Math.abs(maximum - minimum) > Number.EPSILON ? [minimum, maximum] : [0, 1];
}

/**
 * Reconstructs the rectangular UV path emitted by efxSpawnParticleCommon3rd
 * and efxKineticParticle*3rd. Pattern 3 chooses a static random atlas cell;
 * pattern 2 advances the packed frame state; pattern 1 scrolls authored UVs.
 */
export function evaluateEfxbnUvTransform(
  parameter: EfxbnModelControlSummary | null | undefined,
  particleAge: number,
  options: EfxbnUvEvaluationOptions = {},
): EfxbnUvTransform {
  if (!parameter) return { scale: [1, 1], offset: [0, 0] };

  const textureWidth = Math.max(1, parameter.textureWidth);
  const textureHeight = Math.max(1, parameter.textureHeight);
  const seed = options.particleSeed ?? 0;
  const [authoredMinU, authoredMaxU] = authoredUvRange(parameter.uvU, textureWidth);
  const [authoredMinV, authoredMaxV] = authoredUvRange(parameter.uvV, textureHeight);
  let scaleU = authoredMaxU - authoredMinU;
  let scaleV = authoredMaxV - authoredMinV;
  let offsetU = authoredMinU;
  let offsetV = authoredMinV;

  if (parameter.uvPatternType === 1) {
    const scrollU = options.modelParticle
      ? particleAge * parameter.uvScrollModelSpeedU / textureWidth
      : particleAge * parameter.uvScrollSpeed * Math.cos(parameter.uvScrollDirection) / textureWidth;
    const scrollV = options.modelParticle
      ? particleAge * parameter.uvScrollModelSpeedV / textureHeight
      : particleAge * parameter.uvScrollSpeed * Math.sin(parameter.uvScrollDirection) / textureHeight;
    const limitU = parameter.uvScrollLimit / textureWidth;
    const limitV = parameter.uvScrollLimit / textureHeight;
    offsetU += limitU > 0 ? positiveModulo(scrollU, limitU) : scrollU;
    offsetV += limitV > 0 ? positiveModulo(scrollV, limitV) : scrollV;
  } else if (parameter.uvPatternType === 2 || parameter.uvPatternType === 3) {
    const frameWidth = Math.max(1, parameter.uvAnimationFrameWidth);
    const frameHeight = Math.max(1, parameter.uvAnimationFrameHeight);
    const frameCount = Math.max(1, parameter.uvAnimationFrameNum);
    const frameTime = Math.max(1, parameter.uvAnimationFrameTime);
    const columns = Math.max(
      1,
      parameter.uvAnimationFrameNumByLine || Math.floor(textureWidth / frameWidth),
    );
    const randomStart = Math.floor(seededUnit(seed, 3) * frameCount);
    const authoredStart = positiveModulo(Math.max(0, parameter.uvAnimationStartFrame - 1), frameCount);
    const startFrame = (parameter.textureSettingFlags & 0x2) !== 0 ? randomStart : authoredStart;
    const totalTicks = frameCount * frameTime;
    const initialTick = startFrame * frameTime;
    const elapsedTicks = Math.max(0, Math.floor(particleAge));
    const atlasFrame = parameter.uvPatternType === 3
      ? Math.floor(seededUnit(seed, 0) * frameCount)
      : Math.floor(
          ((parameter.textureSettingFlags & 0x1) !== 0
            ? positiveModulo(initialTick + elapsedTicks, totalTicks)
            : Math.min(initialTick + elapsedTicks, totalTicks - 1)) / frameTime,
        );
    const column = atlasFrame % columns;
    const row = Math.floor(atlasFrame / columns);
    scaleU = frameWidth / textureWidth;
    scaleV = frameHeight / textureHeight;
    offsetU = column * scaleU;
    offsetV = row * scaleV;
  }

  offsetU += (seededUnit(seed, 1) * 2 - 1) * parameter.uvRandomOffsetU / textureWidth;
  offsetV += (seededUnit(seed, 2) * 2 - 1) * parameter.uvRandomOffsetV / textureHeight;

  const reverseU = parameter.reverseU === 1 || (parameter.reverseU === 2 && seededUnit(seed, 4) < 0.5);
  const reverseV = parameter.reverseV === 1 || (parameter.reverseV === 2 && seededUnit(seed, 5) < 0.5);
  if (reverseU) {
    offsetU += scaleU;
    scaleU = -scaleU;
  }
  if (reverseV) {
    offsetV += scaleV;
    scaleV = -scaleV;
  }
  return { scale: [scaleU, scaleV], offset: [offsetU, offsetV] };
}

/**
 * The block's colour-map binding, i.e. `colorTextureParameterIndex[0]`.
 *
 * The other three slots carry the pass-2 colour map and the two UV-offset (distortion) maps,
 * so taking whichever binding happens to resolve first textures the block with the wrong
 * image. Across the 4,512 shipped `.efxbn` there are 453 blocks whose `color0` slot has no
 * colour map while a later slot does — `053gbftry_005tsient_001/0/0/150.efxbn` block 1 among
 * them — and every one of those rendered a distortion map as its colour.
 *
 * Returned regardless of whether the texture file resolved locally: the UV animation is
 * authored on the parameter, so it still applies when the image itself lives in another pack.
 */
export function resolveEfxbnColorMapBinding(
  plan: EffectFolderPreviewPlan,
  effectIndex: number,
): EffectFolderPreviewTextureBinding | null {
  return (
    plan.textureBindings.find(
      (binding) => binding.effectIndex === effectIndex && binding.slot === "color0",
    ) ?? null
  );
}

/**
 * The block's UV-offset (distortion) map, i.e. `uvTextureParameterIndex[0]`.
 *
 * Binding this slot is what sets draw-scheme bit `0x80` and puts the block on the ColorEx
 * variant, where `efxDrawFaceColorExPS` displaces the colour UV by
 * `offset.a * (offset.rg - 0.5) * distortion` and scales alpha by `offset.a`.
 */
export function resolveEfxbnUvOffsetMapBinding(
  plan: EffectFolderPreviewPlan,
  effectIndex: number,
): EffectFolderPreviewTextureBinding | null {
  return (
    plan.textureBindings.find(
      (binding) => binding.effectIndex === effectIndex && binding.slot === "uv0",
    ) ?? null
  );
}

export function evaluateEfxbnControl(
  reference: EfxbnControlReferenceSummary | undefined,
  entries: readonly EfxbnControlLookupEntry[],
  progress: number,
): number {
  if (!reference || reference.selector === 0) return 0;
  const start = Math.max(0, reference.lookupIndex);
  if (reference.selector === 1) {
    return entries[start]?.value ?? 0;
  }

  const sequence = entries
    .slice(start, start + reference.selector)
    .filter((entry) => Number.isFinite(entry.key) && Number.isFinite(entry.value));
  if (sequence.length === 0) return 0;
  const clampedProgress = Math.min(100, Math.max(0, progress));
  if (clampedProgress <= sequence[0].key) return sequence[0].value;
  const last = sequence[sequence.length - 1];
  if (clampedProgress >= last.key) return last.value;

  for (let index = 1; index < sequence.length; index += 1) {
    const right = sequence[index];
    if (clampedProgress > right.key) continue;
    const left = sequence[index - 1];
    const range = right.key - left.key;
    if (Math.abs(range) < Number.EPSILON) return right.value;
    const t = (clampedProgress - left.key) / range;
    return left.value + (right.value - left.value) * t;
  }
  return last.value;
}

function normalizedExtension(file: EffectFolderFileItem): string {
  return file.actualExt.trim().toLowerCase().replace(/^\./, "");
}

function firstAvailableFile(files: readonly EffectFolderFileItem[], extension: string): EffectFolderFileItem | null {
  return files.find((file) => !file.missing && normalizedExtension(file) === extension) ?? null;
}

function uniqueHashes(hashes: readonly EffectFolderHash[]): EffectFolderHash[] {
  const seen = new Set<number>();
  return hashes.filter((hash) => {
    if (seen.has(hash.signed)) return false;
    seen.add(hash.signed);
    return true;
  });
}

function compactRevisionSignature(value: unknown): string {
  const serialized = JSON.stringify(value) ?? "";
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function planKey(
  kind: EffectFolderPreviewPlan["kind"],
  sourcePath: string,
  targets: readonly EffectFolderPreviewTarget[],
  unresolvedModelHashes: readonly EffectFolderHash[],
  unresolvedAnimationHashes: readonly EffectFolderHash[],
  revisionSignature: string,
): string {
  return [
    kind,
    sourcePath,
    ...targets.map(
      (target) =>
        `${target.effectIndex ?? "model"}:${target.modelHash.signed}:${target.modelPath}:${target.animationHash?.signed ?? 0}:${target.animationPath ?? ""}`,
    ),
    ...unresolvedModelHashes.map((hash) => `model:${hash.signed}`),
    ...unresolvedAnimationHashes.map((hash) => `animation:${hash.signed}`),
    `revision:${revisionSignature}`,
  ].join("|");
}

export function buildEffectFolderPreviewPlan(
  item: EffectListItem,
  inventory: EffectFolderInventory,
): EffectFolderPreviewPlan | null {
  if (item.category === "textures" || item.category === "other") return null;

  if (item.category === "models") {
    const modelFile = firstAvailableFile(item.model.files, "numdlb");
    const targets: EffectFolderPreviewTarget[] = modelFile
      ? [
          {
            effectIndex: null,
            modelHash: item.model.hash,
            modelPath: modelFile.path,
            animationHash: null,
            animationPath: null,
          },
        ]
      : [];
    const unresolvedModelHashes = modelFile ? [] : [item.model.hash];
    return {
      kind: "model",
      key: planKey(
        "model",
        item.model.name,
        targets,
        unresolvedModelHashes,
        [],
        compactRevisionSignature(item.model),
      ),
      targets,
      localAnimationCount: 0,
      unresolvedModelHashes,
      unresolvedAnimationHashes: [],
      unresolvedTextureHashes: [],
      textureParameters: [],
      textureBindings: [],
      localTextureCount: 0,
      effectBlocks: [],
      controlLookupEntries: [],
    };
  }

  const summary = item.item.efxbn;
  const modelsByHash = new Map(inventory.models.map((model) => [model.hash.signed, model]));
  const localFiles = [
    ...inventory.otherFiles,
    ...inventory.models.flatMap((model) => model.files),
  ];
  const animationsByHash = new Map<number, EffectFolderFileItem>();
  for (const file of localFiles) {
    if (!file.missing && file.hash && normalizedExtension(file) === "nuanmb") {
      animationsByHash.set(file.hash.signed, file);
    }
  }

  const targets: EffectFolderPreviewTarget[] = [];
  const unresolvedModels: EffectFolderHash[] = [];
  const unresolvedAnimations: EffectFolderHash[] = [];

  for (const effect of summary?.effects ?? []) {
    const animationHash = effect.animationHash.signed === 0 ? null : effect.animationHash;
    const animationFile = animationHash ? animationsByHash.get(animationHash.signed) ?? null : null;
    if (animationHash && !animationFile) unresolvedAnimations.push(animationHash);

    if (effect.modelHash.signed === 0) continue;
    const model = modelsByHash.get(effect.modelHash.signed);
    const modelFile = model ? firstAvailableFile(model.files, "numdlb") : null;
    if (!modelFile) {
      unresolvedModels.push(effect.modelHash);
      continue;
    }

    targets.push({
      effectIndex: effect.index,
      modelHash: effect.modelHash,
      modelPath: modelFile.path,
      animationHash,
      animationPath: animationFile?.path ?? null,
    });
  }

  const unresolvedModelHashes = uniqueHashes(unresolvedModels);
  const unresolvedAnimationHashes = uniqueHashes(unresolvedAnimations);
  const texturesByHash = new Map(
    inventory.textures.flatMap((file) => (file.hash && !file.missing ? [[file.hash.signed, file] as const] : [])),
  );
  const textureBindings: EffectFolderPreviewTextureBinding[] = [];
  const unresolvedTextures: EffectFolderHash[] = [];
  for (const effect of summary?.effects ?? []) {
    const controlIndexes = [
      ...effect.colorTextureParameterIndex,
      ...effect.uvTextureParameterIndex,
    ];
    controlIndexes.forEach((controlIndex, slotOrdinal) => {
      if (controlIndex < 0) return;
      const parameter = summary?.modelControls[controlIndex];
      if (!parameter) return;
      const file = texturesByHash.get(parameter.colorMapHash.signed) ?? null;
      if (!file && parameter.colorMapHash.signed !== 0) unresolvedTextures.push(parameter.colorMapHash);
      textureBindings.push({
        effectIndex: effect.index,
        slot: EFXBN_TEXTURE_SLOTS[slotOrdinal],
        controlIndex,
        parameter,
        file,
      });
    });
  }
  const unresolvedTextureHashes = uniqueHashes(unresolvedTextures);
  const revisionSignature = compactRevisionSignature({
    summary,
    modelSlots: targets.map((target) => ({
      effectIndex: target.effectIndex,
      modelPath: target.modelPath,
      animationPath: target.animationPath,
    })),
    textureSlots: textureBindings.map((binding) => ({
      effectIndex: binding.effectIndex,
      slot: binding.slot,
      controlIndex: binding.controlIndex,
      fileIndex: binding.file?.fileIndex ?? null,
      path: binding.file?.path ?? null,
    })),
  });
  return {
    kind: "efxbn",
    key: planKey(
      "efxbn",
      item.item.path,
      targets,
      unresolvedModelHashes,
      unresolvedAnimationHashes,
      revisionSignature,
    ),
    targets,
    localAnimationCount: targets.filter((target) => target.animationPath !== null).length,
    unresolvedModelHashes,
    unresolvedAnimationHashes,
    unresolvedTextureHashes,
    textureParameters: summary?.textureParameters ?? [],
    textureBindings,
    localTextureCount: new Set(
      textureBindings.flatMap((binding) => (binding.file ? [binding.file.path.toLowerCase()] : [])),
    ).size,
    effectBlocks: summary?.effects ?? [],
    controlLookupEntries: summary?.controlLookupEntries ?? [],
  };
}
