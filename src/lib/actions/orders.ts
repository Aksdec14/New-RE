"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  field,
  integerField,
  numberField,
  optional,
  withQuery,
} from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const LIST = "/dashboard/orders";

function fail(path: string, message: string): never {
  redirect(withQuery(path, { error: message }));
}

function orderPath(orderId: string) {
  return `${LIST}/${orderId}`;
}

function billPath(billId: string) {
  return `/dashboard/billing/${billId}`;
}

/** Collects the `qty_<menu_item_id>` fields rendered by the order screens. */
function collectItems(formData: FormData) {
  const items: Array<{ menu_item_id: string; quantity: number }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;

    const quantity = Number.parseFloat(String(value));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    items.push({
      menu_item_id: key.slice(4),
      quantity: Math.round(quantity * 100) / 100,
    });
  }

  return items;
}

export async function createOrder(formData: FormData) {
  const supabase = await createClient();
  const restaurantId = field(formData, "restaurant_id");
  const items = collectItems(formData);

  if (!restaurantId) fail(LIST, "Missing workspace.");
  if (items.length === 0) fail(`${LIST}/new`, "Add at least one item.");

  const tableId = optional(field(formData, "table_id"));
  const orderType = field(formData, "order_type") || "dine_in";

  if (orderType === "dine_in" && !tableId) {
    fail(`${LIST}/new`, "Pick a table for a dine-in order.");
  }

  const { data, error } = await supabase.rpc("create_order", {
    p_restaurant_id: restaurantId,
    p_client_id: crypto.randomUUID(),
    p_items: items,
    p_table_id: tableId,
    p_order_type: orderType,
    p_cover_count: integerField(formData, "cover_count", 1),
    p_customer_name: optional(field(formData, "customer_name")),
    p_customer_phone: optional(field(formData, "customer_phone")),
    p_notes: optional(field(formData, "notes")),
  });

  if (error) fail(`${LIST}/new`, error.message);

  revalidatePath(LIST);
  revalidatePath("/dashboard");
  redirect(orderPath(String(data)));
}

export async function addOrderItems(formData: FormData) {
  const supabase = await createClient();
  const orderId = field(formData, "order_id");
  const items = collectItems(formData);

  if (!orderId) fail(LIST, "Missing order.");
  if (items.length === 0) fail(orderPath(orderId), "Pick at least one item.");

  const { error } = await supabase.rpc("add_order_items", {
    p_order_id: orderId,
    p_items: items,
  });

  if (error) fail(orderPath(orderId), error.message);

  revalidatePath(orderPath(orderId));
  redirect(withQuery(orderPath(orderId), { ok: "Items added." }));
}

export async function updateOrderStatus(formData: FormData) {
  const supabase = await createClient();
  const orderId = field(formData, "order_id");
  const status = field(formData, "status");

  if (!orderId) fail(LIST, "Missing order.");

  const { error } = await supabase.rpc("update_order_status", {
    p_order_id: orderId,
    p_status: status,
  });

  if (error) fail(orderPath(orderId), error.message);

  revalidatePath(LIST);
  revalidatePath(orderPath(orderId));
  redirect(withQuery(orderPath(orderId), { ok: `Order marked ${status}.` }));
}

export async function voidOrderItem(formData: FormData) {
  const supabase = await createClient();
  const orderId = field(formData, "order_id");
  const itemId = field(formData, "item_id");
  const reason = field(formData, "reason");

  if (!orderId || !itemId) fail(LIST, "Missing order item.");
  if (reason.length < 3) fail(orderPath(orderId), "Give a short reason.");

  const { error } = await supabase.rpc("void_order_item", {
    p_order_item_id: itemId,
    p_reason: reason,
  });

  if (error) fail(orderPath(orderId), error.message);

  revalidatePath(orderPath(orderId));
  redirect(withQuery(orderPath(orderId), { ok: "Item voided." }));
}

export async function generateBill(formData: FormData) {
  const supabase = await createClient();
  const orderId = field(formData, "order_id");

  if (!orderId) fail(LIST, "Missing order.");

  const percent = field(formData, "discount_percent");
  const paymentMode = optional(field(formData, "payment_mode"));

  const { data, error } = await supabase.rpc("generate_bill", {
    p_order_id: orderId,
    p_discount_amount: percent ? 0 : numberField(formData, "discount_amount"),
    p_discount_percent: percent ? numberField(formData, "discount_percent") : null,
    p_payment_mode: paymentMode,
    p_idempotency_key: crypto.randomUUID(),
    p_is_interstate: field(formData, "is_interstate") === "on",
  });

  if (error) fail(orderPath(orderId), error.message);

  revalidatePath(LIST);
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");
  redirect(billPath(String(data)));
}

export async function recordPayment(formData: FormData) {
  const supabase = await createClient();
  const billId = field(formData, "bill_id");
  const mode = field(formData, "mode");
  const amount = numberField(formData, "amount", 0);

  if (!billId) fail("/dashboard/billing", "Missing bill.");
  if (amount <= 0) fail(billPath(billId), "Payment must be greater than zero.");

  const { error } = await supabase.rpc("record_payment", {
    p_bill_id: billId,
    p_mode: mode,
    p_amount: amount,
    p_reference: optional(field(formData, "reference")),
    p_client_id: crypto.randomUUID(),
  });

  if (error) fail(billPath(billId), error.message);

  revalidatePath(billPath(billId));
  revalidatePath("/dashboard/billing");
  redirect(withQuery(billPath(billId), { ok: "Payment recorded." }));
}

export async function voidBill(formData: FormData) {
  const supabase = await createClient();
  const billId = field(formData, "bill_id");
  const reason = field(formData, "reason");

  if (!billId) fail("/dashboard/billing", "Missing bill.");
  if (reason.length < 3) fail(billPath(billId), "Give a short reason.");

  const { error } = await supabase.rpc("void_bill", {
    p_bill_id: billId,
    p_reason: reason,
  });

  if (error) fail(billPath(billId), error.message);

  revalidatePath(billPath(billId));
  revalidatePath("/dashboard/billing");
  redirect(withQuery(billPath(billId), { ok: "Bill voided." }));
}
