"use client";

import { useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { importMenuItems } from "@/lib/actions/menu";

type Row = {
  name: string;
  category: string;
  price: string | number;
  tax_rate: string | number;
  veg: string | number;
  hsn: string;
  description: string;
  available: string | number;
};

const HEADER_ALIASES: Record<keyof Row, string[]> = {
  name: ["name", "item", "item name", "menu item", "dish", "product"],
  category: ["category", "cat", "section", "category name"],
  price: ["price", "rate", "item price", "amount", "selling price", "price (₹)"],
  tax_rate: ["tax_rate", "tax", "gst", "tax rate", "tax %", "gst %", "gst rate"],
  veg: ["veg", "vegetarian", "is_veg", "is veg"],
  hsn: ["hsn", "hsn code", "hsn_code"],
  description: ["description", "desc", "notes"],
  available: ["available", "is_available", "is available", "status", "stock"],
};

const SAMPLE_ROWS: Array<Record<string, string | number>> = [
  {
    Name: "Masala Dosa",
    Category: "South Indian",
    Price: 120,
    "GST %": 5,
    Veg: "Yes",
    HSN: "996331",
    Description: "Plain dosa with potato masala",
    Available: "Yes",
  },
  {
    Name: "Chicken Tikka",
    Category: "Starters",
    Price: 280,
    "GST %": 12,
    Veg: "No",
    HSN: "998411",
    Description: "",
    Available: "Yes",
  },
  {
    Name: "Filter Coffee",
    Category: "Beverages",
    Price: 60,
    "GST %": 18,
    Veg: "Yes",
    HSN: "",
    Description: "",
    Available: "Sold out",
  },
];

function normaliseHeader(header: string): keyof Row | null {
  const text = header.trim().toLowerCase().replace(/[_-]/g, " ");
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(text)) {
      return field as keyof Row;
    }
  }
  return null;
}

export function MenuImportForm({ restaurantId }: { restaurantId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setProblems([]);
    setRows(null);

    if (file.size > 1_000_000) {
      setError("File is larger than 1 MB. Import a slimmer export.");
      return;
    }

    // Loaded on demand so the accounting screens' bundle stays small.
    const XLSX = await import("xlsx");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) {
        setError("The file has no sheets.");
        return;
      }

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: true,
      });

      const parsed: Row[] = [];
      const found = new Set<keyof Row>();

      for (const record of raw) {
        const row = {
          name: "",
          category: "",
          price: "",
          tax_rate: "",
          veg: "",
          hsn: "",
          description: "",
          available: "",
        } as Row;

        for (const [header, value] of Object.entries(record)) {
          const alias = normaliseHeader(header);
          if (!alias) continue;
          row[alias] = String(value ?? "") as never;
          found.add(alias);
        }

        parsed.push(row);
      }

      if (parsed.length === 0) {
        setError("No data rows found under the header row.");
        return;
      }
      if (!found.has("name")) {
        setError(
          "No name column found. The first row must have a header called Name (or Item).",
        );
        return;
      }
      if (!found.has("price")) {
        setError("No price column found. Add a Price column and upload again.");
        return;
      }

      const bad: string[] = [];
      const ok = parsed.filter((row) => {
        const price = Number.parseFloat(String(row.price).replace(/[₹,\s]/g, ""));
        if (Number.isNaN(price)) {
          bad.push(`"${row.name}" has no numeric price (${String(row.price)})`);
          return false;
        }
        return true;
      });

      if (ok.length > 300) {
        setError(`This file has ${ok.length} items. Import at most 300 at a time.`);
        return;
      }

      setRows(ok);
      setProblems(bad);
      setFileName(file.name);
    } catch {
      setError("That file could not be read as .xlsx or .csv.");
    }
  }

  function downloadTemplate() {
    void import("xlsx").then((XLSX) => {
      const sheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS, {
        header: [
          "Name",
          "Category",
          "Price",
          "GST %",
          "Veg",
          "HSN",
          "Description",
          "Available",
        ],
      });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Menu");
      const blob = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      const url = URL.createObjectURL(
        new Blob(
          [blob],
          {
            type:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "resto-pos-menu-template.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  function reset() {
    setRows(null);
    setFileName("");
    setProblems([]);
    setError(null);
    formRef.current?.reset();
  }

  return (
    <div>
      {rows && rows.length > 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <strong>{rows.length}</strong> item{rows.length === 1 ? "" : "s"} ready from{" "}
              <span className="font-mono text-xs">{fileName}</span>
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-muted hover:text-ink"
            >
              Pick a different file
            </button>
          </div>

          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left muted">
                <th className="pb-1 pr-3 font-medium">Name</th>
                <th className="pb-1 pr-3 font-medium">Category</th>
                <th className="pb-1 pr-3 text-right font-medium">Price</th>
                <th className="pb-1 text-right font-medium">GST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, 8).map((row, index) => (
                <tr key={`${row.name}-${index}`}>
                  <td className="py-1.5 pr-3">{row.name}</td>
                  <td className="py-1.5 pr-3">{row.category || "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.price}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {row.tax_rate === "" ? "5% (default)" : `${row.tax_rate}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 8 ? (
            <p className="mt-2 text-xs muted">…and {rows.length - 8} more rows.</p>
          ) : null}
        </div>
      ) : null}

      {problems.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-warn">
          {problems.slice(0, 5).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-bad/20 bg-bad-soft px-3.5 py-2.5 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      <form ref={formRef} action={importMenuItems} className="mt-4">
        <input type="hidden" name="restaurant_id" value={restaurantId} />
        <input
          type="hidden"
          name="rows"
          value={rows ? JSON.stringify(rows) : ""}
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="btn btn-ghost cursor-pointer">
            Choose .xlsx or .csv
            <input
              type="file"
              accept=".xlsx,.csv,.xls"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await handleFile(file);
              }}
            />
          </label>

          <button
            type="button"
            onClick={downloadTemplate}
            className="text-sm text-accent hover:underline"
          >
            Download template
          </button>

          {rows && rows.length > 0 ? (
            <SubmitButton className="btn btn-primary w-auto px-6" pendingLabel="Importing…">
              Import {rows.length} item{rows.length === 1 ? "" : "s"}
            </SubmitButton>
          ) : null}
        </div>
      </form>
    </div>
  );
}
