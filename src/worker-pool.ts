import { QpdfError, terminatedError } from "./errors.js";
import type { FromWorker, ToWorker } from "./protocol.js";
import { assertNotDetached } from "./input.js";
import { callSafely } from "./progress.js";
import { transferablesOf } from "./transfer.js";
import type { Executor, JobSpec, RunResult } from "./types.js";

export interface WorkerLike {
  onmessage: ((event: { data: FromWorker }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface WorkerPoolOptions {
  size: number;
  wasmUrl: string;
  /** URL of the worker script, used only in error messages (spawn() loads it). */
  workerUrl?: string;
  spawn: () => WorkerLike;
}

interface Pending {
  id: number;
  spec: JobSpec;
  onProgress: ((percent: number) => void) | undefined;
  resolve(result: RunResult): void;
  reject(error: unknown): void;
}

interface Slot {
  worker: WorkerLike;
  ready: boolean;
  current: Pending | null;
}

/** Runs jobs on `size` workers, one job per worker at a time, FIFO. Crashed workers are replaced. */
export async function createWorkerPool(options: WorkerPoolOptions): Promise<Executor> {
  const slots: Slot[] = [];
  const queue: Pending[] = [];
  let nextId = 1;
  let terminated = false;

  function startSlot(): Promise<void> {
    return new Promise((resolve, reject) => {
      const slot: Slot = { worker: options.spawn(), ready: false, current: null };
      slots.push(slot);
      const failStart = (reason: string) => {
        removeSlot(slot);
        reject(new QpdfError("FAILED", `qpdf worker failed to start: ${reason}`));
      };
      // An error event without a message before "ready" means the script itself did not load
      // (404, wrong MIME type, or blocked by CSP). Browsers do not say which, so name the likely causes.
      const failLoad = (event: unknown) => {
        const message = messageOf(event);
        if (message) return failStart(message);
        removeSlot(slot);
        reject(
          new QpdfError(
            "FAILED",
            `qpdf worker failed to start (could not load ${options.workerUrl ?? "the worker script"}); ` +
              "check that the worker script is served and allowed by your Content-Security-Policy (worker-src)",
          ),
        );
      };
      slot.worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          slot.ready = true;
          resolve();
          dispatch();
        } else if (data.type === "init-error") {
          failStart(data.message);
        } else if (data.type === "progress") {
          // Only the job on this slot right now: a settled or terminated job has `current` cleared or replaced.
          const job = slot.current;
          if (job?.id === data.id && job.onProgress) callSafely(job.onProgress, data.percent);
        } else if (data.type === "result") {
          settle(slot, (job) => job.resolve(data.result));
        } else {
          settle(slot, (job) => job.reject(new QpdfError("FAILED", data.message)));
        }
      };
      slot.worker.onerror = (event) => {
        if (slot.ready) crash(slot, event);
        else failLoad(event);
      };
      slot.worker.onmessageerror = (event) => {
        if (slot.ready) crash(slot, event);
        else failStart(describe(event));
      };
      slot.worker.postMessage({ type: "init", wasmUrl: options.wasmUrl });
    });
  }

  function removeSlot(slot: Slot): void {
    slot.worker.terminate();
    const index = slots.indexOf(slot);
    if (index >= 0) slots.splice(index, 1);
  }

  function settle(slot: Slot, finish: (job: Pending) => void): void {
    const job = slot.current;
    slot.current = null;
    if (job) finish(job);
    dispatch();
  }

  function crash(slot: Slot, event: unknown): void {
    const job = slot.current;
    removeSlot(slot);
    job?.reject(new QpdfError("FAILED", `qpdf worker crashed: ${describe(event)}`));
    if (terminated) return;
    startSlot().catch((error: unknown) => {
      if (slots.length === 0) rejectQueued(error);
    });
  }

  function dispatch(): void {
    if (terminated) return;
    for (const slot of [...slots]) {
      // A job that cannot be sent is rejected and the slot immediately takes the next one.
      while (slot.ready && !slot.current) {
        const job = queue.shift();
        if (!job) return;
        slot.current = job;
        try {
          for (const bytes of Object.values(job.spec.files)) assertNotDetached(bytes.buffer);
          slot.worker.postMessage(
            { type: "job", id: job.id, spec: job.spec, progress: job.onProgress !== undefined },
            transferablesOf(job.spec.files),
          );
        } catch (error) {
          slot.current = null;
          job.reject(
            error instanceof TypeError
              ? error
              : new QpdfError("FAILED", `failed to send job to qpdf worker: ${error instanceof Error ? error.message : String(error)}`),
          );
        }
      }
    }
  }

  function rejectQueued(error: unknown): void {
    for (const job of queue.splice(0)) job.reject(error);
  }

  try {
    await Promise.all(Array.from({ length: options.size }, () => startSlot()));
  } catch (error) {
    for (const slot of [...slots]) removeSlot(slot);
    throw error;
  }

  return {
    exec(spec, onProgress) {
      if (terminated) return Promise.reject(terminatedError());
      if (slots.length === 0) return Promise.reject(new QpdfError("FAILED", "no qpdf workers are available"));
      return new Promise<RunResult>((resolve, reject) => {
        queue.push({ id: nextId++, spec, onProgress, resolve, reject });
        dispatch();
      });
    },
    terminate() {
      if (terminated) return;
      terminated = true;
      const error = terminatedError();
      for (const slot of [...slots]) {
        slot.current?.reject(error);
        slot.current = null;
        removeSlot(slot);
      }
      rejectQueued(error);
    },
  };
}

function messageOf(event: unknown): string | undefined {
  if (typeof event === "object" && event !== null && "message" in event && typeof event.message === "string" && event.message) {
    return event.message;
  }
  return undefined;
}

function describe(event: unknown): string {
  return messageOf(event) ?? "unknown worker error";
}
