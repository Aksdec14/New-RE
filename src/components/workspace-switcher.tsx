import { switchWorkspace } from "@/lib/actions/workspace";
import type { MyRestaurantRow } from "@/lib/types/database";

export function WorkspaceSwitcher({
  restaurant,
  workspaces,
}: {
  restaurant: MyRestaurantRow;
  workspaces: MyRestaurantRow[];
}) {
  if (workspaces.length < 2) {
    return (
      <span className="max-w-[14rem] truncate text-sm font-medium">
        {restaurant.name}
      </span>
    );
  }

  return (
    <form action={switchWorkspace} className="flex items-center gap-2">
      <select
        name="restaurant_id"
        defaultValue={restaurant.id}
        aria-label="Active workspace"
        className="input max-w-[14rem] py-1.5 text-sm"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-ghost px-3 py-1.5">
        Switch
      </button>
    </form>
  );
}
