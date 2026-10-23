// One drawn icon per status, same 24px grid and 2px stroke, so a job worker who barely reads
// can tell the four statuses apart by shape as well as colour.
const PATHS: Record<string, React.ReactNode> = {
  Sent: <path d="M4 12l16-8-6 16-3-7-7-1z" />, // paper plane
  Received: (
    <>
      <path d="M3 13l3-8h12l3 8" />
      <path d="M3 13v6h18v-6h-5a4 4 0 0 1-8 0H3z" />
    </>
  ), // inbox tray
  "In process": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ), // cog
  Ready: <path d="M5 12.5l4.5 4.5L19 7.5" />, // tick
  Dispatched: (
    <>
      <path d="M2 6h12v10H2zM14 9h4l4 4v3h-8z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ), // truck
};

export function StatusIcon({ status, size = 20 }: { status: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[status] ?? PATHS.Sent}
    </svg>
  );
}

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);
export const StopIcon = () => (
  <Icon>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
);
export const FilterIcon = () => (
  <Icon>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
);
export const DocIcon = () => (
  <Icon>
    <path d="M14 3H6v18h12V7z" />
    <path d="M14 3v4h4M9 13h6M9 17h6" />
  </Icon>
);
export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CameraIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
