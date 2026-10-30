/** Non-monthly plans must keep dueDay null, including when loading an existing plan. */
export function defaultDueDay(cycle: "MONTHLY" | "TERM" | "ONE_TIME" = "MONTHLY", day: number | null = null) {
  return cycle === "MONTHLY" ? day ?? 10 : null;
}
