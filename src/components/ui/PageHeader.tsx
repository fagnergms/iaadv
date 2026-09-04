export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate pb-4">
      <h1 className="font-serif text-2xl font-semibold text-ink">{title}</h1>
      {action}
    </div>
  );
}
