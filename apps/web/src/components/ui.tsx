export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function KpiGrid({
  items,
}: {
  items: Array<{ label: string; value: string | number; hint?: string }>;
}) {
  return (
    <div className="kpi-grid">
      {items.map((item) => (
        <article key={item.label} className="kpi-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.hint ? <small>{item.hint}</small> : null}
        </article>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function StatusBadge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "info";
}) {
  return <span className={`status-badge tone-${tone}`}>{children}</span>;
}
