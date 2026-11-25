import { Link } from 'react-router-dom';

/**
 * A player's name in a game list: a link to their profile only when they have one.
 *
 * `/player/:username` is an account's page. A game keeps the name the player had when it was
 * played, and for a guest that is `Guest-xxxx`, which no account has: every such link opened
 * "Player Not Found" (31 times in 11 days, 2026-11-23). The server now says which page each side
 * links to (`profile`, the account's current username, null for a guest or a deleted account).
 *
 * `profile` undefined means a server from before that field: keep the old behaviour (a link unless
 * the name is a raw federated id), so the site never loses a working link while the two halves
 * are deployed apart.
 */
export function isFederatedId(name: string): boolean {
  return /^(Google|Facebook|SignInWithApple)_/.test(name);
}

interface Props {
  username: string;
  profile?: string | null;
  className?: string;
}

export function OpponentName({ username, profile, className = '' }: Props) {
  if (isFederatedId(username)) {
    return <span className={`text-muted-foreground ${className}`}>Anonymous</span>;
  }
  const target = profile === undefined ? username : profile;
  if (!target) {
    return <span className={className}>{username}</span>;
  }
  return (
    <Link to={`/player/${encodeURIComponent(target)}`} className={`hover:text-link transition-colors ${className}`}>
      {username}
    </Link>
  );
}
