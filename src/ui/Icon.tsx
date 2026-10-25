const PATHS: Record<string, string[]> = {
  home: ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  truck: ['M2 6h11v10H2z', 'M13 9h4l4 4v3h-8z', 'M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M19 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  users: ['M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z', 'M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.5c2 .6 3.2 2.6 3.5 5.5'],
  user: ['M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z', 'M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5'],
  wallet: ['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z', 'M16.5 14.5h.01'],
  plus: ['M12 5v14M5 12h14'],
  search: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'M20 20l-4-4'],
  back: ['M9 5l7 7-7 7'],
  chevron: ['M15 5l-7 7 7 7'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  close: ['M6 6l12 12M18 6L6 18'],
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'],
  box: ['M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z', 'M3 7.5l9 4.5 9-4.5', 'M12 12v9'],
  down: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  up: ['M12 20V8', 'M7 13l5-5 5 5', 'M4 4h16'],
  swap: ['M7 4L3 8l4 4', 'M3 8h14', 'M17 20l4-4-4-4', 'M21 16H7'],
  ret: ['M9 14L4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  count: ['M9 4h6v3H9z', 'M7 5H5v16h14V5h-2', 'M9 13l2 2 4-4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  menu: ['M4 7h16M4 12h16M4 17h10'],
  cloud: ['M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4.5 4.5 0 0 1 17.5 18z'],
  chat: ['M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-5A8.5 8.5 0 1 1 21 11.5z'],
  file: ['M14 3H6v18h12V7z', 'M14 3v4h4', 'M9 13h6M9 17h6'],
  settings: ['M4 7h9M17 7h3M4 17h3M11 17h9', 'M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2'],
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17h.01'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20a2 2 0 0 0 4 0'],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, small, className, style }: { name: IconName; small?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`ic${small ? ' s' : ''}${className ? ' ' + className : ''}`} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
