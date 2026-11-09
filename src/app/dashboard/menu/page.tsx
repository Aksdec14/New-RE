import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { MenuImportForm } from "@/components/menu-import-form";
import { SubmitButton } from "@/components/submit-button";
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  toggleMenuItem,
  updateCategory,
  updateMenuItem,
} from "@/lib/actions/menu";
import { formatAmount, formatPercent } from "@/lib/format";
import { canManage, requireRestaurant } from "@/lib/restaurant";

export const metadata = { title: "Menu" };
export const dynamic = "force-dynamic";

const TAX_RATES = [0, 5, 12, 18, 28];

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { supabase, restaurant } = await requireRestaurant();
  const manager = canManage(restaurant.role);

  const [categoriesResult, itemsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const categories = categoriesResult.data ?? [];
  const items = itemsResult.data ?? [];

  const grouped = [
    ...categories.map((category) => ({
      category,
      items: items.filter((item) => item.category_id === category.id),
    })),
    {
      category: null,
      items: items.filter((item) => !item.category_id),
    },
  ].filter((group) => group.category !== null || group.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Menu"
        description="Prices are tax-exclusive. GST is calculated when the bill is generated, never entered by the browser."
      />

      <Flash error={error} ok={ok} />

      {manager ? (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h2 className="text-base font-semibold">Add a category</h2>
            <form action={createCategory} className="mt-4 space-y-3">
              <input type="hidden" name="restaurant_id" value={restaurant.id} />
              <div>
                <label className="label" htmlFor="category-name">
                  Name
                </label>
                <input
                  id="category-name"
                  name="name"
                  required
                  maxLength={80}
                  className="input"
                  placeholder="Starters"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="category-order">
                    Sort order
                  </label>
                  <input
                    id="category-order"
                    name="sort_order"
                    type="number"
                    defaultValue={0}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="category-description">
                    Description
                  </label>
                  <input
                    id="category-description"
                    name="description"
                    className="input"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <SubmitButton className="btn btn-primary">Add category</SubmitButton>
            </form>
          </div>

          <div className="card">
            <h2 className="text-base font-semibold">Add a menu item</h2>
            <form action={createMenuItem} className="mt-4 space-y-3">
              <input type="hidden" name="restaurant_id" value={restaurant.id} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="item-name">
                    Name
                  </label>
                  <input
                    id="item-name"
                    name="name"
                    required
                    maxLength={120}
                    className="input"
                    placeholder="Paneer tikka"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="item-category">
                    Category
                  </label>
                  <select
                    id="item-category"
                    name="category_id"
                    className="input"
                    defaultValue=""
                  >
                    <option value="">Uncategorised</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="item-price">
                    Price (₹)
                  </label>
                  <input
                    id="item-price"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    className="input"
                    placeholder="249"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="item-tax">
                    GST %
                  </label>
                  <select
                    id="item-tax"
                    name="tax_rate"
                    className="input"
                    defaultValue="5"
                  >
                    {TAX_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="item-hsn">
                    HSN code
                  </label>
                  <input
                    id="item-hsn"
                    name="hsn_code"
                    className="input"
                    placeholder="996331"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="is_veg" defaultChecked />
                  Vegetarian
                </label>
                <label className="flex items-center gap-2">
                  <span className="muted">Sort</span>
                  <input
                    type="number"
                    name="sort_order"
                    defaultValue={0}
                    className="input w-20 py-1"
                  />
                </label>
              </div>

              <SubmitButton className="btn btn-primary">Add item</SubmitButton>
            </form>
          </div>
        </section>

        <section className="card">
          <h2 className="text-base font-semibold">
            Import a menu from Excel or CSV
          </h2>
          <p className="mt-2 text-sm muted">
            Upload your menu in one go — new categories are created for you,
            duplicates are skipped. Use the template for the expected columns:
            Name and Price are required; Category, GST %, Veg, HSN and
            Description are optional.
          </p>
          <MenuImportForm restaurantId={restaurant.id} />
        </section>
        </>
      ) : (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm muted">
          You can view the menu. Only owners and admins can edit it.
        </p>
      )}

      {grouped.length === 0 ? (
        <div className="card">
          <p className="text-sm muted">
            No menu items yet.{" "}
            {manager
              ? "Add a category, then add your first item above."
              : "Ask an owner or admin to set up the menu."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <section
              key={group.category?.id ?? "uncategorised"}
              className="card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">
                    {group.category?.name ?? "Uncategorised"}
                  </h2>
                  <p className="text-xs muted">
                    {group.items.length} item{group.items.length === 1 ? "" : "s"}
                    {group.category?.description
                      ? ` · ${group.category.description}`
                      : ""}
                  </p>
                </div>

                {manager && group.category ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted hover:text-ink">
                      Edit category
                    </summary>
                    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
                      <form action={updateCategory} className="space-y-2">
                        <input
                          type="hidden"
                          name="restaurant_id"
                          value={restaurant.id}
                        />
                        <input type="hidden" name="id" value={group.category.id} />
                        <input
                          name="name"
                          defaultValue={group.category.name}
                          className="input"
                          required
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            name="description"
                            defaultValue={group.category.description ?? ""}
                            className="input"
                            placeholder="Description"
                          />
                          <input
                            name="sort_order"
                            type="number"
                            defaultValue={group.category.sort_order}
                            className="input"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="is_active"
                            defaultChecked={group.category.is_active}
                          />
                          Active
                        </label>
                        <div className="flex gap-2">
                          <SubmitButton className="btn btn-primary px-3 py-1.5">
                            Save
                          </SubmitButton>
                        </div>
                      </form>
                      <form action={deleteCategory} className="mt-2">
                        <input
                          type="hidden"
                          name="restaurant_id"
                          value={restaurant.id}
                        />
                        <input type="hidden" name="id" value={group.category.id} />
                        <SubmitButton className="btn btn-ghost px-3 py-1.5 text-bad">
                          Delete category
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                ) : null}
              </div>

              {group.items.length === 0 ? (
                <p className="mt-4 text-sm muted">No items in this category.</p>
              ) : (
                <div className="mt-4 divide-y divide-line">
                  {group.items.map((item) => (
                    <div key={item.id} className="py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.name}</p>
                            <span
                              className={
                                item.is_veg
                                  ? "badge border-good/20 bg-good-soft text-good"
                                  : "badge border-bad/20 bg-bad-soft text-bad"
                              }
                            >
                              {item.is_veg ? "Veg" : "Non-veg"}
                            </span>
                            {!item.is_available ? (
                              <span className="badge border-warn/20 bg-warn-soft text-warn">
                                Sold out
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs muted">
                            {formatAmount(item.price)} · GST{" "}
                            {formatPercent(item.tax_rate)}
                            {item.hsn_code ? ` · HSN ${item.hsn_code}` : ""}
                          </p>
                        </div>

                        {manager ? (
                          <div className="flex items-center gap-2">
                            <form action={toggleMenuItem}>
                              <input
                                type="hidden"
                                name="restaurant_id"
                                value={restaurant.id}
                              />
                              <input type="hidden" name="id" value={item.id} />
                              <input
                                type="hidden"
                                name="available"
                                value={item.is_available ? "false" : "true"}
                              />
                              <SubmitButton className="btn btn-ghost px-3 py-1.5">
                                {item.is_available ? "Mark sold out" : "Mark available"}
                              </SubmitButton>
                            </form>
                            <details>
                              <summary className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink">
                                Edit
                              </summary>
                              <div className="mt-3 w-full rounded-xl border border-line bg-canvas p-4">
                                <form action={updateMenuItem} className="space-y-3">
                                  <input
                                    type="hidden"
                                    name="restaurant_id"
                                    value={restaurant.id}
                                  />
                                  <input type="hidden" name="id" value={item.id} />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="label">Name</label>
                                      <input
                                        name="name"
                                        defaultValue={item.name}
                                        className="input"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="label">Category</label>
                                      <select
                                        name="category_id"
                                        defaultValue={item.category_id ?? ""}
                                        className="input"
                                      >
                                        <option value="">Uncategorised</option>
                                        {categories.map((category) => (
                                          <option
                                            key={category.id}
                                            value={category.id}
                                          >
                                            {category.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-4">
                                    <div>
                                      <label className="label">Price (₹)</label>
                                      <input
                                        name="price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        defaultValue={item.price}
                                        className="input"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="label">GST %</label>
                                      <select
                                        name="tax_rate"
                                        defaultValue={String(item.tax_rate)}
                                        className="input"
                                      >
                                        {TAX_RATES.map((rate) => (
                                          <option key={rate} value={rate}>
                                            {rate}%
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="label">HSN</label>
                                      <input
                                        name="hsn_code"
                                        defaultValue={item.hsn_code ?? ""}
                                        className="input"
                                      />
                                    </div>
                                    <div>
                                      <label className="label">Sort</label>
                                      <input
                                        name="sort_order"
                                        type="number"
                                        defaultValue={item.sort_order}
                                        className="input"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="label">Description</label>
                                    <input
                                      name="description"
                                      defaultValue={item.description ?? ""}
                                      className="input"
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4 text-sm">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        name="is_veg"
                                        defaultChecked={item.is_veg}
                                      />
                                      Vegetarian
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        name="is_available"
                                        defaultChecked={item.is_available}
                                      />
                                      Available
                                    </label>
                                  </div>
                                  <SubmitButton className="btn btn-primary px-3 py-1.5">
                                    Save changes
                                  </SubmitButton>
                                </form>
                                <form action={deleteMenuItem} className="mt-2">
                                  <input
                                    type="hidden"
                                    name="restaurant_id"
                                    value={restaurant.id}
                                  />
                                  <input type="hidden" name="id" value={item.id} />
                                  <SubmitButton className="btn btn-ghost px-3 py-1.5 text-bad">
                                    Delete item
                                  </SubmitButton>
                                </form>
                              </div>
                            </details>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
