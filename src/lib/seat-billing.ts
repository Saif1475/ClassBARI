// Institute size and plan: the standard plan covers up to PLAN_STUDENT_LIMIT students.
// Bigger institutes contact ClassBARI for a price (no per-student price is shown in the app).

export const PLAN_STUDENT_LIMIT = 250;
export const NEAR_LIMIT = 0.9; // from 90% of the limit we suggest calling early

export function planUsage(students: number) {
  const pct = Math.min(100, Math.round((students / PLAN_STUDENT_LIMIT) * 100));
  return { students, limit: PLAN_STUDENT_LIMIT, pct, near: students >= PLAN_STUDENT_LIMIT * NEAR_LIMIT, over: students > PLAN_STUDENT_LIMIT };
}
