/**
 * `/dev/game-puzzles` (OWN_GAME_PUZZLES plan, A1). DEV-only: the route is gated behind
 * `import.meta.env.DEV` in `app/routes.tsx` and tree-shaken from production.
 *
 * Runs the game-puzzle generator in this browser, on this device's engine (owner decision D2), one
 * game at a time, and shows how long each game took and what it found. It exists to measure a real
 * phone before any visitor-facing page is built (A2): Chrome's CPU throttling slows the page but not
 * the engine's Web Worker, so a desktop cannot stand in for a phone.
 *
 * Games come from a pasted or uploaded PGN, or from a Lichess username (recent rapid, classical and
 * blitz games; Lichess games are CC0). Nothing is saved anywhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { parseGames, generateForGame, DEFAULT_THRESHOLDS, type ParsedGame } from '../generator/generatePuzzles';
import type { GameReport, GeneratedPuzzle } from '../generator/types';
import { withBrowserPuzzleEngine } from '../engine/browserEngine';
import { summarizeBench } from './benchSummary';

interface Row {
  index: number;
  label: string;
  plies: number;
  report: GameReport | null;
}

function deviceLine(): string {
  if (typeof navigator === 'undefined') return '';
  const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : 'cores unknown';
  return `${navigator.userAgent} · ${cores} · screen ${screen.width}x${screen.height}`;
}

export default function GamePuzzlesBench() {
  const [pgn, setPgn] = useState('');
  const [username, setUsername] = useState('');
  const [count, setCount] = useState(10);
  const [status, setStatus] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [puzzles, setPuzzles] = useState<GeneratedPuzzle[]>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const [device, setDevice] = useState('');
  useEffect(() => { setDevice(deviceLine()); }, []);

  const reports = useMemo(() => rows.flatMap((r) => (r.report ? [r.report] : [])), [rows]);
  const summary = useMemo(() => summarizeBench(reports), [reports]);

  async function loadLichess() {
    const name = username.trim();
    if (!name) return;
    setStatus(`Fetching ${count} games from Lichess...`);
    try {
      const url = `https://lichess.org/api/games/user/${encodeURIComponent(name)}`
        + `?max=${count}&perfType=rapid,classical,blitz&clocks=true&evals=false&opening=false`;
      const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
      if (!res.ok) throw new Error(`Lichess answered ${res.status}`);
      const text = await res.text();
      setPgn(text);
      const n = (await parseGames([{ pgn: text }])).length;
      setStatus(`${n} games loaded.`);
    } catch (e) {
      setStatus(`Could not fetch the games: ${(e as Error).message}`);
    }
  }

  async function loadFile(file: File) {
    setPgn(await file.text());
    setStatus(`${file.name} loaded.`);
  }

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setPuzzles([]);
    let wake: { release: () => Promise<void> } | null = null;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      wake = (await nav.wakeLock?.request('screen').catch(() => null)) ?? null;
    } catch { wake = null; }
    try {
      const games: ParsedGame[] = (await parseGames([{ pgn }])).slice(0, count);
      setRows(games.map((g) => ({
        index: g.index,
        label: `${g.headers.get('White') ?? '?'} - ${g.headers.get('Black') ?? '?'}`,
        plies: g.sans.length,
        report: null,
      })));
      if (games.length === 0) { setStatus('No game found in the PGN.'); return; }
      await withBrowserPuzzleEngine(async (engine) => {
        for (const [i, g] of games.entries()) {
          if (stopRef.current) break;
          setStatus(`Game ${i + 1} of ${games.length}...`);
          const r = await generateForGame(g, {}, engine);
          setRows((prev) => prev.map((row) => (row.index === g.index ? { ...row, report: r.report } : row)));
          setPuzzles((prev) => [...prev, ...r.puzzles]);
        }
      });
      setStatus(stopRef.current ? 'Stopped.' : 'Done.');
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`);
    } finally {
      await wake?.release().catch(() => undefined);
      setRunning(false);
    }
  }

  function copyResults() {
    const data = { device, thresholds: DEFAULT_THRESHOLDS, summary, reports, puzzles };
    /* Over plain http on the local network (a phone on the dev server) the browser offers no
       clipboard; the summary on the page is then the record, by screenshot. */
    if (!navigator.clipboard) { setStatus('Copying needs https. Take a screenshot of the summary instead.'); return; }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(
      () => setStatus('Results copied.'),
      () => setStatus('Could not copy. Take a screenshot of the summary instead.'),
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 text-foreground">
      <h1 className="text-xl font-semibold">Puzzles from games: speed on this device</h1>
      <p className="text-sm text-muted-foreground">
        Runs the puzzle generator in this browser, one game at a time. Keep the screen on and the tab
        open while it runs. Nothing is saved.
      </p>
      <p className="break-all text-xs text-muted-foreground" data-bench="device">{device}</p>

      <section className="surface-card space-y-3 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Lichess username
            <Input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-56" disabled={running} />
          </label>
          <label className="text-sm">
            Games
            <Input
              type="number" min={1} max={50} value={count} className="mt-1 w-20" disabled={running}
              onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </label>
          <Button variant="outline" onClick={loadLichess} disabled={running || !username.trim()}>Load from Lichess</Button>
        </div>
        <label className="block text-sm">
          Or a PGN file
          <input
            type="file" accept=".pgn,text/plain" disabled={running} className="mt-1 block text-sm"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }}
          />
        </label>
        <Textarea
          value={pgn} onChange={(e) => setPgn(e.target.value)} disabled={running}
          placeholder="Or paste a PGN with one or more games" className="h-32 font-mono text-xs" data-bench="pgn"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={run} disabled={running || !pgn.trim()} data-bench="run">Run</Button>
          <Button variant="outline" onClick={() => { stopRef.current = true; }} disabled={!running}>Stop after this game</Button>
          <Button variant="outline" onClick={copyResults} disabled={reports.length === 0}>Copy results</Button>
        </div>
        {status && <p className="text-sm" role="status" data-bench="status">{status}</p>}
      </section>

      {reports.length > 0 && (
        <section className="surface-card rounded-lg p-4 text-sm" data-bench="summary">
          <p>
            {summary.used} games analysed, {summary.skipped} skipped · median {summary.medianSeconds ?? '-'} s a game,
            longest {summary.maxSeconds ?? '-'} s · {summary.puzzles} puzzles ({summary.puzzlesPerUsedGame} a game) ·
            {' '}{summary.positionsPerUsedGame} positions searched a game · {summary.totalSeconds} s in all
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <section className="surface-card overflow-x-auto rounded-lg p-4">
          <table className="w-full text-left text-sm" data-bench="games">
            <thead className="text-muted-foreground">
              <tr><th className="pr-3">#</th><th className="pr-3">Game</th><th className="pr-3">Plies</th><th className="pr-3">Result</th><th className="pr-3">Seconds</th><th className="pr-3">Positions</th><th>Puzzles</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.index} className="border-t border-border">
                  <td className="pr-3">{r.index + 1}</td>
                  <td className="pr-3">{r.label}</td>
                  <td className="pr-3">{r.plies}</td>
                  <td className="pr-3">{r.report ? (r.report.status === 'used' ? 'analysed' : `skipped: ${r.report.skipReason}`) : '...'}</td>
                  <td className="pr-3">{r.report ? (r.report.ms / 1000).toFixed(1) : ''}</td>
                  <td className="pr-3">{r.report?.positionsSearched ?? ''}</td>
                  <td>{r.report?.puzzles ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {puzzles.length > 0 && (
        <section className="surface-card rounded-lg p-4 text-sm">
          <h2 className="mb-2 font-semibold">Puzzles found</h2>
          <ul className="space-y-1 font-mono text-xs">
            {puzzles.map((p, i) => (
              <li key={i}>
                game {p.game.index + 1} · move {p.moveNumber} · {p.solver} to play · {p.kind} · {p.goal}
                {' '}· solution {p.moves.slice(1).join(' ')} · played {p.playedMove}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
