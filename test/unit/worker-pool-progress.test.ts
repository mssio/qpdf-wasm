import { describe, expect, it, vi } from "vitest";
import type { FromWorker, ToWorker } from "../../src/protocol.js";
import type { JobSpec, RunResult } from "../../src/types.js";
import { createWorkerPool, type WorkerLike } from "../../src/worker-pool.js";

type JobMessage = Extract<ToWorker, { type: "job" }>;
const RESULT: RunResult = { exitCode: 0, stdout: "", stderr: "", files: {} };
const spec = (): JobSpec => ({ args: ["x"], files: {} });

/**
 * A worker whose replies the test sends by hand. emit() delivers even after terminate(), like a message that was
 * already in flight, so the tests check the pool's own guards.
 */
class ScriptedWorker implements WorkerLike {
  onmessage: ((event: { data: FromWorker }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  readonly jobs: JobMessage[] = [];

  postMessage(message: ToWorker): void {
    if (message.type === "init") queueMicrotask(() => this.emit({ type: "ready" }));
    else this.jobs.push(message);
  }

  emit(data: FromWorker): void {
    this.onmessage?.({ data });
  }

  terminate(): void {}
}

async function setup(size = 1) {
  const workers: ScriptedWorker[] = [];
  const pool = await createWorkerPool({
    size,
    wasmUrl: "qpdf.wasm",
    spawn: () => {
      const worker = new ScriptedWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { pool, workers };
}

describe("worker pool progress", () => {
  it("asks the worker for progress only when the job has onProgress", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const withCallback = pool.exec(spec(), () => {});
    expect(worker.jobs[0]).toMatchObject({ type: "job", progress: true });
    worker.emit({ type: "result", id: worker.jobs[0]!.id, result: RESULT });
    await withCallback;
    const without = pool.exec(spec());
    expect(worker.jobs[1]).toMatchObject({ type: "job", progress: false });
    worker.emit({ type: "result", id: worker.jobs[1]!.id, result: RESULT });
    await without;
    const explicitUndefined = pool.exec(spec(), undefined);
    expect(worker.jobs[2]).toMatchObject({ type: "job", progress: false });
    worker.emit({ type: "result", id: worker.jobs[2]!.id, result: RESULT });
    await explicitUndefined;
    pool.terminate();
  });

  it("forwards each job's progress to its own callback", async () => {
    const { pool, workers } = await setup(2);
    const a: number[] = [];
    const b: number[] = [];
    const jobA = pool.exec(spec(), (percent) => a.push(percent));
    const jobB = pool.exec(spec(), (percent) => b.push(percent));
    const [workerA, workerB] = [workers[0]!, workers[1]!];
    const idA = workerA.jobs[0]!.id;
    const idB = workerB.jobs[0]!.id;
    workerA.emit({ type: "progress", id: idA, percent: 0 });
    workerB.emit({ type: "progress", id: idB, percent: 0 });
    workerB.emit({ type: "progress", id: idB, percent: 40 });
    workerA.emit({ type: "progress", id: idA, percent: 100 });
    expect(a).toEqual([0, 100]);
    expect(b).toEqual([0, 40]);
    workerA.emit({ type: "result", id: idA, result: RESULT });
    workerB.emit({ type: "result", id: idB, result: RESULT });
    await Promise.all([jobA, jobB]);
    pool.terminate();
  });

  it("ignores progress for a settled job, even while the next job runs", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const first: number[] = [];
    const second: number[] = [];
    const jobA = pool.exec(spec(), (percent) => first.push(percent));
    const jobB = pool.exec(spec(), (percent) => second.push(percent)); // queued behind jobA
    const idA = worker.jobs[0]!.id;
    worker.emit({ type: "result", id: idA, result: RESULT });
    await jobA;
    const idB = worker.jobs[1]!.id; // dispatched when jobA settled
    worker.emit({ type: "progress", id: idA, percent: 50 });
    worker.emit({ type: "error", id: idB, message: "boom" });
    await expect(jobB).rejects.toThrow("boom");
    worker.emit({ type: "progress", id: idB, percent: 50 });
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    pool.terminate();
  });

  it("ignores progress after terminate()", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const calls: number[] = [];
    const job = pool.exec(spec(), (percent) => calls.push(percent));
    const id = worker.jobs[0]!.id;
    worker.emit({ type: "progress", id, percent: 10 });
    pool.terminate();
    await expect(job).rejects.toMatchObject({ code: "TERMINATED" });
    worker.emit({ type: "progress", id, percent: 20 });
    expect(calls).toEqual([10]);
  });

  it("keeps the job and the pool working when onProgress throws", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const scheduled = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});
    try {
      const job = pool.exec(spec(), () => {
        throw new Error("callback bug");
      });
      const id = worker.jobs[0]!.id;
      worker.emit({ type: "progress", id, percent: 0 });
      worker.emit({ type: "result", id, result: RESULT });
      await expect(job).resolves.toEqual(RESULT);
      expect(scheduled).toHaveBeenCalledTimes(1);
      const next = pool.exec(spec());
      worker.emit({ type: "result", id: worker.jobs[1]!.id, result: RESULT });
      await expect(next).resolves.toEqual(RESULT);
    } finally {
      scheduled.mockRestore();
      pool.terminate();
    }
  });

  it("ignores progress from a crashed worker", async () => {
    const { pool, workers } = await setup();
    const crashed = workers[0]!;
    const calls: number[] = [];
    const job = pool.exec(spec(), (percent) => calls.push(percent));
    const id = crashed.jobs[0]!.id;
    crashed.emit({ type: "progress", id, percent: 1 });
    crashed.onerror?.({ message: "x" });
    await expect(job).rejects.toMatchObject({ code: "FAILED" });
    crashed.emit({ type: "progress", id, percent: 5 });
    expect(calls).toEqual([1]);
    pool.terminate();
  });
});
