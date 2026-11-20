// @vitest-environment node
/**
 * The build render's protection (prerender plan A7): nothing from the network can enter a built page, even when the
 * page catches the failure. Runs in Node, like the build.
 */
import { describe, expect, it } from 'vitest';
import { render, renderElement } from '@/entry-prerender';

function CatchesItsFetch() {
  // what a page does when a request fails: it shows its error state; the render must fail anyway
  try { void fetch('https://api.chessplaybook.com/api/puzzles/daily'); } catch { /* shown as an error state */ }
  return <p>error state</p>;
}

function FetchesUncaught() {
  void fetch('https://api.chessplaybook.com/api/openings/export');
  return <p>never</p>;
}

function LeavesARejection() {
  void Promise.reject(new Error('an API answer that failed'));
  return <p>looks fine</p>;
}

function OpensASocket() {
  try { new WebSocket('wss://api.chessplaybook.com/ws'); } catch { /* caught */ }
  return <p>socket</p>;
}

describe('the build render (prerender plan A7)', () => {
  it('renders a page that stays off the network', async () => {
    expect(await renderElement(<p>written text</p>, 'plain')).toContain('written text');
  });

  it('fails a page that tried the network, even though it caught the error', async () => {
    await expect(renderElement(<CatchesItsFetch />, 'caught')).rejects.toThrow(/tried the network/);
  });

  it('fails a page whose fetch throws during render', async () => {
    await expect(renderElement(<FetchesUncaught />, 'uncaught')).rejects.toThrow(/network is closed|tried the network/);
  });

  it('fails a page that left a rejected promise unhandled', async () => {
    await expect(renderElement(<LeavesARejection />, 'rejection')).rejects.toThrow(/unhandled/);
  });

  it('closes WebSocket too', async () => {
    await expect(renderElement(<OpensASocket />, 'socket')).rejects.toThrow(/tried the network/);
  });

  it('renders /terms through the whole app tree, with its text and no network', async () => {
    const html = await render('/terms');
    expect(html).toContain('Terms of Service');
    expect(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length).toBeGreaterThan(800);
  });

  it('refuses a page that is not a prerendered route', async () => {
    await expect(render('/play')).rejects.toThrow(/not a prerendered route/);
  });
});
