// IANA timezone helpers shared by onboarding and the profile page.

// The device's zone, e.g. "Africa/Lagos". Falls back to UTC if the browser can't say.
export const detectTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

// Every zone the browser knows, always including `currentTimezone`. Falls back to just
// that zone if the browser lacks Intl.supportedValuesOf (older Safari).
export const listTimezones = (currentTimezone) => {
  try {
    const zones = Intl.supportedValuesOf("timeZone");
    // "UTC" isn't always in the list, but it's the server default for new accounts.
    return zones.includes(currentTimezone) ? zones : [currentTimezone, ...zones];
  } catch {
    return [currentTimezone];
  }
};

export const formatTimezoneLabel = (zone) => zone.replaceAll("_", " ");
