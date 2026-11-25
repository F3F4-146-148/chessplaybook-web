/**
 * `/puzzles/from-games` (own-game puzzles plan, C1): a player brings their own games as PGN, sees
 * which ones can be analysed, says which side they played, and picks the games to turn into
 * puzzles. The analysis runs in this browser (D2), one game at a time, each saved when done (C2,
 * `page/useGameRun.ts`).
 *
 * A Document page (plan P2): a form and a list, read and scrolled. `noindex` in the prerendered
 * HTML: it is one person's games, and a crawler sees an empty form.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameRun, type Job, type RowRun } from '../page/useGameRun';
import { ArrowLeft, History, Upload } from 'lucide-react';
import SeoHead from '@/components/SeoHead';
import { useAuth } from '@/features/auth/AuthContext';
import { getAnonymousId } from '@/hooks/useAnonymousId';
import { loadSiteGames } from '../page/siteGames';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { whenBack } from '@/services/freePlanLimit';
import { logGA4Event } from '@/services/analytics';
import { parseGames, skipReasonOf, type ParsedGame } from '../generator/generatePuzzles';
import type { Side, SkipReason } from '../generator/types';
import { checkGames, type Allowance } from '../services/gamePuzzlesApi';
import {
  buildRows, defaultSelection, MAX_GAMES_PER_RUN, selectable, suggestName, type GameRow, type RowBlock,
} from '../page/gameList';

/** The server's check takes at most this many games; a bigger paste lists the first ones. */
const MAX_LISTED = 100;
const NAME_KEY = 'cp_game_puzzles_name';

const BLOCK_TEXT: Record<RowBlock, string> = {
  'too-short': 'Too short',
  'not-standard': 'Not standard chess',
  'no-result': 'Unfinished',
  bullet: 'Bullet',
  unparseable: 'Moves unreadable',
  analysed: 'Done already',
  duplicate: 'Listed twice',
};

function readName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
function saveName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim());
    else localStorage.removeItem(NAME_KEY);
  } catch { /* private window: the name is simply not remembered */ }
}

interface Loaded {
  games: ParsedGame[];
  skips: Array<SkipReason | null>;
  analysed: Set<string>;
  allowance: Allowance | null;
  /** The check could not be read: nothing is greyed as done, and the save will still refuse. */
  checkFailed: boolean;
  /** More games were pasted than are listed. */
  cut: boolean;
  /** Games played here (C3): each one's side and online_games id. null for a pasted PGN. */
  site: { sides: Side[]; refs: string[] } | null;
}

export default function PuzzlesFromGames() {
  const { user } = useAuth();
  const [pgn, setPgn] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [name, setName] = useState('');
  const [sideChoice, setSideChoice] = useState<Map<string, Side>>(new Map());
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /* A saved game is done: greyed like any analysed game, and it used one of today's games. */
  const onSaved = useCallback((hash: string, alreadyAnalysed: boolean) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      const allowance = prev.allowance && !alreadyAnalysed
        ? { ...prev.allowance, left: Math.max(0, prev.allowance.left - 1) }
        : prev.allowance;
      return { ...prev, analysed: new Set(prev.analysed).add(hash), allowance };
    });
    setChosen((prev) => { const next = new Set(prev); next.delete(hash); return next; });
  }, []);
  const run = useGameRun(onSaved);
  /* The server refused a save at the limit: nothing is left today, whatever the check said before. */
  useEffect(() => {
    if (run.phase !== 'limit') return;
    setLoaded((prev) => (prev?.allowance && prev.allowance.left > 0
      ? { ...prev, allowance: { ...prev.allowance, left: 0 } }
      : prev));
  }, [run.phase]);
  const busy = run.phase === 'running' || run.phase === 'paused-hidden' || run.phase === 'paused-taken';

  useEffect(() => { setName(readName()); }, []);

  const rows = useMemo(
    () => (loaded ? buildRows(loaded.games, loaded.skips, loaded.analysed, name, loaded.site?.sides) : []),
    [loaded, name],
  );
  const sideFor = useCallback((r: GameRow): Side | null => r.side ?? sideChoice.get(r.hash) ?? null, [sideChoice]);
  const left = loaded?.allowance ? loaded.allowance.left : null;
  const cap = Math.min(MAX_GAMES_PER_RUN, left ?? MAX_GAMES_PER_RUN);

  /* The list, whatever the source: what each game would skip, and the server's check. */
  async function list(all: ParsedGame[], site: Loaded['site']) {
    const games = all.slice(0, MAX_LISTED);
    const skips = await Promise.all(games.map((g) => skipReasonOf(g)));
    let analysed = new Set<string>();
    let allowance: Allowance | null = null;
    let checkFailed = false;
    try {
      const check = await checkGames([...new Set(games.map((g) => g.hash))]);
      analysed = new Set(check.analysed);
      allowance = check.allowance;
    } catch {
      checkFailed = true;
    }
    const startName = site ? name : readName() || suggestName(games) || '';
    setName(startName);
    setSideChoice(new Map());
    touched.current = false;
    setLoaded({ games, skips, analysed, allowance, checkFailed, cut: all.length > MAX_LISTED, site });
    logGA4Event({ name: 'game_puzzles_games_read', params: {
      source: site ? 'site' : 'pgn', games: games.length, analysable: skips.filter((s) => s === null).length,
    } });
    setChosen(defaultSelection(buildRows(games, skips, analysed, startName, site?.sides), allowance ? allowance.left : null));
  }

  async function readGames(text: string) {
    setReading(true);
    setError(null);
    try {
      const all = await parseGames([{ pgn: text }]);
      if (all.length === 0) {
        setLoaded(null);
        setError('No games found. Check that this is PGN.');
        return;
      }
      await list(all, null);
    } catch {
      setError('These games could not be read. Check that this is PGN.');
    } finally {
      setReading(false);
    }
  }

  async function readSiteGames() {
    setReading(true);
    setError(null);
    try {
      const games = await loadSiteGames(user?.userId ?? `anon:${getAnonymousId()}`);
      if (games.length === 0) {
        setLoaded(null);
        setError('You have no finished games here yet.');
        return;
      }
      await list(games.map((g) => g.game), { sides: games.map((g) => g.side), refs: games.map((g) => g.ref) });
    } catch {
      setError('Your games could not be loaded. Try again.');
    } finally {
      setReading(false);
    }
  }

  async function onFile(file: File) {
    const text = await file.text();
    setFileName(file.name);
    setPgn(text);
    await readGames(text);
  }

  /*
    A NAME TYPED AFTER READING TICKS THE GAMES IT NAMES, until the player ticks something by hand.
    Found by the C6 guard: a paste of one match between the same two players suggests no name (they
    are both in every game), so nothing was ticked, and typing the name afterwards ticked nothing
    either. Once the player has chosen by hand, a name change leaves their choice alone.
  */
  const touched = useRef(false);
  function onName(value: string) {
    setName(value);
    saveName(value);
    if (!touched.current && loaded) {
      setChosen(defaultSelection(buildRows(loaded.games, loaded.skips, loaded.analysed, value, loaded.site?.sides),
        loaded.allowance ? loaded.allowance.left : null));
    }
  }

  function toggle(row: GameRow) {
    touched.current = true;
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(row.hash)) next.delete(row.hash);
      else if (next.size < cap) next.add(row.hash);
      return next;
    });
  }

  function chooseSide(row: GameRow, side: Side | '') {
    setSideChoice((prev) => {
      const next = new Map(prev);
      if (side) next.set(row.hash, side); else next.delete(row.hash);
      return next;
    });
  }

  /* A game with no side known makes both sides' puzzles (#510, owner R3). */
  const ready = rows.filter((r) => chosen.has(r.hash) && selectable(r));

  function startRun() {
    if (!loaded) return;
    const jobs: Job[] = ready.map((r) => ({
      hash: r.hash, side: sideFor(r), game: loaded.games[r.index], ref: loaded.site?.refs[r.index],
    }));
    if (jobs.length > 0) run.start(jobs);
  }

  return (
    <div className="bg-background">
      <SeoHead routeKey="puzzles/from-games" />

      <main className="container mx-auto max-w-3xl px-4 py-4 sm:py-5">
        <div className="mb-2">
          <Link
            to="/puzzles"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to training
          </Link>
        </div>

        <h1 className="text-2xl font-semibold mb-1">From My Games</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Turn the key moments of your own games into puzzles.
        </p>

        <section className="surface-card space-y-3 rounded-lg p-4" data-from-games="input">
          <h2 className="text-base font-semibold">Your games</h2>
          <p className="text-sm text-muted-foreground">
            Lichess and Chess.com both let you download your games as a PGN file.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={reading || busy} onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload a PGN file
            </Button>
            <Button variant="outline" disabled={reading || busy} onClick={() => void readSiteGames()} data-from-games="site">
              <History className="h-4 w-4" />
              Games I played here
            </Button>
            {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
            <input
              ref={fileInput} type="file" accept=".pgn,text/plain" className="hidden" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }}
            />
          </div>
          <Textarea
            value={pgn} onChange={(e) => setPgn(e.target.value)} disabled={reading || busy}
            placeholder="Or paste your games here"
            aria-label="Your games in PGN"
            className="h-32 font-mono text-xs"
          />
          <Button onClick={() => void readGames(pgn)} disabled={reading || busy || !pgn.trim()}>
            {reading ? 'Reading...' : 'Read the games'}
          </Button>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </section>

        {loaded && (
          <section className="surface-card mt-4 space-y-3 rounded-lg p-4" data-from-games="list">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Choose games</h2>
              <span className="text-sm text-muted-foreground" data-from-games="count">
                {ready.length} of {cap} chosen
              </span>
            </div>

            {!loaded.site && (
              <label className="block text-sm">
                Your name in these games
                <Input value={name} onChange={(e) => onName(e.target.value)} disabled={busy} className="mt-1 w-64 max-w-full" />
              </label>
            )}

            <AllowanceLine allowance={loaded.allowance} />
            {loaded.cut && <p className="text-sm text-muted-foreground">Only the first {MAX_LISTED} games are listed.</p>}
            {loaded.checkFailed && (
              <p className="text-sm text-muted-foreground">
                We could not check which games you have done already.
              </p>
            )}

            <ul className="divide-y divide-border" data-from-games="games">
              {rows.map((r) => (
                <GameItem
                  key={r.index}
                  row={r}
                  side={sideFor(r)}
                  run={run.rowRuns.get(r.hash)}
                  busy={busy}
                  checked={chosen.has(r.hash) && selectable(r)}
                  full={!chosen.has(r.hash) && chosen.size >= cap}
                  onToggle={() => toggle(r)}
                  onSide={(s) => chooseSide(r, s)}
                />
              ))}
            </ul>

            <RunPanel run={run} ready={ready.length} onStart={startRun} />
          </section>
        )}
      </main>
    </div>
  );
}

function AllowanceLine({ allowance }: { allowance: Allowance | null }) {
  if (!allowance) return <p className="text-sm text-muted-foreground">Up to {MAX_GAMES_PER_RUN} games at a time.</p>;
  if (allowance.left === 0) {
    return (
      <p className="text-sm" data-from-games="allowance">
        You have used today&apos;s {allowance.limit} games. More {whenBack(allowance.resetsAt)}.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground" data-from-games="allowance">
      You can analyse {allowance.left} more {allowance.left === 1 ? 'game' : 'games'} today.
    </p>
  );
}

function GameItem({ row, side, run, busy, checked, full, onToggle, onSide }: {
  row: GameRow;
  side: Side | null;
  run: RowRun | undefined;
  busy: boolean;
  checked: boolean;
  full: boolean;
  onToggle: () => void;
  onSide: (side: Side | '') => void;
}) {
  const blocked = row.block !== null;
  const details = [row.date, row.result, `${row.moves} ${row.moves === 1 ? 'move' : 'moves'}`].filter(Boolean).join(' · ');
  return (
    <li className={`flex items-center gap-3 py-2 ${blocked ? 'text-muted-foreground' : ''}`} data-game-hash={row.hash}>
      <input
        type="checkbox" className="h-4 w-4 shrink-0"
        checked={checked} disabled={busy || blocked || (!checked && full)} onChange={onToggle}
        aria-label={`${row.white} against ${row.black}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className={side === 'white' ? 'font-semibold' : ''}>{row.white}</span>
          {' - '}
          <span className={side === 'black' ? 'font-semibold' : ''}>{row.black}</span>
        </p>
        <p className="text-xs text-muted-foreground">{details}</p>
      </div>
      {run ? (
        <span className="shrink-0 text-xs" data-row-run={run.state}>{runText(run)}</span>
      ) : blocked ? (
        <span className="shrink-0 text-xs" data-row-block={row.block}>{BLOCK_TEXT[row.block!]}</span>
      ) : !row.side ? (
        <select
          className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-xs" disabled={busy}
          value={side ?? ''} onChange={(e) => onSide(e.target.value as Side | '')}
          aria-label="Which side did you play?"
        >
          <option value="">Both sides</option>
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
      ) : null}
    </li>
  );
}

function runText(run: RowRun): string {
  switch (run.state) {
    case 'waiting': return 'Waiting';
    case 'analysing': return 'Analysing...';
    case 'saved': return run.ids.length === 0 ? 'No puzzles' : `${run.ids.length} ${run.ids.length === 1 ? 'puzzle' : 'puzzles'}`;
    case 'interrupted': return 'Interrupted';
    case 'failed': return 'Not saved';
    case 'limit': return "Over today's limit";
  }
}

function minutesLeft(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'Less than a minute left.';
  return `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left.`;
}

function RunPanel({ run, ready, onStart }: {
  run: ReturnType<typeof useGameRun>;
  ready: number;
  onStart: () => void;
}) {
  const runs = [...run.rowRuns.values()];
  const saved = runs.filter((r): r is Extract<RowRun, { state: 'saved' }> => r.state === 'saved');
  const puzzles = saved.reduce((n, r) => n + r.ids.length, 0);
  const firstId = saved.find((r) => r.ids.length > 0)?.ids[0];
  const total = runs.length;
  const current = total - run.remaining + 1;
  const tally = `${puzzles} ${puzzles === 1 ? 'puzzle' : 'puzzles'} from ${saved.length} ${saved.length === 1 ? 'game' : 'games'}`;
  const solve = firstId && (
    <Link to={`/puzzles?id=${firstId}`} className="text-sm font-medium text-link hover:underline">Solve them</Link>
  );

  return (
    <div className="space-y-2 border-t border-border pt-3" data-from-games="run" data-run-phase={run.phase}>
      {run.phase === 'running' && (
        <>
          <p className="text-sm">Analysing game {Math.min(current, total)} of {total}.</p>
          <p className="text-sm text-muted-foreground">
            {run.msPerGame !== null ? `${minutesLeft(run.msPerGame * run.remaining)} ` : ''}Keep this tab open while it runs.
          </p>
          <Button variant="outline" onClick={run.stop}>Stop after this game</Button>
        </>
      )}
      {run.phase === 'paused-hidden' && <p className="text-sm">Paused while this tab is in the background.</p>}
      {run.phase === 'paused-taken' && (
        <>
          <p className="text-sm">Another tab is using the engine. Close it, or continue here.</p>
          <Button onClick={run.continueHere}>Continue here</Button>
        </>
      )}
      {run.phase === 'done' && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span>{puzzles === 0 ? 'Done. No puzzles in these games.' : `Done. ${tally}.`}</span>{solve}
        </p>
      )}
      {run.phase === 'stopped' && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm"><span>Stopped. {tally} so far.</span>{solve}</p>
      )}
      {run.phase === 'limit' && run.limitHit && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span>
            You have used today&apos;s {run.limitHit.limit} games. More {run.limitHit.resetsAt ? whenBack(run.limitHit.resetsAt) : 'tomorrow'}.
          </span>
          {solve}
        </p>
      )}
      {(run.phase === 'idle' || run.phase === 'done' || run.phase === 'stopped' || run.phase === 'limit') && (
        <Button onClick={onStart} disabled={ready === 0} data-from-games="start">
          Find puzzles in {ready} {ready === 1 ? 'game' : 'games'}
        </Button>
      )}
    </div>
  );
}
