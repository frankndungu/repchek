import type { RepEvent } from "./repCounter";

export interface SetTarget {
  sets: number;
  reps: number;
}

export interface RepRecord {
  durationMs: number;
  faults: string[];
  // When the rep started, counted from the start of its set (the moment
  // the gate armed). The set clip starts at that same moment, so this is
  // also where the rep is in the clip.
  atMs: number;
}

export interface SetRecord {
  set: number;
  reps: RepRecord[];
  partials: number;
}

export interface SessionRecord {
  id: string;
  exerciseId: string;
  exerciseName: string;
  startedAt: string;
  endedAt: string;
  target: SetTarget;
  weightKg: number | null;
  sets: SetRecord[];
}

export interface SessionCheckpoint {
  version: 1;
  id: string;
  startedAt: string;
  target: SetTarget;
  restTimeoutMs: number;
  currentSet: number;
  completed: SetRecord[];
  currentReps: RepRecord[];
  currentPartials: number;
}

export type SessionEvent =
  | { type: "set-complete"; record: SetRecord }
  | { type: "session-complete"; sets: SetRecord[] };

const DEFAULT_REST_TIMEOUT_MS = 20000;

export class SessionTracker {
  private target: SetTarget;
  private restTimeoutMs: number;
  private currentSet: number;
  private repRecords: RepRecord[];
  private partialsInSet: number;
  private lastRepAt: number | null;
  private setStartedAt: number | null;
  private completed: SetRecord[];
  private finished: boolean;

  constructor(target: SetTarget, restTimeoutMs = DEFAULT_REST_TIMEOUT_MS) {
    this.target = target;
    this.restTimeoutMs = restTimeoutMs;
    this.currentSet = 1;
    this.repRecords = [];
    this.partialsInSet = 0;
    this.lastRepAt = null;
    this.setStartedAt = null;
    this.completed = [];
    this.finished = false;
  }

  get set(): number {
    return this.currentSet;
  }

  get totalSets(): number {
    return this.target.sets;
  }

  get reps(): number {
    return this.repRecords.length;
  }

  get isResting(): boolean {
    return (
      !this.finished &&
      this.repRecords.length === 0 &&
      this.completed.length > 0
    );
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get records(): SetRecord[] {
    return this.completed;
  }

  // Call when the gate arms. Only the first call in a set counts, so
  // re-arming after losing the person mid-set does not move the start.
  startSet(nowMs: number): void {
    this.setStartedAt ??= nowMs;
  }

  onRepEvent(
    event: RepEvent,
    faults: string[],
    nowMs: number,
  ): SessionEvent | null {
    if (this.finished) return null;

    if (event.type === "partial") {
      this.partialsInSet += 1;
      return null;
    }

    // The rep started durationMs ago.
    const repStartedAt = nowMs - event.durationMs;
    this.repRecords.push({
      durationMs: event.durationMs,
      faults,
      atMs: Math.max(0, repStartedAt - (this.setStartedAt ?? repStartedAt)),
    });
    this.lastRepAt = nowMs;

    if (this.repRecords.length >= this.target.reps) {
      return this.closeSet();
    }
    return null;
  }

  tick(nowMs: number): SessionEvent | null {
    if (
      this.finished ||
      this.repRecords.length === 0 ||
      this.lastRepAt === null
    )
      return null;
    if (nowMs - this.lastRepAt >= this.restTimeoutMs) {
      return this.closeSet();
    }
    return null;
  }

  finish(): SetRecord[] {
    if (!this.finished) {
      if (this.repRecords.length > 0) {
        this.completed.push(this.snapshotSet());
      }
      this.finished = true;
    }
    return this.completed;
  }

  toRecord(meta: {
    exerciseId: string;
    exerciseName: string;
    startedAt: Date;
    weightKg: number | null;
  }): SessionRecord {
    const sets = this.finish();
    return {
      id: meta.startedAt.toISOString(),
      exerciseId: meta.exerciseId,
      exerciseName: meta.exerciseName,
      startedAt: meta.startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      target: this.target,
      weightKg: meta.weightKg,
      sets,
    };
  }

  exportCheckpoint(identity: {
    id: string;
    startedAt: Date;
  }): SessionCheckpoint {
    if (this.finished) {
      throw new Error("Cannot checkpoint a finished session");
    }
    const startedAt = identity.startedAt.toISOString();
    if (!identity.id || identity.id !== startedAt) {
      throw new TypeError("Session checkpoint identity is invalid");
    }

    const checkpoint: SessionCheckpoint = {
      version: 1,
      id: identity.id,
      startedAt,
      target: { ...this.target },
      restTimeoutMs: this.restTimeoutMs,
      currentSet: this.currentSet,
      completed: this.completed.map(copySetRecord),
      currentReps: this.repRecords.map(copyRepRecord),
      currentPartials: this.partialsInSet,
    };
    return validateCheckpoint(checkpoint);
  }

  static restoreCheckpoint(value: unknown): SessionTracker {
    const checkpoint = validateCheckpoint(value);
    const tracker = new SessionTracker(
      { ...checkpoint.target },
      checkpoint.restTimeoutMs,
    );
    tracker.currentSet = checkpoint.currentSet;
    tracker.completed = checkpoint.completed.map(copySetRecord);
    tracker.repRecords = checkpoint.currentReps.map(copyRepRecord);
    tracker.partialsInSet = checkpoint.currentPartials;
    return tracker;
  }

  private snapshotSet(): SetRecord {
    return {
      set: this.currentSet,
      reps: this.repRecords,
      partials: this.partialsInSet,
    };
  }

  private closeSet(): SessionEvent {
    const record = this.snapshotSet();
    this.completed.push(record);

    this.repRecords = [];
    this.partialsInSet = 0;
    this.lastRepAt = null;
    this.setStartedAt = null;

    if (this.currentSet >= this.target.sets) {
      this.finished = true;
      return { type: "session-complete", sets: this.completed };
    }

    this.currentSet += 1;
    return { type: "set-complete", record };
  }
}

function copyRepRecord(rep: RepRecord): RepRecord {
  return { ...rep, faults: [...rep.faults] };
}

function copySetRecord(set: SetRecord): SetRecord {
  return {
    ...set,
    reps: set.reps.map(copyRepRecord),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRepRecord(value: unknown): value is RepRecord {
  if (!isObject(value)) return false;
  return (
    typeof value.durationMs === "number" &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0 &&
    Array.isArray(value.faults) &&
    value.faults.every((fault) => typeof fault === "string") &&
    typeof value.atMs === "number" &&
    Number.isFinite(value.atMs) &&
    value.atMs >= 0
  );
}

function isSetRecord(
  value: unknown,
  expectedSet: number,
  target: SetTarget,
): value is SetRecord {
  if (!isObject(value)) return false;
  return (
    value.set === expectedSet &&
    Array.isArray(value.reps) &&
    value.reps.length > 0 &&
    value.reps.length <= target.reps &&
    value.reps.every(isRepRecord) &&
    isNonNegativeInteger(value.partials)
  );
}

function validateCheckpoint(value: unknown): SessionCheckpoint {
  if (!isObject(value) || value.version !== 1) {
    throw new TypeError("Unsupported or invalid session checkpoint version");
  }

  const { id, startedAt, target, restTimeoutMs, currentSet, completed } =
    value;
  const currentReps = value.currentReps;
  const currentPartials = value.currentPartials;
  if (
    typeof id !== "string" ||
    !id ||
    typeof startedAt !== "string" ||
    !Number.isFinite(Date.parse(startedAt)) ||
    new Date(startedAt).toISOString() !== startedAt ||
    id !== startedAt
  ) {
    throw new TypeError("Session checkpoint identity is invalid");
  }
  if (
    !isObject(target) ||
    !isPositiveInteger(target.sets) ||
    !isPositiveInteger(target.reps)
  ) {
    throw new TypeError("Session checkpoint target is invalid");
  }
  if (
    typeof restTimeoutMs !== "number" ||
    !Number.isFinite(restTimeoutMs) ||
    restTimeoutMs <= 0
  ) {
    throw new TypeError("Session checkpoint rest timeout is invalid");
  }

  const validTarget: SetTarget = { sets: target.sets, reps: target.reps };
  if (
    !isPositiveInteger(currentSet) ||
    currentSet > validTarget.sets ||
    !Array.isArray(completed) ||
    completed.length !== currentSet - 1 ||
    !completed.every((set, index) =>
      isSetRecord(set, index + 1, validTarget),
    ) ||
    !Array.isArray(currentReps) ||
    currentReps.length >= validTarget.reps ||
    !currentReps.every(isRepRecord) ||
    !isNonNegativeInteger(currentPartials)
  ) {
    throw new TypeError("Session checkpoint progress is inconsistent");
  }

  return {
    version: 1,
    id,
    startedAt,
    target: validTarget,
    restTimeoutMs,
    currentSet,
    completed: completed.map((set) => copySetRecord(set as SetRecord)),
    currentReps: currentReps.map((rep) => copyRepRecord(rep as RepRecord)),
    currentPartials,
  };
}
