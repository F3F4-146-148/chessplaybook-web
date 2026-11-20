import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportGraph, positionLabel, evalText, goToLabel } from './ReportGraph';
import type { ReportPhase } from './reportView';

/* jsdom has no layout: give the wrapper a width and the drawing a box. */
const WIDTH = 400;
let restore: Array<() => void> = [];
beforeAll(() => {
  const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: WIDTH, height: 120, right: WIDTH, bottom: 120, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
  restore = [
    () => { if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw); },
    () => { Element.prototype.getBoundingClientRect = rect; },
  ];
});
afterAll(() => restore.forEach(f => f()));

const evals = Array.from({ length: 41 }, (_, i) => i * 10); // 40 moves
const phases: ReportPhase[] = [
  { name: 'Opening', score: 95, band: 'best', from: 0, to: 21 },
  { name: 'Middlegame', score: 88, band: 'excellent', from: 21, to: 40 },
];
const setup = (current = 10) => {
  const onMoveClick = vi.fn();
  render(<ReportGraph evals={evals} phases={phases} dots={[{ position: 30, key: 'mistake' }]} currentPosition={current} onMoveClick={onMoveClick} />);
  return { onMoveClick, svg: screen.getByRole('img', { name: /Evaluation graph/ }) };
};

describe('labels', () => {
  it('names the side correctly (the old graph said "1.B" after White\'s first move)', () => {
    expect(positionLabel(0)).toBe('Start');
    expect(positionLabel(1, ['e4'])).toBe('After 1. e4');
    expect(positionLabel(2, ['e4', 'e5'])).toBe('After 1... e5');
    expect(positionLabel(33)).toBe('After 17.');
  });
  it('writes evaluations and mates', () => {
    expect(evalText(82)).toBe('+0.82');
    expect(evalText(-140)).toBe('-1.40');
    expect(evalText(10000)).toBe('White mates');
    expect(evalText(-10000)).toBe('Black mates');
  });
  it('the go-to button names the move', () => {
    expect(goToLabel(0)).toBe('Go to the start');
    expect(goToLabel(33)).toBe('Go to move 17');
    expect(goToLabel(34)).toBe('Go to move 17');
  });
});

describe('drawing', () => {
  it('draws in pixels at the box width, dots at a fixed radius', () => {
    const { svg } = setup();
    expect(svg.getAttribute('width')).toBe(String(WIDTH));
    expect(svg.getAttribute('viewBox')).toBeNull();
    expect(svg.querySelector('[data-graph-dot="mistake"]')!.getAttribute('r')).toBe('4');
  });
  it('draws a phase line where the middlegame starts, and the captions', () => {
    const { svg } = setup();
    const line = svg.querySelector('[data-phase-line="Middlegame"]')!;
    expect(Number(line.getAttribute('x1'))).toBeCloseTo((21 / 40) * WIDTH, 5);
    expect(screen.getAllByText('Opening').length).toBeGreaterThan(0);
  });
  it('uses colour roles, never fixed colours', () => {
    const { svg } = setup();
    for (const el of svg.querySelectorAll('[fill], [stroke]')) {
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (v && v !== 'none' && !v.startsWith('url(')) expect(v).toMatch(/^hsl\(var\(--/);
      }
    }
  });
});

describe('keyboard', () => {
  it('arrows move the mark from the board\'s move, Enter goes there', () => {
    const { svg, onMoveClick } = setup(10);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(screen.getByText(/After 6\./)).toBeTruthy(); // position 12 = after White's 6th move
    fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onMoveClick).toHaveBeenCalledWith(12);
  });
  it('Home and End go to the ends', () => {
    const { svg, onMoveClick } = setup(10);
    fireEvent.keyDown(svg, { key: 'End' });
    fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onMoveClick).toHaveBeenLastCalledWith(40);
    fireEvent.keyDown(svg, { key: 'Home' });
    fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onMoveClick).toHaveBeenLastCalledWith(0);
  });
});

describe('mouse and touch', () => {
  it('a mouse click goes to the move at once', () => {
    const { svg, onMoveClick } = setup();
    fireEvent.click(svg, { clientX: WIDTH / 2 });
    expect(onMoveClick).toHaveBeenCalledWith(20);
  });
  it('a tap marks the point and shows a button; only the button goes there', () => {
    const { svg, onMoveClick } = setup();
    fireEvent.pointerDown(svg, { clientX: WIDTH / 2, pointerType: 'touch' });
    fireEvent.click(svg, { clientX: WIDTH / 2 });
    expect(onMoveClick).not.toHaveBeenCalled();
    const btn = screen.getByRole('button', { name: 'Go to move 10' });
    fireEvent.click(btn);
    expect(onMoveClick).toHaveBeenCalledWith(20);
  });
});
