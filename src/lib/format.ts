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

export function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "New",
  preparing: "Preparing",
  served: "Served",
  billed: "Billed",
  cancelled: "Cancelled",
};

export const TABLE_STATUS_LABELS: Record<string, string> = {
  free: "Free",
  occupied: "Occupied",
  reserved: "Reserved",
  cleaning: "Cleaning",
};

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  wallet: "Wallet",
  credit: "Credit",
  other: "Other",
};

export const BILL_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  void: "Void",
};
