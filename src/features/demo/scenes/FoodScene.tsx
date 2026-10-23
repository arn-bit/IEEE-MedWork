import { foodById, scaleFood, type Nutrients } from '../../../nutrition/foods';
import type { PlateItem } from '../../../nutrition/recognize';
import { DailyValueBars } from '../../nutrition/DailyValueBars';
import type { SceneProps, ModelState } from '../DemoPage';

/** A prepared result for the sample photo: used only if the on-device models did not finish in time. */
const PREPARED = [
  { foodId: 'hamburger', servings: 0.9, p: 0.51 },
  { foodId: 'french_fries', servings: 0.5, p: 0.36 },
];
const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
/** After this long in the scene, use the prepared result so the one-minute timeline never stalls. */
const GIVE_UP_MS = 3600;

export function FoodScene({ elapsed, plate, models }: SceneProps & { plate: PlateItem[] | null; models: ModelState }) {
  const real = plate && plate.length > 0 ? plate.map((p) => ({ foodId: p.foodId, servings: p.servings, p: p.p })) : null;
  const items = real ?? (elapsed > GIVE_UP_MS ? PREPARED : null);
  const live = !!real;
  const scanning = elapsed < (items ? 3600 : GIVE_UP_MS);
  const rows = (items ?? []).map((r) => {
    const f = foodById(r.foodId);
    return { ...r, name: f?.name ?? r.foodId, n: f ? scaleFood(f, r.servings) : ZERO, grams: f ? Math.round(f.grams * r.servings) : 0 };
  });
  const total = rows.reduce<Nutrients>((a, r) => ({ kcal: a.kcal + r.n.kcal, protein: a.protein + r.n.protein, carbs: a.carbs + r.n.carbs, fat: a.fat + r.n.fat }), ZERO);
  const start = items ? Math.max(3600, Math.min(elapsed, 3800)) : 3600;
  const revealAt = (i: number) => (items && elapsed > Math.max(start, 3700) + i * 700 ? 1 : 0);
  const barsAt = Math.max(3700, 3700) + rows.length * 700 + 300;

  return (
    <div className="demo-food">
      <div className="demo-photo">
        <img src="/img/demo-plate.jpg" alt="A burger and a pile of chips on a wooden board" />
        {scanning ? <span className="demo-scan" aria-hidden="true" style={{ top: `${((elapsed % 1400) / 1400) * 100}%` }} /> : null}
        <span className="demo-photo-tag">{live ? 'Read on this device just now' : models === 'ready' ? 'Reading on this device…' : 'Prepared result'}</span>
      </div>
      <div className="demo-food-side">
        {scanning ? (
          <div className="demo-reading" role="status">
            Reading your plate…
          </div>
        ) : (
          <>
            <ul className="demo-items" aria-label="Foods found on the plate">
              {rows.map((r, i) => (
                <li key={r.foodId} className="demo-item" style={{ opacity: revealAt(i), transform: revealAt(i) ? 'none' : 'translateY(14px)' }}>
                  <span>
                    <strong>{r.name}</strong>
                    <span className="demo-item-sub">
                      {Math.round(r.p * 100)}% sure · about {r.grams} g, estimated from the photo
                    </span>
                  </span>
                  <span className="demo-item-kcal num">{r.n.kcal} kcal</span>
                </li>
              ))}
            </ul>
            {elapsed > barsAt ? (
              <div className="demo-total">
                <div className="demo-total-head">
                  <strong>Whole plate</strong>
                  <span className="num">{total.kcal} kcal</span>
                </div>
                <DailyValueBars plate={{ kcal: total.kcal, protein: Math.round(total.protein), carbs: Math.round(total.carbs), fat: Math.round(total.fat) }} animateKey="demo-plate" />
              </div>
            ) : null}
            {elapsed > barsAt + 2200 ? <p className="demo-learn">Wrong? Label it once, and it recognises that food next time. All on the device.</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
