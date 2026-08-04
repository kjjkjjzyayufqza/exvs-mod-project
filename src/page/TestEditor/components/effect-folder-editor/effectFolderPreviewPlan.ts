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

export type EffectFolderPreviewTextureBinding = {
  effectIndex: number;
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

function planKey(
  kind: EffectFolderPreviewPlan["kind"],
  sourcePath: string,
  targets: readonly EffectFolderPreviewTarget[],
  unresolvedModelHashes: readonly EffectFolderHash[],
  unresolvedAnimationHashes: readonly EffectFolderHash[],
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
      key: planKey("model", item.model.name, targets, unresolvedModelHashes, []),
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
    for (const controlIndex of effect.modelControlIndices ?? []) {
      if (controlIndex < 0) continue;
      const parameter = summary?.modelControls[controlIndex];
      if (!parameter) continue;
      const file = texturesByHash.get(parameter.colorMapHash.signed) ?? null;
      if (!file && parameter.colorMapHash.signed !== 0) unresolvedTextures.push(parameter.colorMapHash);
      textureBindings.push({ effectIndex: effect.index, controlIndex, parameter, file });
    }
  }
  const unresolvedTextureHashes = uniqueHashes(unresolvedTextures);
  return {
    kind: "efxbn",
    key: planKey("efxbn", item.item.path, targets, unresolvedModelHashes, unresolvedAnimationHashes),
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
