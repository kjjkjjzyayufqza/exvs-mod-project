import {
  buildEffectFolderPreviewPlan,
  evaluateEfxbnUvTransform,
  resolveEfxbnColorMapBinding,
} from "../../src/page/TestEditor/components/effect-folder-editor/effectFolderPreviewPlan";
import {
  EFXBN_PREVIEW_FPS,
  EFXBN_PREVIEW_FRAME_COUNT,
  resolveEfxbnEmitterPairs,
  simulateEfxbnEmitterPair,
} from "../../src/page/TestEditor/components/effect-folder-editor/efxbnSimulation";

type JsonObject = Record<string, any>;

function parseArgs(argv: readonly string[]): { frame: string; maxParticles: number } {
  const valueAfter = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const frame = valueAfter("--frame") ?? "auto";
  const parsedLimit = Number(valueAfter("--max-particles") ?? "512");
  const maxParticles = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(2_048, Math.floor(parsedLimit)))
    : 512;
  return { frame, maxParticles };
}

function normalizedPath(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "/").toLocaleLowerCase("en-US");
}

function selectFrame(plan: any, requested: string, maxParticles: number): number {
  if (requested !== "auto") {
    const parsed = Number(requested);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`Invalid --frame value: ${requested}`);
    }
    return parsed;
  }

  const pairs = resolveEfxbnEmitterPairs(plan);
  let bestFrame = 0;
  let bestCount = -1;
  for (let frame = 0; frame <= EFXBN_PREVIEW_FRAME_COUNT; frame += 1) {
    let count = 0;
    for (const pair of pairs) {
      if (count >= maxParticles) break;
      count += simulateEfxbnEmitterPair(pair, plan, frame, maxParticles - count).length;
    }
    if (count > bestCount) {
      bestFrame = frame;
      bestCount = count;
    }
  }
  return bestFrame;
}

function hashSummary(hash: any): JsonObject | null {
  if (!hash) return null;
  return { signed: hash.signed, unsigned: hash.unsigned, hex: hash.hex };
}

function buildScenePlan(
  envelope: JsonObject,
  requestedFrame: string,
  maxParticles: number,
): JsonObject {
  const inventory = envelope.inventory;
  if (!inventory) throw new Error("Input envelope has no inventory");
  const selectedPath = normalizedPath(envelope.efxbnPath);
  const inventoryItem = (inventory.efxbns ?? []).find(
    (item: JsonObject) => normalizedPath(item.path) === selectedPath,
  );
  const selectedItem = {
    ...(inventoryItem ?? {
      fileIndex: -1,
      fileType: "efxbn",
      actualExt: ".efxbn",
      fileUrl: envelope.efxbnPath,
      fileBaseName: envelope.efxbnPath,
      name: envelope.efxbnPath,
      path: envelope.efxbnPath,
      hash: null,
      unk2: null,
      missing: false,
    }),
    path: envelope.efxbnPath,
    efxbn: envelope.selectedEfxbn,
  };
  const previewPlan = buildEffectFolderPreviewPlan(
    { category: "efxbn", item: selectedItem } as any,
    inventory,
  );
  if (!previewPlan) throw new Error("Selected EFXBN did not produce a preview plan");

  const frame = selectFrame(previewPlan, requestedFrame, maxParticles);
  const pairs = resolveEfxbnEmitterPairs(previewPlan);
  const modelEffectIndices = new Set(
    previewPlan.targets.flatMap((target) =>
      target.effectIndex === null ? [] : [target.effectIndex],
    ),
  );
  let remaining = maxParticles;
  const particleGroups = pairs.map((pair) => {
    const particles = remaining > 0
      ? simulateEfxbnEmitterPair(pair, previewPlan, frame, remaining)
      : [];
    remaining -= particles.length;
    const binding = resolveEfxbnColorMapBinding(previewPlan, pair.target.index);
    const modelParticle = modelEffectIndices.has(pair.target.index);
    return {
      emitterEffectIndex: pair.emitter?.index ?? null,
      targetEffectIndex: pair.target.index,
      effectType: pair.target.effectType,
      blendState: pair.target.blendState,
      zWriteEnable: pair.target.zWriteEnable,
      zTestEnable: pair.target.zTestEnable,
      modelParticle,
      textureBinding: binding
        ? {
            effectIndex: binding.effectIndex,
            slot: binding.slot,
            controlIndex: binding.controlIndex,
            sourcePath: binding.file?.path ?? null,
            colorMapHash: hashSummary(binding.parameter.colorMapHash),
            parameter: binding.parameter,
          }
        : null,
      particles: particles.map((particle) => ({
        ...particle,
        uvTransform: evaluateEfxbnUvTransform(binding?.parameter, particle.age, {
          particleSeed: particle.id,
          modelParticle,
        }),
      })),
    };
  });

  const particleCount = particleGroups.reduce(
    (sum, group) => sum + group.particles.length,
    0,
  );
  return {
    schemaVersion: 1,
    generator: "efxbn-blender-preview",
    source: {
      effectRoot: envelope.effectRoot,
      structureJsonPath: envelope.structureJsonPath,
      efxbnPath: envelope.efxbnPath,
    },
    timing: {
      requestedFrame,
      frame,
      fps: EFXBN_PREVIEW_FPS,
      seconds: frame / EFXBN_PREVIEW_FPS,
      particleLimit: maxParticles,
    },
    summary: {
      effectBlockCount: previewPlan.effectBlocks.length,
      emitterPairCount: pairs.length,
      particleCount,
      localModelCount: previewPlan.targets.length,
      localTextureCount: previewPlan.localTextureCount,
      localAnimationCount: previewPlan.localAnimationCount,
    },
    previewPlan: {
      key: previewPlan.key,
      targets: previewPlan.targets,
      unresolvedModelHashes: previewPlan.unresolvedModelHashes.map(hashSummary),
      unresolvedAnimationHashes: previewPlan.unresolvedAnimationHashes.map(hashSummary),
      unresolvedTextureHashes: previewPlan.unresolvedTextureHashes.map(hashSummary),
    },
    effectBlocks: previewPlan.effectBlocks,
    particleGroups,
    warnings: [
      ...(inventory.warnings ?? []),
      ...(inventoryItem ? [] : ["Selected EFXBN was parsed directly because it was not listed in inventory."]),
    ],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const envelope = JSON.parse(input);
  const scenePlan = buildScenePlan(envelope, args.frame, args.maxParticles);
  process.stdout.write(`${JSON.stringify(scenePlan)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
