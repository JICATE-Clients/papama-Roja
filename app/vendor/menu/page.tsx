"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader, Notice, TableShell, TableHead, StatusBadge, Dash, SkeletonTable } from "../_ui";
import { inr } from "@/lib/format";

interface MenuItem {
  id: string;
  item_name: string;
  price: number;
  nutrition_category: string | null;
  approval_status: string;
  is_special_care_equivalent: boolean;
}

type FetchState = "loading" | "ready" | "forbidden" | "error";

// Shape of the add/edit form fields.
interface ItemForm {
  item_name: string;
  price: string;
  nutrition_category: string;
  is_special_care_equivalent: boolean;
}

const EMPTY_FORM: ItemForm = {
  item_name: "",
  price: "",
  nutrition_category: "",
  is_special_care_equivalent: false,
};

export default function VendorMenuPage() {
  const router = useRouter();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [state, setState] = useState<FetchState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add form
  const [addForm, setAddForm] = useState<ItemForm>(EMPTY_FORM);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Per-row edit/delete
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(EMPTY_FORM);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  /* ---- Load ---------------------------------------------------------------- */

  async function load() {
    setState("loading");
    try {
      const res = await fetch("/api/vendor/menus", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/menu");
        return;
      }
      if (res.status === 403) {
        setState("forbidden");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? `Request failed (${res.status})`);
        setState("error");
        return;
      }
      const body = (await res.json()) as { menus?: MenuItem[] };
      setItems(body.menus ?? []);
      setState("ready");
    } catch {
      setErrorMsg("Network error — please try again.");
      setState("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Helpers ------------------------------------------------------------- */

  // Builds the JSON body for create/update from a form; drops empty optionals.
  function formBody(f: ItemForm): Record<string, unknown> {
    const body: Record<string, unknown> = {
      item_name: f.item_name.trim(),
      price: Number(f.price),
      is_special_care_equivalent: f.is_special_care_equivalent,
    };
    const cat = f.nutrition_category.trim();
    body.nutrition_category = cat === "" ? null : cat;
    return body;
  }

  function validate(f: ItemForm): string | null {
    if (!f.item_name.trim()) return "Item name is required.";
    if (f.price.trim() === "" || isNaN(Number(f.price)) || Number(f.price) < 0)
      return "Enter a valid price.";
    return null;
  }

  /* ---- Add ----------------------------------------------------------------- */

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const invalid = validate(addForm);
    if (invalid) {
      setAddError(invalid);
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch("/api/vendor/menus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(formBody(addForm)),
      });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/menu");
        return;
      }
      if (res.status === 403) {
        setAddError("You don’t have permission to add menu items.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body.error ?? `Couldn’t add item (${res.status}).`);
        return;
      }
      setAddForm(EMPTY_FORM);
      await load();
    } catch {
      setAddError("Network error — please try again.");
    } finally {
      setAddBusy(false);
    }
  }

  /* ---- Edit ---------------------------------------------------------------- */

  function startEdit(item: MenuItem) {
    setRowError(null);
    setEditingId(item.id);
    setEditForm({
      item_name: item.item_name,
      price: String(item.price ?? ""),
      nutrition_category: item.nutrition_category ?? "",
      is_special_care_equivalent: item.is_special_care_equivalent,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(id: string) {
    setRowError(null);
    const invalid = validate(editForm);
    if (invalid) {
      setRowError(invalid);
      return;
    }
    setRowBusy(id);
    try {
      const res = await fetch(`/api/vendor/menus/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(formBody(editForm)),
      });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/menu");
        return;
      }
      if (res.status === 403) {
        setRowError("You don’t have permission to edit this item.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRowError(body.error ?? `Couldn’t save (${res.status}).`);
        return;
      }
      setEditingId(null);
      await load();
    } catch {
      setRowError("Network error — please try again.");
    } finally {
      setRowBusy(null);
    }
  }

  /* ---- Delete -------------------------------------------------------------- */

  async function deleteItem(id: string) {
    setRowError(null);
    setRowBusy(id);
    try {
      const res = await fetch(`/api/vendor/menus/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/menu");
        return;
      }
      if (res.status === 403) {
        setRowError("You don’t have permission to delete this item.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRowError(body.error ?? `Couldn’t delete (${res.status}).`);
        return;
      }
      await load();
    } catch {
      setRowError("Network error — please try again.");
    } finally {
      setRowBusy(null);
    }
  }

  /* ---- Render -------------------------------------------------------------- */

  return (
    <div>
      <PageHeader
        title="My menu"
        subtitle="Add items, edit prices, and track approval status."
        count={state === "ready" ? items.length : undefined}
      />

      {/* Add item */}
      <form onSubmit={onAdd} className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add an item</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="add_name" className="mb-1 block text-sm font-medium text-slate-700">
              Item name <span className="text-red-500">*</span>
            </label>
            <input
              id="add_name"
              type="text"
              value={addForm.item_name}
              onChange={(e) => setAddForm((f) => ({ ...f, item_name: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
              placeholder="e.g. Veg thali"
            />
          </div>
          <div>
            <label htmlFor="add_price" className="mb-1 block text-sm font-medium text-slate-700">
              Price (₹) <span className="text-red-500">*</span>
            </label>
            <input
              id="add_price"
              type="number"
              min="0"
              step="0.01"
              value={addForm.price}
              onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="add_cat" className="mb-1 block text-sm font-medium text-slate-700">
              Nutrition category
            </label>
            <input
              id="add_cat"
              type="text"
              value={addForm.nutrition_category}
              onChange={(e) => setAddForm((f) => ({ ...f, nutrition_category: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
              placeholder="optional"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={addForm.is_special_care_equivalent}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, is_special_care_equivalent: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-600"
              />
              Special-care equivalent
            </label>
          </div>
        </div>

        {addError && <p className="mt-3 text-sm text-red-600">{addError}</p>}

        <button
          type="submit"
          disabled={addBusy}
          className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2"
        >
          {addBusy ? "Adding…" : "Add item"}
        </button>
      </form>

      {rowError && (
        <div className="mb-4">
          <Notice tone="error" title="Something went wrong">
            {rowError}
          </Notice>
        </div>
      )}

      {/* List */}
      {state === "loading" && <SkeletonTable />}

      {state === "forbidden" && (
        <Notice tone="warn" title="Not permitted">
          Your account does not have permission to view menu items.
        </Notice>
      )}

      {state === "error" && (
        <Notice tone="error" title="Couldn’t load menu items">
          {errorMsg}
        </Notice>
      )}

      {state === "ready" && items.length === 0 && (
        <Notice tone="info" title="No menu items yet">
          Add your first item above — it’ll appear here once submitted for approval.
        </Notice>
      )}

      {state === "ready" && items.length > 0 && (
        <TableShell hideCols={[3, 5]}>
          <TableHead columns={["Item", "Price", "Category", "Approval", "Special care", "Actions"]} />
          <tbody>
            {items.map((item) => {
              const editing = editingId === item.id;
              const busy = rowBusy === item.id;
              return (
                <tr key={item.id} className="border-b border-slate-100 align-top last:border-0">
                  {editing ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editForm.item_name}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, item_name: e.target.value }))
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.price}
                          onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editForm.nutrition_category}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, nutrition_category: e.target.value }))
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {item.approval_status ? (
                          <StatusBadge value={item.approval_status} />
                        ) : (
                          <Dash>{null}</Dash>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={editForm.is_special_care_equivalent}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              is_special_care_equivalent: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(item.id)}
                            disabled={busy}
                            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                          >
                            {busy ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={busy}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Dash>{item.item_name}</Dash>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.price != null ? inr(item.price) : <Dash>{null}</Dash>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <Dash>{item.nutrition_category}</Dash>
                      </td>
                      <td className="px-4 py-3">
                        {item.approval_status ? (
                          <StatusBadge value={item.approval_status} />
                        ) : (
                          <Dash>{null}</Dash>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.is_special_care_equivalent ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            disabled={busy}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item.id)}
                            disabled={busy}
                            className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            {busy ? "…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
