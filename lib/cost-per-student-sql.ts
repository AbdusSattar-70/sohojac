/** Read-only, all-record operating-cost measure. Do not present this as full cost or profit. */
export const costPerStudentSql={
  activeStudents: [
    "SELECT COUNT(DISTINCT e.student_id) AS n FROM academy_enrollments e",
    "JOIN academy_students s ON s.id=e.student_id",
    "WHERE e.status='ACTIVE' AND s.status='ACTIVE' AND s.merged_into_id IS NULL"
  ].join(" "),
  operatingExpense: [
    "SELECT COUNT(*) AS entries,COALESCE(SUM(amount_paisa),0) AS paisa",
    "FROM finance_operating_expenses WHERE spent_on>=? AND spent_on<=?"
  ].join(" "),
  expenseCategories: [
    "SELECT category,COUNT(*) AS entries,SUM(amount_paisa) AS paisa",
    "FROM finance_operating_expenses WHERE spent_on>=? AND spent_on<=?",
    "GROUP BY category ORDER BY paisa DESC,category"
  ].join(" "),
} as const;
export function costPerActiveStudentPaisa(totalPaisa:number,students:number):number|null{
 if(!Number.isSafeInteger(totalPaisa)||totalPaisa<0||!Number.isSafeInteger(students)||students<0)
  throw Error("Invalid operating cost inputs");
 return students===0?null:Math.round(totalPaisa/students);
}
