export function buttonClass(
  variant: "primary" | "secondary" | "danger" = "primary"
) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-brass text-white hover:bg-brass-dark",
    secondary: "border border-slate text-ink hover:bg-slate-soft",
    danger: "border border-brick text-brick hover:bg-brick-bg",
  };
  return `${base} ${variants[variant]}`;
}
