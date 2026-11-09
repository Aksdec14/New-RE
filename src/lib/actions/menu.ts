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

export async function deleteMenuItem(formData: FormData) {  const supabase = await createClient();
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

// ---------------------------------------------------------------------------
// Bulk import from an Excel/CSV upload. The browser only parses the file into
// rows; every value is re-validated here before anything touches Postgres.
// ---------------------------------------------------------------------------
const IMPORT_ROW_LIMIT = 300;
const IMPORT_NAME_LIMIT = 120;

type ImportRow = {
  name: string;
  category: string;
  price: string | number;
  tax_rate: string | number;
  veg: string | number;
  hsn: string;
  description: string;
  available: string | number;
};

function parseMoney(value: string | number) {
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[₹,\s]|rs\.?/gi, "");
  return cleaned === "" ? Number.NaN : Number.parseFloat(cleaned);
}

function parsePercent(value: string | number) {
  if (typeof value === "number") {
    // Excel percent cells arrive as fractions (5% -> 0.05). Whole numbers in
    // the GST brackets stay as-is.
    if (value > 1) return value;
    return Number.isInteger(value) ? value : value * 100;
  }
  const cleaned = value.trim().replace(/[%\s]/g, "");
  if (cleaned === "") return Number.NaN;
  const parsed = Number.parseFloat(cleaned);
  if (parsed <= 1 && !Number.isInteger(parsed)) return parsed * 100;
  return parsed;
}

function parseFlag(value: string | number) {
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  return ["veg", "yes", "y", "true", "1", "available", "in stock"].includes(text);
}

function parseAvailable(value: string | number) {
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  return !["no", "n", "false", "0", "sold out", "unavailable", "out of stock", ""].includes(text);
}

export async function importMenuItems(formData: FormData) {
  const supabase = await createClient();
  const restaurantId = field(formData, "restaurant_id");
  const raw = field(formData, "rows");

  if (!restaurantId) fail("Missing workspace.");

  let parsed: ImportRow[];
  try {
    parsed = JSON.parse(raw) as ImportRow[];
  } catch {
    fail("Could not read the uploaded rows. Export the file again and retry.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail("No importable rows were found in the file.");
  }
  if (parsed.length > IMPORT_ROW_LIMIT) {
    fail(`The file has ${parsed.length} rows. Import at most ${IMPORT_ROW_LIMIT} at a time.`);
  }

  // Existing catalogue: categories multiply, item names de-duplicate.
  const [existingCategories, existingItems] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("restaurant_id", restaurantId),
    supabase
      .from("menu_items")
      .select("name")
      .eq("restaurant_id", restaurantId),
  ]);
  if (existingCategories.error) fail(existingCategories.error.message);
  if (existingItems.error) fail(existingItems.error.message);

  const categoryByName = new Map(
    (existingCategories.data ?? []).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const takenNames = new Set(
    (existingItems.data ?? []).map((i) => i.name.toLowerCase()),
  );

  const newCategoryNames = new Set<string>();
  const itemRows: Array<{
    restaurant_id: string;
    category_id: string | null;
    name: string;
    description: string | null;
    price: number;
    tax_rate: number;
    hsn_code: string | null;
    is_veg: boolean;
    is_available: boolean;
    categoryName: string;
  }> = [];

  const skipped: string[] = [];

  parsed.forEach((row, index) => {
    const label = `row ${index + 1}`;
    const name = String(row.name ?? "").trim();
    const price = parseMoney(row.price);
    const taxRate = Number.isNaN(parsePercent(row.tax_rate))
      ? 5
      : Math.round(parsePercent(row.tax_rate) * 100) / 100;

    if (name.length === 0) {
      skipped.push(`${label}: no item name`);
      return;
    }
    if (name.length > IMPORT_NAME_LIMIT) {
      skipped.push(`${label}: name is longer than ${IMPORT_NAME_LIMIT} characters`);
      return;
    }
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      skipped.push(`${label}: "${row.price}" is not a valid price`);
      return;
    }
    if (taxRate < 0 || taxRate > 28) {
      skipped.push(`${label}: "${row.tax_rate}" is not a GST rate between 0 and 28`);
      return;
    }
    if (takenNames.has(name.toLowerCase())) {
      skipped.push(`${label}: "${name}" is already on the menu`);
      return;
    }

    takenNames.add(name.toLowerCase());
    const category = String(row.category ?? "").trim().slice(0, 80);
    if (category && !categoryByName.has(category.toLowerCase())) {
      newCategoryNames.add(category);
    }

    itemRows.push({
      restaurant_id: restaurantId,
      category_id: null, // linked after category creation below
      name,
      description: String(row.description ?? "").trim() || null,
      price,
      tax_rate: taxRate,
      hsn_code: String(row.hsn ?? "").trim() || null,
      is_veg: parseFlag(row.veg),
      is_available: row.available === "" || row.available === undefined
        ? true
        : parseAvailable(row.available),
      categoryName: category.toLowerCase(),
    });
  });

  // Create categories that do not exist yet, then link every row.
  if (newCategoryNames.size > 0) {
    const { data: created, error } = await supabase
      .from("categories")
      .insert(
        [...newCategoryNames].map((name) => ({
          restaurant_id: restaurantId,
          name,
        })),
      )
      .select("id, name");

    if (error) fail(`Import failed while creating categories: ${error.message}`);
    for (const category of created ?? []) {
      categoryByName.set(category.name.toLowerCase(), category.id);
    }
  }

  for (const row of itemRows) {
    row.category_id = row.categoryName ? (categoryByName.get(row.categoryName) ?? null) : null;
  }

  if (itemRows.length === 0) {
    fail(
      skipped.length > 0
        ? `Nothing imported. ${skipped.slice(0, 3).join("; ")}`
        : "Nothing imported.",
    );
  }

  const { error: insertError } = await supabase
    .from("menu_items")
    .insert(itemRows.map(({ categoryName: _categoryName, ...row }) => row));

  if (insertError) {
    fail(`Import failed: ${insertError.message}`);
  }

  const categoryNote =
    newCategoryNames.size > 0 ? ` ${newCategoryNames.size} new category(es)` : "";
  const skipNote = skipped.length > 0 ? ` ${skipped.length} row(s) skipped.` : "";
  done(`Imported ${itemRows.length} item(s).${categoryNote}${skipNote}`);
}

