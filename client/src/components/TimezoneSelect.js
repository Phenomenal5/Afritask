// TimezoneSelect is the IANA zone picker used by onboarding and the profile page.
import { formatTimezoneLabel, listTimezones } from "@/utils/timezones";

export default function TimezoneSelect({ value, onChange, name = "timezone", hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium" style={{ color: "var(--ink)" }}>
        Timezone
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-colors outline-none"
        style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
      >
        {listTimezones(value).map((zone) => (
          <option key={zone} value={zone}>
            {formatTimezoneLabel(zone)}
          </option>
        ))}
      </select>
      {hint && (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
