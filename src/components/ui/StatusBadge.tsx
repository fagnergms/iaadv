export function StatusBadge({
  tone,
  children,
}: {
  tone: "moss" | "brick" | "slate";
  children: React.ReactNode;
}) {
  const tones = {
    moss: "bg-moss-bg text-moss",
    brick: "bg-brick-bg text-brick",
    slate: "bg-slate-soft text-ink-muted",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
