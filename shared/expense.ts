// Expense categories the clinic tracks. Single source of truth for forms,
// validation, and the by-category breakdown. "inventario" purchases also add
// stock; "personal" is Isael's own spending, reported apart from the business.
export const EXPENSE_CATEGORIES = [
  { value: "inventario", label: "Compra de inventario" },
  { value: "proveedor", label: "Proveedor" },
  { value: "operativo", label: "Operativo" },
  { value: "personal", label: "Personal" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const EXPENSE_CATEGORY_VALUES: ExpenseCategory[] = EXPENSE_CATEGORIES.map(
  (c) => c.value,
);

export const PERSONAL_CATEGORY: ExpenseCategory = "personal";

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORY_VALUES as string[]).includes(value);
}

export function expenseCategoryLabel(value?: string | null): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.value === value);
  return found?.label ?? "Sin categoría";
}
