/**
 * useEngineAnalysis on a finished position (#415).
 *
 * A checkmate has no move to search: Stockfish prints no line and answers `bestmove (none)`, so /analysis's engine
 * card waited on "Calculating…" for ever (a team member's laptop, 2026-11-22). The hook now shows the result from the board
 * alone, never asks the engine, and lets nothing the engine sends later (the previous position's search) replace it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const service = vi.hoisted(() => {
  let listener: ((r: unknown) => void) | null = null;
  return {
    emit: (r: unknown) => listener?.(r),
    isAnalysisEnabled: vi.fn(() => true),
    subscribe: vi.fn((cb: (r: unknown) => void) => { listener = cb; return () => { listener = null; }; }),
    subscribeToEnabledState: vi.fn(() => () => {}),
    subscribeEngineAvailable: vi.fn(() => () => {}),
    getCachedResult: vi.fn(() => null),
    analyzePosition: vi.fn(),
    setMultiPvCount: vi.fn(),
    initialize: vi.fn(async () => {}),
  };
});
vi.mock('@/services/AnalysisService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/AnalysisService')>();
  return { terminalDescription: actual.terminalDescription, analysisService: service };
});

import { useEngineAnalysis } from './useEngineAnalysis';

// The reported position: Black to move, checkmated (Kh5 by the rook on h4; g4, g5, g6, h6 covered, Kxh4 met by Bg3).
const MATE = '6Q1/8/8/7k/1K5R/6B1/7P/8 b - - 0 1';
const BEFORE_MATE = '6Q1/8/8/7k/1K6/6B1/7P/7R w - - 0 1';
const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';

describe('useEngineAnalysis on a finished position (#415)', () => {
  beforeEach(() => {
    service.analyzePosition.mockClear();
  });

  it('shows a checkmate at once, as the game result, without asking the engine', () => {
    const { result } = renderHook(() => useEngineAnalysis(MATE, { singleLineOnNarrowWindows: false }));
    expect(service.analyzePosition).not.toHaveBeenCalled();
    expect(result.current.isTerminal).toBe(true);
    expect(result.current.isWaiting).toBe(false);
    expect(result.current.gameResult).toBe('1-0');
    expect(result.current.result?.principalVariation).toBe('Checkmate. White wins');
    expect(result.current.isPositive).toBe(true);
  });

  it('a late result from the previous position does not replace it', () => {
    const { result, rerender } = renderHook(({ fen }) => useEngineAnalysis(fen, { singleLineOnNarrowWindows: false }), {
      initialProps: { fen: BEFORE_MATE },
    });
    expect(service.analyzePosition).toHaveBeenCalledWith(BEFORE_MATE);
    rerender({ fen: MATE });
    act(() => { service.emit({ fen: BEFORE_MATE, evaluation: 'M1', principalVariation: 'Rh4#', depth: 12 }); });
    expect(result.current.isTerminal).toBe(true);
    expect(result.current.gameResult).toBe('1-0');
  });

  it('a stalemate is a draw', () => {
    const { result } = renderHook(() => useEngineAnalysis(STALEMATE, { singleLineOnNarrowWindows: false }));
    expect(result.current.gameResult).toBe('½-½');
    expect(result.current.result?.principalVariation).toBe('Stalemate. Draw');
  });

  it('stepping back to a live position asks the engine again and shows what it says', () => {
    const { result, rerender } = renderHook(({ fen }) => useEngineAnalysis(fen, { singleLineOnNarrowWindows: false }), {
      initialProps: { fen: MATE },
    });
    rerender({ fen: BEFORE_MATE });
    expect(service.analyzePosition).toHaveBeenCalledWith(BEFORE_MATE);
    act(() => { service.emit({ fen: BEFORE_MATE, evaluation: 'M1', principalVariation: 'Rh4#', depth: 12 }); });
    expect(result.current.isTerminal).toBe(false);
    expect(result.current.evaluation).toBe('M1');
  });
});
