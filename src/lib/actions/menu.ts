"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  checkbox,
  field,
  integerField,
  numberField,
  optional,
  withQuery,
} from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/menu";

function fail(message: string): never {
  redirect(withQuery(PATH, { error: message }));
}

function done(message: string): never {
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(withQuery(PATH, { ok: message }));
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient();
  const restaurantId = field(formData, "restaurant_id");
  const name = field(formData, "name");

  if (!restaurantId) fail("Missing workspace.");
  if (name.length < 1) fail("Category name is required.");

  const { error } = await supabase.from("categories").insert({
    restaurant_id: restaurantId,
    name,
    description: optional(field(formData, "description")),
    sort_order: integerField(formData, "sort_order"),
  });

  if (error) fail(error.message);
  done(`Category "${name}" added.`);
}

export async function updateCategory(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");
  const name = field(formData, "name");

  if (!id || !restaurantId) fail("Missing category.");
  if (name.length < 1) fail("Category name is required.");

  const { error } = await supabase
    .from("categories")
    .update({
      name,
      description: optional(field(formData, "description")),
      sort_order: integerField(formData, "sort_order"),
      is_active: checkbox(formData, "is_active"),
    })
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done("Category updated.");
}

export async function deleteCategory(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");

  if (!id || !restaurantId) fail("Missing category.");

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done("Category deleted. Its items are now uncategorised.");
}

export async function createMenuItem(formData: FormData) {
  const supabase = await createClient();
  const restaurantId = field(formData, "restaurant_id");
  const name = field(formData, "name");
  const price = numberField(formData, "price", -1);
  const taxRate = numberField(formData, "tax_rate", 5);

  if (!restaurantId) fail("Missing workspace.");
  if (name.length < 1) fail("Item name is required.");
  if (price < 0) fail("Price must be zero or more.");
  if (taxRate < 0 || taxRate > 28) fail("Tax rate must be between 0 and 28.");

  const { error } = await supabase.from("menu_items").insert({
    restaurant_id: restaurantId,
    category_id: optional(field(formData, "category_id")),
    name,
    description: optional(field(formData, "description")),
    price,
    tax_rate: taxRate,
    hsn_code: optional(field(formData, "hsn_code")),
    is_veg: checkbox(formData, "is_veg"),
    is_available: true,
    sort_order: integerField(formData, "sort_order"),
  });

  if (error) fail(error.message);
  done(`"${name}" added to the menu.`);
}

export async function updateMenuItem(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");
  const name = field(formData, "name");
  const price = numberField(formData, "price", -1);

  if (!id || !restaurantId) fail("Missing item.");
  if (name.length < 1) fail("Item name is required.");
  if (price < 0) fail("Price must be zero or more.");

  const { error } = await supabase
    .from("menu_items")
    .update({
      category_id: optional(field(formData, "category_id")),
      name,
      description: optional(field(formData, "description")),
      price,
      tax_rate: numberField(formData, "tax_rate", 5),
      hsn_code: optional(field(formData, "hsn_code")),
      is_veg: checkbox(formData, "is_veg"),
      is_available: checkbox(formData, "is_available"),
      sort_order: integerField(formData, "sort_order"),
    })
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done(`"${name}" updated.`);
}

export async function toggleMenuItem(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");
  const available = field(formData, "available") === "true";

  if (!id || !restaurantId) fail("Missing item.");

  const { error } = await supabase
    .from("menu_items")
    .update({ is_available: available })
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done(available ? "Item marked available." : "Item marked sold out.");
}

export async function deleteMenuItem(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");

  if (!id || !restaurantId) fail("Missing item.");

  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done("Item removed from the menu.");
}
