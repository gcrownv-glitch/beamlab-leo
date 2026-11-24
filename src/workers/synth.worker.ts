import {
  runShapedSynthesisJob,
  type ShapedSynthesisJob,
  type ShapedSynthesisOutput,
} from '../core/synthesis';

export interface SynthWorkerRequest {
  id: number;
  job: ShapedSynthesisJob;
}

export type SynthWorkerResponse =
  | { id: number; ok: true; output: ShapedSynthesisOutput }
  | { id: number; ok: false; error: string };

const workerScope = self as unknown as {
  onmessage: ((ev: MessageEvent<SynthWorkerRequest>) => void) | null;
  postMessage: (msg: SynthWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (ev: MessageEvent<SynthWorkerRequest>) => {
  const { id, job } = ev.data;
  try {
    const output = runShapedSynthesisJob(job);
    const bufs = new Set<ArrayBuffer>([
      output.result.re.buffer as ArrayBuffer,
      output.result.im.buffer as ArrayBuffer,
      output.result.grid.power.buffer as ArrayBuffer,
      output.finalResult.re.buffer as ArrayBuffer,
      output.finalResult.im.buffer as ArrayBuffer,
      output.finalResult.grid.power.buffer as ArrayBuffer,
    ]);
    workerScope.postMessage({ id, ok: true, output }, Array.from(bufs));
  } catch (err) {
    workerScope.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
