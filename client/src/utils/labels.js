// Label colors → theme tokens (both light and dark are defined in globals.css).
// Server values: gray | moss | clay | gold | sky | plum.
export const LABEL_COLORS = ["gray", "moss", "clay", "gold", "sky", "plum"];

const LABEL_STYLES = {
  gray: { color: "var(--stone)", background: "var(--stone-tint)" },
  moss: { color: "var(--moss)", background: "var(--moss-light)" },
  clay: { color: "var(--clay)", background: "var(--clay-tint)" },
  gold: { color: "var(--gold)", background: "var(--gold-tint)" },
  sky: { color: "var(--sky)", background: "var(--sky-tint)" },
  plum: { color: "var(--plum)", background: "var(--plum-tint)" },
};

export const labelStyle = (color) => LABEL_STYLES[color] || LABEL_STYLES.gray;
