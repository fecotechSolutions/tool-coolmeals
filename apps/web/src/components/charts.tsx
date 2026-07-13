"use client";

type Slice = { label: string; value: number; color?: string };

const PALETTE = [
  "#03487a",
  "#0f8fb3",
  "#d0b48f",
  "#11195c",
  "#bbd8f9",
  "#575757",
  "#1b8917",
  "#b8956c",
];

export function BarChart({
  title,
  data,
}: {
  title: string;
  data: Slice[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <div className="bar-chart">
        {data.map((item, i) => (
          <div key={item.label} className="bar-row">
            <span className="bar-label">{formatLabel(item.label)}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  background: item.color ?? PALETTE[i % PALETTE.length],
                }}
              />
            </div>
            <span className="bar-value">{item.value}</span>
          </div>
        ))}
        {data.length === 0 ? <p className="muted">Sin datos</p> : null}
      </div>
    </section>
  );
}

export function DonutChart({
  title,
  data,
}: {
  title: string;
  data: Slice[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  let offset = 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <div className="donut-wrap">
        <svg viewBox="0 0 140 140" className="donut-svg" aria-hidden>
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#e6eee8"
            strokeWidth="16"
          />
          {data.map((item, i) => {
            const length = (item.value / total) * circumference;
            const circle = (
              <circle
                key={item.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth="16"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += length;
            return circle;
          })}
          <text
            x="70"
            y="66"
            textAnchor="middle"
            className="donut-total"
            fill="#03487a"
            fontSize="18"
            fontWeight="700"
          >
            {total}
          </text>
          <text
            x="70"
            y="84"
            textAnchor="middle"
            fill="#5a6b60"
            fontSize="9"
          >
            total
          </text>
        </svg>
        <ul className="legend">
          {data.map((item, i) => (
            <li key={item.label}>
              <span
                className="legend-dot"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              {formatLabel(item.label)}
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FunnelChart({
  title,
  data,
}: {
  title: string;
  data: Slice[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <div className="funnel">
        {data.map((item, i) => {
          const width = 40 + (item.value / max) * 60;
          return (
            <div
              key={item.label}
              className="funnel-step"
              style={{
                width: `${width}%`,
                background: PALETTE[i % PALETTE.length],
              }}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function MultiSeriesBarChart({
  title,
  series,
  categories,
}: {
  title: string;
  categories: string[];
  series: Array<{ key: string; label: string; values: number[]; color?: string }>;
}) {
  const max = Math.max(...series.flatMap((s) => s.values), 1);

  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <div className="multi-legend">
        {series.map((s, i) => (
          <span key={s.key} className="multi-legend-item">
            <i style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="multi-chart">
        {categories.map((category, idx) => (
          <div key={category} className="multi-group">
            <div className="multi-bars">
              {series.map((s, i) => (
                <div
                  key={s.key}
                  className="multi-bar"
                  title={`${s.label}: ${s.values[idx] ?? 0}`}
                  style={{
                    height: `${((s.values[idx] ?? 0) / max) * 100}%`,
                    background: s.color ?? PALETTE[i % PALETTE.length],
                  }}
                />
              ))}
            </div>
            <span className="multi-cat">{category}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ComparisonList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    current: number;
    previous: number;
    deltaPct: number | null;
  }>;
}) {
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <div className="compare-list">
        {rows.map((row) => {
          const up = (row.deltaPct ?? 0) > 0;
          const flat = row.deltaPct === 0 || row.deltaPct === null;
          return (
            <div key={row.label} className="compare-row">
              <div>
                <strong>{row.label}</strong>
                <p className="muted">
                  Mes actual {row.current} · Anterior {row.previous}
                </p>
              </div>
              <span
                className={`compare-delta ${flat ? "is-flat" : up ? "is-up" : "is-down"}`}
              >
                {row.deltaPct === null
                  ? "—"
                  : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatLabel(label: string) {
  return label.replaceAll("_", " ");
}
