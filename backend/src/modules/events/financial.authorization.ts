export type FinancialRole =
  | "ADMIN"
  | "FINANCE_MANAGER"
  | "ORGANIZER"
  | "VIEWER";

export function canCreateFinancialTransaction(
  role: FinancialRole,
): boolean {
  return role === "ADMIN"
    || role === "FINANCE_MANAGER"
    || role === "ORGANIZER";
}

export function canReverseFinancialTransaction(
  role: FinancialRole,
): boolean {
  return role === "ADMIN" || role === "FINANCE_MANAGER";
}