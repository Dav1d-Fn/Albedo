/** Stroke icons of the design (24×24 view box), drawn in the current text color. */
const iconPaths: Record<string, string> =
{
  library: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  gamepad: "M7 7h10a5 5 0 0 1 0 11H7A5 5 0 0 1 7 7zM7 11v3M5.5 12.5h3M15.5 12h.01M18 13.5h.01",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5",
  reload: "M5 12a7 7 0 0 1 12-5l2 2M19 12a7 7 0 0 1-12 5l-2-2M19 4v5h-5M5 20v-5h5",
  check: "M5 12l5 5L20 7",
  chevron: "M6 9l6 6 6-6",
  info: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 8h.01M11 12h1v5h1",
  image: "M3 4h18v16H3zM9 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM21 16l-5-5-9 9",
  close: "M6 6l12 12M18 6L6 18",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  warning: "M12 3L2 20h20L12 3zM12 10v4M12 17h.01",
  plus: "M12 5v14M5 12h14",
};

export function Icon({ name, size = 18 }: { name: string; size?: number })
{
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}
