/**
 * #177 (owner, 2026-11-17, option B "kind markers"): every reason of the opening trainer's "Why this move" card
 * carries a small marker for its kind, in the order the reasons arrive (the owner's order rulings stand; nothing is
 * grouped or trimmed). The reason's key comes from the backend explainer (OpeningMoveExplainer.ts); this maps each
 * key to one of five kinds. A key missing here falls back to development and activity, and a test fails until it
 * is filed (reasonKinds.test.ts reads the backend's keys).
 */
export type ReasonKind = 'threat' | 'centre' | 'development' | 'king' | 'structure';

export const REASON_KIND_NAMES: Record<ReasonKind, string> = {
  threat: 'Threats and tactics',
  centre: 'The centre and space',
  development: 'Development and activity',
  king: 'The king and defence',
  structure: 'Structure and trades',
};

const FAMILIES: Record<ReasonKind, string> = {
  threat: 'attacks threatens win_threat gains tempo check_threat fork_threat push_threat doubles_threat pins battery '
    + 'battery_open battery_next battery_masked xray discovery uncovers takes_attacker check check_attack retreat_hit '
    + 'takes_away castle_stop stops_freeing '
    // G1 (2026-11-20): a mate threat, and the pawn offer's compensation that hits the other side
    + 'mate_threat comp_file comp_king comp_piece',
  centre: 'centre broad_centre control space challenge status_quo holds_break outer_pawn tension contests blocks '
    + 'supports_break flexible opposes in_front noblock phalanx',
  development: 'development activity clears diagonal file rooks rook_file rook_room rook_way rook_lift rooks_double '
    + 'knight_square fianchetto frees prepares slight queen_behind queen_file back_rank unblocks freeing '
    + 'rook_play room_knight king_room unblocks_push comp_time',
  king: 'defends also_defends guards_loose piece_back castle king king_cover luft king_flank king_centre king_line '
    + 'king_shelter castle_opens castle_lost check_answer check_choice unpin pin_challenge avoids_fork escapes '
    + 'blocks_check pawn_unpinned frees_pinned pawn_freed preempt '
    + 'saves saves_push interposes stops_pin king_dark king_tucked king_file retreat_square away_minor comp_ours',
  structure: 'capture trades doubled doubles bad_bishop bishop_pair gambit supports rook_pawn concedes pawn_offer',
};

export const REASON_KIND: Record<string, ReasonKind> = Object.fromEntries(
  (Object.entries(FAMILIES) as Array<[ReasonKind, string]>).flatMap(([kind, keys]) => keys.split(' ').map((k) => [k, kind])),
);

export function reasonKind(key: string | undefined): ReasonKind {
  return (key && REASON_KIND[key]) || 'development';
}
