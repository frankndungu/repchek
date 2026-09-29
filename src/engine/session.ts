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
