import type { FromWorker, ToWorker } from "../../src/protocol.js";
import { createWorkerHandler } from "../../src/worker-handler.js";
import type { WorkerLike } from "../../src/worker-pool.js";

/** In-process stand-in for a module Worker. Jobs whose first arg is "--crash" simulate a worker crash. */
export class FakeWorker implements WorkerLike {
  static spawned = 0;
  onmessage: ((event: { data: FromWorker }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  terminated = false;
  private readonly handle = createWorkerHandler({
    postMessage: (message, transfer = []) => {
      const data = structuredClone(message, { transfer });
      queueMicrotask(() => {
        if (!this.terminated) this.onmessage?.({ data });
      });
    },
  });

  constructor() {
    FakeWorker.spawned++;
  }

  postMessage(message: ToWorker, transfer: Transferable[] = []): void {
    const data = structuredClone(message, { transfer }); // throws DataCloneError on duplicate buffers
    if (this.terminated) return;
    if (data.type === "job" && data.spec.args[0] === "--crash") {
      queueMicrotask(() => this.onerror?.({ message: "simulated crash" }));
      return;
    }
    void this.handle(data);
  }

  terminate(): void {
    this.terminated = true;
  }
}
