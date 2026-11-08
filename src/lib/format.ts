import type { AppRole } from "@/lib/types/database";

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  cashier: "Cashier",
  waiter: "Waiter",
  kitchen: "Kitchen",
};

export function roleLabel(role: AppRole) {
  return ROLE_LABELS[role] ?? role;
}

export function formatDate(value: string | null, timeZone = "Asia/Kolkata") {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

export function formatDateTime(value: string | null, timeZone = "Asia/Kolkata") {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
