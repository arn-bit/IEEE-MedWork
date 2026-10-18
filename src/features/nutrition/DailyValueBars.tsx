import type { Nutrients } from '../../nutrition/foods';

/**
 * %DV references for a 2,000-calorie diet (US FDA labelling values). They are a common yardstick, not a
 * personal target: what you actually need depends on your age, size, activity and health.
 */
export const DAILY_VALUE: Nutrients = { kcal: 2000, protein: 50, carbs: 275, fat: 78 };

const ROWS: { key: keyof Nutrients; label: string; unit: string; color: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', color: 'var(--brand)' },
  { key: 'protein', label: 'Protein', unit: 'g', color: 'var(--violet)' },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: 'var(--sun)' },
  { key: 'fat', label: 'Fat', unit: 'g', color: 'var(--pop)' },
];

export const percentDV = (value: number, key: keyof Nutrients) => Math.round((value / DAILY_VALUE[key]) * 100);

/**
 * Bars that fill as you add food. The dark part is what this photo adds, the lighter part is what you've
 * already logged today, and the track is the daily value. `animateKey` replays the fill for a new photo.
 */
export function DailyValueBars({ plate, before, animateKey, title = 'This plate' }: { plate: Nutrients; before?: Nutrients; animateKey: string; title?: string }) {
  const base = before ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  return (
    <div className="dv" role="group" aria-label={`${title}: share of the daily value`} key={animateKey}>
      {ROWS.map((r) => {
        const dv = DAILY_VALUE[r.key];
        const basePct = Math.min(100, (base[r.key] / dv) * 100);
        const platePct = Math.max(0, Math.min(100 - basePct, (plate[r.key] / dv) * 100));
        const totalPct = percentDV(base[r.key] + plate[r.key], r.key);
        return (
          <div key={r.key} className="dv-row">
            <div className="dv-head">
              <span className="dv-label">{r.label}</span>
              <span className="dv-val">
                <strong className="num">
                  {plate[r.key]}
                  {r.unit === 'g' ? ' g' : ' kcal'}
                </strong>{' '}
                <span className="muted">· {percentDV(plate[r.key], r.key)}% DV</span>
              </span>
            </div>
            <div
              className="dv-track"
              role="img"
              aria-label={`${r.label}: ${percentDV(plate[r.key], r.key)}% of the daily value from this plate, ${totalPct}% of the day in total`}
            >
              {basePct > 0 ? <span className="dv-fill dv-fill-base" style={{ width: `${basePct}%`, background: r.color }} /> : null}
              <span className="dv-fill" style={{ left: `${basePct}%`, width: `${platePct}%`, background: r.color }} />
            </div>
            {base[r.key] > 0 ? (
              <span className="tiny muted">
                Today in total: {totalPct}% of the daily value
                {totalPct > 100 ? ' (over)' : ''}
              </span>
            ) : null}
          </div>
        );
      })}
      <p className="tiny muted">Daily values assume a 2,000-calorie diet. Your own needs may be higher or lower.</p>
    </div>
  );
}
