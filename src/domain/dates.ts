/** Monday = 0 … Sunday = 6, matching plan.schedule indexes. */
export const todayIndex = (d: Date = new Date()): number => (d.getDay() + 6) % 7;
