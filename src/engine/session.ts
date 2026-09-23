import type { RepEvent } from "./repCounter";

export interface SetTarget {
  sets: number;
  reps: number;
}

export interface SetRecord {
  set: number;
  reps: number;
  partials: number;
  repDurationsMs: number[];
}

export type SessionEvent =
  | { type: "set-complete"; record: SetRecord }
  | { type: "session-complete"; sets: SetRecord[] };

const DEFAULT_REST_TIMEOUT_MS = 20000;

export class SessionTracker {
  private target: SetTarget;
  private restTimeoutMs: number;
  private currentSet: number;
  private repsInSet: number;
  private partialsInSet: number;
  private durations: number[];
  private lastRepAt: number | null;
  private completed: SetRecord[];
  private finished: boolean;

  constructor(target: SetTarget, restTimeoutMs = DEFAULT_REST_TIMEOUT_MS) {
    this.target = target;
    this.restTimeoutMs = restTimeoutMs;
    this.currentSet = 1;
    this.repsInSet = 0;
    this.partialsInSet = 0;
    this.durations = [];
    this.lastRepAt = null;
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
    return this.repsInSet;
  }

  get isResting(): boolean {
    return !this.finished && this.repsInSet === 0 && this.completed.length > 0;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get records(): SetRecord[] {
    return this.completed;
  }

  onRepEvent(event: RepEvent, nowMs: number): SessionEvent | null {
    if (this.finished) return null;

    if (event.type === "partial") {
      this.partialsInSet += 1;
      return null;
    }

    this.repsInSet += 1;
    this.durations.push(event.durationMs);
    this.lastRepAt = nowMs;

    if (this.repsInSet >= this.target.reps) {
      return this.closeSet();
    }
    return null;
  }

  tick(nowMs: number): SessionEvent | null {
    if (this.finished || this.repsInSet === 0 || this.lastRepAt === null)
      return null;
    if (nowMs - this.lastRepAt >= this.restTimeoutMs) {
      return this.closeSet();
    }
    return null;
  }

  private closeSet(): SessionEvent {
    const record: SetRecord = {
      set: this.currentSet,
      reps: this.repsInSet,
      partials: this.partialsInSet,
      repDurationsMs: this.durations,
    };
    this.completed.push(record);

    this.repsInSet = 0;
    this.partialsInSet = 0;
    this.durations = [];
    this.lastRepAt = null;

    if (this.currentSet >= this.target.sets) {
      this.finished = true;
      return { type: "session-complete", sets: this.completed };
    }

    this.currentSet += 1;
    return { type: "set-complete", record };
  }
}
