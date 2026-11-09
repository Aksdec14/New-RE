/** Shared form parsing for server actions. Not a "use server" module. */

export function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export function optional(value: string) {
  return value.length > 0 ? value : null;
}

export function numberField(formData: FormData, name: string, fallback = 0) {
  const raw = field(formData, name).replace(/,/g, "");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function integerField(formData: FormData, name: string, fallback = 0) {
  return Math.trunc(numberField(formData, name, fallback));
}

export function checkbox(formData: FormData, name: string) {
  return formData.get(name) !== null;
}

export function withQuery(
  path: string,
  params: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
