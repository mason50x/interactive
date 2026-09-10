/**
 * The four colours the landing page's drawings are made of, as the CSS
 * variables they resolve to.
 *
 * SVG attributes take a string, not a class, so a diagram cannot say
 * `stroke-border-strong` the way a div would. Naming the strings here keeps
 * every picture on the page drawing its lines, its labels and its one lit
 * branch from the same tokens, and following the theme when they change.
 */
export const stroke = "var(--border-strong)";
export const ink = "var(--foreground)";
export const muted = "var(--muted-foreground)";
export const accent = "var(--primary)";
