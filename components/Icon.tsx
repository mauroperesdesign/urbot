const PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  home: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z',
  library: 'M5 4h4v16H5zM10 4h4v16h-4zM15.5 4.5l3.8-1 3.2 15.5-3.8 1z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  book: 'M3 5.5C3 4.7 3.7 4 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4.5A1.5 1.5 0 0 1 3 16.5zM21 5.5c0-.8-.7-1.5-1.5-1.5H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5.5a1.5 1.5 0 0 0 1.5-1.5z',
  headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M3 14h4v6H4.5A1.5 1.5 0 0 1 3 18.5zM17 14h4v4.5a1.5 1.5 0 0 1-1.5 1.5H17z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 6l6 6-6 6',
  chevronUp: 'M6 15l6-6 6 6',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  list: 'M4 6h16M4 12h16M4 18h10',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  timer: 'M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9v4l2.5 2M9 2h6',
};

export function Icon({ name, size = 20, stroke = 1.9 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function PlayIcon({ size = 16 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M8 4.5v15l12-7.5z" /></svg>;
}
export function PauseIcon({ size = 16 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
}
