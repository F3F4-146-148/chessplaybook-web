/**
 * Where the analysis card's saved choices live: on/off (AnalysisService) and the number of lines (useEngineAnalysis).
 * Both change a page's first render, so hydrateCheck.js names them for the built pages that hold an analysis card, and
 * its test imports them from here (prerender plan E0, 2026-11-20).
 */
export const ANALYSIS_CONFIG_KEY = 'analysis_config';
export const PV_COUNT_KEY = 'chessPvCount';
