import { describe, expect, it } from 'vitest';

import voiced from './guidedVoiceLines.json';
import { DRAW_LINES, ENGINE_BUSY_LINE, WARNING_LINES } from './useGuidedGame';
import { GUIDED_INVITATION } from '../components/GuidedMock';

/** #428 C6: every line the page says itself in a guided game is among the recorded ones. */
describe('the guided lines the page says are voiced', () => {
  it('the fallback warnings, the draw lines, the engine-busy line and the invitation', () => {
    for (const t of [...Object.values(WARNING_LINES), ...Object.values(DRAW_LINES), ENGINE_BUSY_LINE, GUIDED_INVITATION]) {
      expect(voiced).toContain(t);
    }
  });
});
