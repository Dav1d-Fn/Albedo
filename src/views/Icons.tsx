// Line icons from the design (24px grid, stroke = currentColor).

const strokeProps =
{
  className: "i",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function HandheldIcon()
{
  return (
    <svg {...strokeProps}>
      <rect x="1.5" y="6" width="21" height="12" rx="4" />
      <rect x="7.5" y="9" width="9" height="6" rx="1" />
    </svg>
  );
}

export function TvIcon()
{
  return (
    <svg {...strokeProps}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function SlidersIcon()
{
  return (
    <svg {...strokeProps}>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

export function CheckIcon()
{
  return (
    <svg {...strokeProps}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function SwapIcon()
{
  return (
    <svg {...strokeProps}>
      <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />
    </svg>
  );
}

export function PlusIcon()
{
  return (
    <svg {...strokeProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon()
{
  return (
    <svg {...strokeProps} strokeWidth={2.4}>
      <path d="M6 12h12" />
    </svg>
  );
}

export function ChevronLeftIcon()
{
  return (
    <svg {...strokeProps} strokeWidth={2.4}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon()
{
  return (
    <svg {...strokeProps} strokeWidth={2.4}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function PlayIcon()
{
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
    </svg>
  );
}

export function DeviceIcon(props: { device: "handheld" | "tv" })
{
  return props.device === "tv" ? <TvIcon /> : <HandheldIcon />;
}
