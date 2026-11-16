/**
 * THE MASTER'S ENGINE, as the page sees it (MASTER_CHARACTER_IMPLEMENTATION_PLAN C5, #186).
 *
 * Starts its Web Worker only when asked (a game against the Master starting), so no visitor downloads the runtime
 * or a network before that. `ready` resolves once the level's network is loaded; `/play` must wait for it before
 * the Master's first move (plan D1: today's engine wiring drops a move asked of an engine that is not ready).
 */
import type { GameHistory } from './encode';
import type { MaiaEvaluation, MaiaRating } from './maiaEngine';
import { DEFAULT_SAMPLING, type SampleOptions } from './sample';
import type { MaiaRequest, MaiaResponse } from './maia.worker';

type Pending = { resolve: (r: MaiaResponse) => void; reject: (e: Error) => void };
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export class MaiaOpponent {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private loading: Promise<void> | null = null;
  rating: MaiaRating;

  constructor(rating: MaiaRating, private sampling: SampleOptions = DEFAULT_SAMPLING) {
    this.rating = rating;
  }

  /** Loads the runtime and this level's network; safe to call again. */
  ready(): Promise<void> {
    if (!this.loading) {
      this.loading = this.send({ type: 'load', rating: this.rating }).then(() => undefined);
      this.loading.catch(() => { this.loading = null; });
    }
    return this.loading;
  }

  /** A change of level: the next `ready()` loads the new network. */
  setRating(rating: MaiaRating) {
    if (rating === this.rating) return;
    this.rating = rating;
    this.loading = null;
  }

  async getMove(history: GameHistory): Promise<{ uci: string; evaluation: MaiaEvaluation }> {
    await this.ready();
    const r = await this.send({ type: 'move', history, sampling: this.sampling });
    if (r.type !== 'move') throw new Error('unexpected reply');
    return { uci: r.uci, evaluation: r.evaluation };
  }

  async evaluate(history: GameHistory): Promise<MaiaEvaluation> {
    await this.ready();
    const r = await this.send({ type: 'evaluate', history });
    if (r.type !== 'evaluation') throw new Error('unexpected reply');
    return r.evaluation;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
    for (const p of this.pending.values()) p.reject(new Error('disposed'));
    this.pending.clear();
  }

  private send(req: WithoutId<MaiaRequest>): Promise<MaiaResponse> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./maia.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<MaiaResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.type === 'error') p.reject(new Error(e.data.message));
        else p.resolve(e.data);
      };
      this.worker.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error(e.message || 'Maia worker failed'));
        this.pending.clear();
      };
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ ...req, id } as MaiaRequest);
    });
  }
}
