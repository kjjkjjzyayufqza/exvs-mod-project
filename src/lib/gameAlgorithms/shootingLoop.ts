import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

export type ShootingEndReason = "hit" | "effectiveRange" | "lifetime" | "unknown";

export interface ShootingTrajectorySummary {
  totalFrames: number;
  hitFrame: number;
}

export interface ShootingTimeline {
  startupFrame: number;
  activeFrame: number;
  recoveryFrame: number;
  cooldownFrame: number;
  activeEndFrame: number;
  recoveryEndFrame: number;
  cooldownEndFrame: number;
}

export interface ShootingLoopShot<TTrajectory extends ShootingTrajectorySummary> {
  shotIndex: number;
  spawnFrame: number;
  hitFrame: number;
  endFrame: number;
  endReason: ShootingEndReason;
  trajectory: TTrajectory;
}

export interface ShootingLoopResult<TTrajectory extends ShootingTrajectorySummary> {
  timeline: ShootingTimeline;
  spawnFrames: number[];
  shots: Array<ShootingLoopShot<TTrajectory>>;
  ammoBeforeFire: number;
  ammoAfterFire: number;
}

export interface ClassifyShootingEndReasonArgs<
  TTrajectory extends ShootingTrajectorySummary,
> {
  trajectory: TTrajectory;
  bulletEntry: TypedParamEntry;
}

export interface SimulateShootingLoopArgs<
  TScenario,
  TTrajectory extends ShootingTrajectorySummary,
> {
  armsEntry: TypedParamEntry;
  bulletEntry: TypedParamEntry;
  scenario: TScenario;
  simulateTrajectory: (
    bulletEntry: TypedParamEntry,
    scenario: TScenario,
  ) => TTrajectory;
}

function n(entry: TypedParamEntry, key: string, fallback = 0): number {
  const value = entry[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function nonNegativeFrame(entry: TypedParamEntry, key: string): number {
  return Math.max(0, Math.round(n(entry, key)));
}

function positiveCount(entry: TypedParamEntry, key: string, fallback = 1): number {
  const value = Math.round(n(entry, key, fallback));
  return Math.max(1, value);
}

function lifetimeFrames(entry: TypedParamEntry, fallback: number): number {
  const lifetime = Math.abs(n(entry, "lifetime", fallback));
  return Math.max(1, Math.round(lifetime));
}

export function buildShootingTimeline(armsEntry: TypedParamEntry): ShootingTimeline {
  const startupFrame = nonNegativeFrame(armsEntry, "startupFrame");
  const activeFrame = nonNegativeFrame(armsEntry, "activeFrame");
  const recoveryFrame = nonNegativeFrame(armsEntry, "recoveryFrame");
  const cooldownFrame = nonNegativeFrame(armsEntry, "cooldownFrame");
  const activeEndFrame = startupFrame + activeFrame;
  const recoveryEndFrame = activeEndFrame + recoveryFrame;
  const cooldownEndFrame = recoveryEndFrame + cooldownFrame;

  return {
    startupFrame,
    activeFrame,
    recoveryFrame,
    cooldownFrame,
    activeEndFrame,
    recoveryEndFrame,
    cooldownEndFrame,
  };
}

export function classifyShootingEndReason<
  TTrajectory extends ShootingTrajectorySummary,
>({
  trajectory,
  bulletEntry,
}: ClassifyShootingEndReasonArgs<TTrajectory>): ShootingEndReason {
  if (trajectory.hitFrame >= 0 && trajectory.hitFrame < trajectory.totalFrames) {
    return "hit";
  }

  const expectedLifetime = lifetimeFrames(bulletEntry, trajectory.totalFrames);
  if (trajectory.totalFrames < expectedLifetime) {
    return n(bulletEntry, "effectiveRange") > 0 ? "effectiveRange" : "unknown";
  }

  return "lifetime";
}

export function simulateShootingLoop<
  TScenario,
  TTrajectory extends ShootingTrajectorySummary,
>({
  armsEntry,
  bulletEntry,
  scenario,
  simulateTrajectory,
}: SimulateShootingLoopArgs<TScenario, TTrajectory>): ShootingLoopResult<TTrajectory> {
  const timeline = buildShootingTimeline(armsEntry);
  const requestedShotCount = positiveCount(armsEntry, "bulletCountPerShot");
  const rawAmmo = Math.max(0, Math.round(n(armsEntry, "ammoCount", requestedShotCount)));
  const ammoBeforeFire = rawAmmo > 0 ? rawAmmo : requestedShotCount;
  const shotCount = Math.min(requestedShotCount, ammoBeforeFire);
  const interval = requestedShotCount > 1
    ? Math.max(1, Math.round(n(armsEntry, "firingIntervalFrame", 1)))
    : 0;

  const shots: Array<ShootingLoopShot<TTrajectory>> = [];
  for (let shotIndex = 0; shotIndex < shotCount; shotIndex += 1) {
    const spawnFrame = timeline.startupFrame + shotIndex * interval;
    const trajectory = simulateTrajectory(bulletEntry, scenario);
    const endReason = classifyShootingEndReason({ trajectory, bulletEntry });
    const travelFrames = endReason === "hit"
      ? Math.max(0, Math.round(trajectory.hitFrame))
      : Math.max(0, Math.round(trajectory.totalFrames));

    shots.push({
      shotIndex,
      spawnFrame,
      hitFrame: spawnFrame + Math.max(0, Math.round(trajectory.hitFrame)),
      endFrame: spawnFrame + travelFrames,
      endReason,
      trajectory,
    });
  }

  return {
    timeline,
    spawnFrames: shots.map((shot) => shot.spawnFrame),
    shots,
    ammoBeforeFire,
    ammoAfterFire: Math.max(0, ammoBeforeFire - shots.length),
  };
}
