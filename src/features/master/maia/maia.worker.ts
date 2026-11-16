/// <reference lib="webworker" />
/**
 * MAIA IN A WEB WORKER (MASTER_CHARACTER_IMPLEMENTATION_PLAN C5, #186).
 *
 * Off the main thread so the board never stutters. onnxruntime-web's WebAssembly-only build, one thread (no
 * SharedArrayBuffer, so no cross-origin isolation is needed), its `.wasm` taken from the pinned package and emitted
 * by Vite as a hashed, cacheable asset rather than fetched from a CDN. One network is loaded at a time: a change of
 * level loads the new one.
 */
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

import type { GameHistory } from './encode';
import { chooseMove, evaluate, maiaNetUrl, type MaiaRating } from './maiaEngine';
import type { SampleOptions } from './sample';

export type MaiaRequest =
  | { id: number; type: 'load'; rating: MaiaRating }
  | { id: number; type: 'move'; history: GameHistory; sampling: SampleOptions }
  | { id: number; type: 'evaluate'; history: GameHistory };

export type MaiaResponse =
  | { id: number; type: 'loaded'; rating: MaiaRating; ms: number }
  | { id: number; type: 'move'; uci: string; evaluation: Awaited<ReturnType<typeof evaluate>>; ms: number }
  | { id: number; type: 'evaluation'; evaluation: Awaited<ReturnType<typeof evaluate>> }
  | { id: number; type: 'error'; message: string };

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

let session: ort.InferenceSession | null = null;
let loaded: MaiaRating | null = null;

const reply = (msg: MaiaResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (e: MessageEvent<MaiaRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'load') {
      const t0 = performance.now();
      if (loaded !== req.rating) {
        session?.release?.();
        session = await ort.InferenceSession.create(maiaNetUrl(req.rating), { executionProviders: ['wasm'] });
        loaded = req.rating;
      }
      reply({ id: req.id, type: 'loaded', rating: req.rating, ms: performance.now() - t0 });
      return;
    }
    if (!session) throw new Error('no network loaded');
    if (req.type === 'move') {
      const t0 = performance.now();
      const evaluation = await evaluate(ort, session, req.history);
      reply({ id: req.id, type: 'move', uci: chooseMove(evaluation, req.sampling), evaluation, ms: performance.now() - t0 });
      return;
    }
    reply({ id: req.id, type: 'evaluation', evaluation: await evaluate(ort, session, req.history) });
  } catch (err) {
    reply({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
