// Web Worker entry. Only wires the worker globals; all logic lives in worker-handler.ts.
import type { FromWorker, ToWorker } from "./protocol.js";
import { createWorkerHandler } from "./worker-handler.js";

interface WorkerGlobal {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker, transfer: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerGlobal;
const handle = createWorkerHandler({ postMessage: (message, transfer = []) => scope.postMessage(message, transfer) });
scope.onmessage = (event) => {
  void handle(event.data);
};
