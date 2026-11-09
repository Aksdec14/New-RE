"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { field, integerField, optional, withQuery } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/tables";

const STATUSES = ["free", "occupied", "reserved", "cleaning"] as const;
type TableStatus = (typeof STATUSES)[number];

function fail(message: string): never {
  redirect(withQuery(PATH, { error: message }));
}

function done(message: string): never {
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(withQuery(PATH, { ok: message }));
}

export async function createTable(formData: FormData) {
  const supabase = await createClient();
  const restaurantId = field(formData, "restaurant_id");
  const label = field(formData, "label");
  const seats = integerField(formData, "seats", 4);

  if (!restaurantId) fail("Missing workspace.");
  if (label.length < 1) fail("Table label is required.");
  if (seats < 1) fail("Seats must be at least 1.");

  const { error } = await supabase.from("dining_tables").insert({
    restaurant_id: restaurantId,
    label,
    seats,
    floor: optional(field(formData, "floor")),
  });

  if (error) fail(error.message);
  done(`Table ${label} added.`);
}

export async function updateTable(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");
  const label = field(formData, "label");
  const seats = integerField(formData, "seats", 4);

  if (!id || !restaurantId) fail("Missing table.");
  if (label.length < 1) fail("Table label is required.");

  const { error } = await supabase
    .from("dining_tables")
    .update({
      label,
      seats,
      floor: optional(field(formData, "floor")),
    })
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done("Table updated.");
}

export async function deleteTable(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");

  if (!id || !restaurantId) fail("Missing table.");

  const { error } = await supabase
    .from("dining_tables")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done("Table removed.");
}

export async function setTableStatus(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const status = field(formData, "status");

  if (!id) fail("Missing table.");
  if (!STATUSES.includes(status as TableStatus)) fail("Unknown status.");

  const { error } = await supabase.rpc("set_table_status", {
    p_table_id: id,
    p_status: status,
  });

  if (error) fail(error.message);
  done(`Table marked ${status}.`);
}
