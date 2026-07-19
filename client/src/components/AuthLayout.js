// AuthLayout frames the sign-in and sign-up flows with Afritask's brand voice.
const currentYear = 2026;

export default function AuthLayout({ eyebrow, title, subtitle, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel - signature element: a stack of task lines that feels like a planner page */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "var(--ink)" }}
      >
        <div className="relative z-10">
          <span className="font-display text-2xl italic" style={{ color: "var(--paper)" }}>
            Afritask
          </span>
        </div>

        <div className="relative z-10 max-w-sm">
          <p className="font-display text-4xl leading-tight mb-6" style={{ color: "var(--paper)" }}>
            Built for the rhythm of African work.
          </p>
          <div className="flex flex-col gap-3 mt-10">
            {[
              { text: "Draft the weekly client recap", done: true },
              { text: "Reply to team feedback", done: true },
              { text: "Plan next sprint", done: false },
              { text: "Lock in offsite travel", done: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-[5px] flex items-center justify-center flex-shrink-0"
                  style={{
                    border: `1.5px solid ${item.done ? "var(--moss)" : "color-mix(in srgb, var(--paper) 30%, transparent)"}`,
                    background: item.done ? "var(--moss)" : "transparent",
                  }}
                >
                  {item.done && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
                      <path
                        d="M1 3.5L3.2 5.7L8 1"
                        stroke="var(--paper)"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className="text-sm"
                  style={{
                    color: item.done
                      ? "color-mix(in srgb, var(--paper) 45%, transparent)"
                      : "color-mix(in srgb, var(--paper) 85%, transparent)",
                    textDecoration: item.done ? "line-through" : "none",
                  }}
                >
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p
          className="relative z-10 text-xs"
          style={{ color: "color-mix(in srgb, var(--paper) 40%, transparent)" }}
        >
          &copy; {currentYear} Afritask
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <span className="font-display text-2xl italic" style={{ color: "var(--ink)" }}>
              Afritask
            </span>
          </div>
          {eyebrow && (
            <p
              className="text-xs font-medium tracking-wide uppercase mb-2"
              style={{ color: "var(--moss)" }}
            >
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl mb-2" style={{ color: "var(--ink)" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
