// Reconhece links do YouTube e do Spotify colados no painel

export function youtubeId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/); id = m?.[1] ?? null; }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export type SpotifyRef = { kind: 'track' | 'episode' | 'album' | 'playlist' | 'show'; id: string };

export function spotifyRef(raw: string): SpotifyRef | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.hostname !== 'open.spotify.com') return null;
  const m = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|episode|album|playlist|show)\/([A-Za-z0-9]{10,40})/);
  return m ? { kind: m[1] as SpotifyRef['kind'], id: m[2] } : null;
}

export const spotifyUrl = (r: SpotifyRef) => `https://open.spotify.com/${r.kind}/${r.id}`;
export const spotifyEmbed = (r: SpotifyRef) => `https://open.spotify.com/embed/${r.kind}/${r.id}?utm_source=generator`;
