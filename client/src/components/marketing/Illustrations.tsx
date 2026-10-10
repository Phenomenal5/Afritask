// Original illustrations for the landing page. All decorative (aria-hidden): the text
// beside each one carries the meaning.

// Hero: a path that starts at a plan, passes the people doing it, and arrives at progress.
export function PathIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 460" fill="none" aria-hidden="true" className={className}>
      {/* soft ground shapes */}
      <ellipse cx="300" cy="400" rx="250" ry="38" fill="var(--lime)" opacity="0.55" />
      <circle cx="470" cy="90" r="70" fill="var(--harvest)" opacity="0.22" />

      {/* the path: a soft halo, then the line that draws itself on top */}
      <path d="M70 360 C 160 360, 170 250, 255 245 S 360 250, 380 180 S 440 95, 485 90" stroke="var(--lime-deep)" strokeWidth="14" strokeLinecap="round" opacity="0.35" />
      <path
        className="draw-path"
        d="M70 360 C 160 360, 170 250, 255 245 S 360 250, 380 180 S 440 95, 485 90"
        stroke="var(--forest)"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* plan card */}
      <g transform="translate(20 280)">
        <rect width="120" height="96" rx="14" fill="var(--surface)" stroke="var(--border)" />
        <rect x="14" y="16" width="56" height="8" rx="4" fill="var(--forest)" />
        <rect x="14" y="36" width="88" height="6" rx="3" fill="var(--border)" />
        <rect x="14" y="50" width="70" height="6" rx="3" fill="var(--border)" />
        <rect x="14" y="64" width="80" height="6" rx="3" fill="var(--border)" />
        <circle cx="100" cy="20" r="7" fill="var(--harvest)" />
      </g>

      {/* people */}
      <g transform="translate(205 180)">
        <rect x="-14" y="-12" width="128" height="78" rx="16" fill="var(--surface)" stroke="var(--border)" />
        <circle cx="22" cy="20" r="18" fill="var(--harvest)" />
        <circle cx="22" cy="15" r="7" fill="var(--forest)" opacity="0.85" />
        <path d="M9 32c3-7 9-10 13-10s10 3 13 10" fill="var(--forest)" opacity="0.85" />
        <circle cx="58" cy="20" r="18" fill="var(--lime)" />
        <circle cx="58" cy="15" r="7" fill="var(--forest)" opacity="0.85" />
        <path d="M45 32c3-7 9-10 13-10s10 3 13 10" fill="var(--forest)" opacity="0.85" />
        <circle cx="94" cy="20" r="18" fill="var(--surface-muted)" stroke="var(--border)" strokeDasharray="4 4" />
        <path d="M94 13v14M87 20h14" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="6" y="46" width="76" height="6" rx="3" fill="var(--border)" />
      </g>

      {/* progress */}
      <g transform="translate(418 30)">
        <circle cx="67" cy="60" r="44" fill="var(--forest)" />
        <path d="M48 61l13 13 26-27" stroke="var(--lime)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(330 300)">
        <rect width="190" height="64" rx="14" fill="var(--surface)" stroke="var(--border)" />
        <rect x="16" y="18" width="80" height="7" rx="3.5" fill="var(--text)" opacity="0.75" />
        <rect x="16" y="38" width="158" height="8" rx="4" fill="var(--surface-muted)" />
        <rect x="16" y="38" width="112" height="8" rx="4" fill="var(--status-done)" />
      </g>
    </svg>
  );
}

// Workspace → projects → tasks, drawn as nested frames.
export function StructureIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 340" fill="none" aria-hidden="true" className={className}>
      <rect x="6" y="6" width="508" height="328" rx="20" fill="var(--surface)" stroke="var(--forest)" strokeWidth="2" />
      <rect x="26" y="24" width="150" height="12" rx="6" fill="var(--forest)" />
      <circle cx="470" cy="30" r="10" fill="var(--harvest)" />
      <circle cx="450" cy="30" r="10" fill="var(--lime-deep)" />

      {[0, 1].map((column) => (
        <g key={column} transform={`translate(${26 + column * 248} 56)`}>
          <rect width="222" height="256" rx="14" fill="var(--surface-muted)" stroke="var(--border)" />
          <rect x="16" y="16" width="96" height="10" rx="5" fill="var(--text)" opacity="0.7" />
          {[0, 1, 2].map((row) => (
            <g key={row} transform={`translate(14 ${44 + row * 66})`}>
              <rect width="194" height="54" rx="10" fill="var(--surface)" stroke="var(--border)" />
              <circle cx="20" cy="27" r="8" stroke={row === 0 && column === 0 ? "var(--status-done)" : "var(--text-muted)"} strokeWidth="2" fill={row === 0 && column === 0 ? "var(--status-done)" : "none"} />
              <rect x="38" y="18" width={100 - row * 14} height="7" rx="3.5" fill="var(--text)" opacity="0.65" />
              <rect x="38" y="32" width="58" height="6" rx="3" fill="var(--border)" />
              <circle cx="174" cy="27" r="9" fill={row === 1 ? "var(--harvest)" : "var(--lime)"} />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
