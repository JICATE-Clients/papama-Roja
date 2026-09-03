"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader, Notice } from "../_ui";
import FaceCapture from "@/components/face/FaceCapture";
import QrScanner from "@/components/vendor/QrScanner";
import type { FaceCapture as FaceCaptureValue } from "@/lib/validation/schemas";
import { inr } from "@/lib/format";

/** Co-pay defaults (mirrors system_config `co_contribution_max`; server clamps too). */
const CO_PAY_DEFAULT = 0;
const CO_PAY_MAX = 5;

/* ---- Backend contract types ------------------------------------------------ */

interface MenuItem {
  id: string;
  item_name: string;
  price: number;
  approval_status: string;
  is_special_care_equivalent: boolean;
}

interface PreviewCheck {
  name: string;
  pass: boolean;
  /** Whether failing this check invalidates the redemption (vs. informational). */
  hard: boolean;
  detail?: string;
}

interface ValueBreakdown {
  token_value: number;
  menu_value: number;
  difference_paid: number;
  co_pay: number;
  forfeited: number;
}

interface PreviewResult {
  checks: PreviewCheck[];
  token: {
    token_id: string;
    token_type: string;
    value: number;
    status: string;
    expires_at: string | null;
  };
  value: ValueBreakdown;
}

interface RedeemResult {
  redemption_id: string;
  payment_status: string; // "locked"
  value: ValueBreakdown;
}

interface Geo {
  lat: number;
  lng: number;
}

/* ---- Shared request body --------------------------------------------------- */

function buildBody(opts: {
  qr_payload: string;
  menu_item_id: string;
  geo: Geo | null;
  face: FaceCaptureValue | null;
  co_pay: string;
}) {
  const body: Record<string, unknown> = {
    qr_payload: opts.qr_payload.trim(),
    menu_item_id: opts.menu_item_id,
  };
  if (opts.geo) body.geo = opts.geo;
  if (opts.face) body.face_capture = opts.face;
  if (opts.co_pay.trim() && !isNaN(Number(opts.co_pay))) body.co_pay = Number(opts.co_pay);
  return body;
}

/** POST helper: returns parsed JSON or an Error message; handles 401 redirect. */
async function postJson<T>(
  path: string,
  body: unknown,
  router: ReturnType<typeof useRouter>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
  if (res.status === 401) {
    router.push("/vendor/login?redirect=/vendor/scan");
    return { ok: false, error: "Session expired — redirecting to sign in." };
  }
  if (res.status === 403) {
    return { ok: false, error: "Not permitted — your account can’t perform this action." };
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    return { ok: false, error: errBody.error ?? `Request failed (${res.status})` };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}

/* ---- Page ------------------------------------------------------------------ */

export default function VendorScanPage() {
  const router = useRouter();

  // Inputs
  const [qrPayload, setQrPayload] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [face, setFace] = useState<FaceCaptureValue | null>(null);
  const [coPay, setCoPay] = useState("");
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Menus
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [menusError, setMenusError] = useState<string | null>(null);

  // Flow state
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [redeem, setRedeem] = useState<RedeemResult | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);

  // Proof
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofDone, setProofDone] = useState(false);

  /* Load approved menu items for the <select>. */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/vendor/menus", { cache: "no-store", credentials: "same-origin" });
        if (res.status === 401) {
          router.push("/vendor/login?redirect=/vendor/scan");
          return;
        }
        if (!res.ok) {
          if (active) setMenusError(`Couldn’t load menu items (${res.status}).`);
          return;
        }
        const body = (await res.json()) as { menus?: MenuItem[] };
        if (active) setMenus((body.menus ?? []).filter((m) => m.approval_status === "approved"));
      } catch {
        if (active) setMenusError("Couldn’t load menu items.");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  /* Revoke object URLs on change/unmount to avoid leaks. */
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);
  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    };
  }, [receiptPreview]);

  function useMyLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation isn’t available in this browser.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoBusy(false);
      },
      (err) => {
        setGeoError(err.message || "Couldn’t get your location.");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function resetFlow() {
    // Clears the preview/redeem so editing inputs starts a fresh check.
    setPreview(null);
    setRedeem(null);
    setProofDone(false);
    setActionError(null);
  }

  async function onCheck() {
    setActionError(null);
    setPreview(null);
    setRedeem(null);
    if (!qrPayload.trim() || !menuItemId) {
      setActionError("Enter the scanned token code and select a menu item first.");
      return;
    }
    setPreviewBusy(true);
    const result = await postJson<PreviewResult>(
      "/api/vendor/redemptions/preview",
      buildBody({ qr_payload: qrPayload, menu_item_id: menuItemId, geo, face, co_pay: coPay }),
      router
    );
    setPreviewBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setPreview(result.data);
  }

  async function onRedeem() {
    setActionError(null);
    setRedeemBusy(true);
    const result = await postJson<RedeemResult>(
      "/api/vendor/redemptions",
      buildBody({ qr_payload: qrPayload, menu_item_id: menuItemId, geo, face, co_pay: coPay }),
      router
    );
    setRedeemBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setRedeem(result.data);
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPhotoFile(f);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  function onPickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setReceiptFile(f);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onUploadProof() {
    if (!redeem) return;
    setActionError(null);
    // Both images are required — the server gates payment release on them.
    if (!photoFile || !receiptFile) {
      setActionError("Upload both the plate photo and the receipt to submit proof for review.");
      return;
    }
    setProofBusy(true);
    // Real binary upload: POST multipart with the actual images. The route stores
    // them in the vendor-proofs bucket and only then releases the locked payment.
    const fd = new FormData();
    fd.append("photo", photoFile);
    fd.append("receipt", receiptFile);

    let res: Response;
    try {
      res = await fetch(`/api/vendor/redemptions/${redeem.redemption_id}/proof`, {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
    } catch {
      setProofBusy(false);
      setActionError("Network error — please try again.");
      return;
    }
    setProofBusy(false);
    if (res.status === 401) {
      router.push("/vendor/login?redirect=/vendor/scan");
      return;
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      setActionError(errBody.error ?? `Upload failed (${res.status}).`);
      return;
    }
    setProofDone(true);
  }

  // A redemption is blocked only if a HARD check failed. SOFT checks (e.g. geo
  // not yet shared, no prior meals on file) are informational and must not block
  // the Serve button — mirror the engine's own `ok = every(!hard || pass)` rule.
  const allChecksPass =
    preview != null && preview.checks.every((c) => !c.hard || c.pass);

  return (
    <div>
      <PageHeader title="Scan & redeem" subtitle="Validate a token, serve a meal, and upload proof." />

      {/* Step 1 — inputs */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">1 · Scan details</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="qr" className="mb-1 block text-sm font-medium text-slate-700">
              Token code
            </label>
            <input
              id="qr"
              type="text"
              value={qrPayload}
              onChange={(e) => {
                setQrPayload(e.target.value);
                resetFlow();
              }}
              placeholder="PAPAMA:…  (scan with camera or paste the code)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 break-all"
            />
            <p className="mt-1 text-xs text-slate-400">
              Scan the token QR with the camera, or paste the code as a fallback.
            </p>
            <div className="mt-2">
              <QrScanner
                disabled={previewBusy || redeemBusy}
                onDecode={(text) => {
                  setQrPayload(text);
                  resetFlow();
                }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="menu" className="mb-1 block text-sm font-medium text-slate-700">
              Menu item
            </label>
            <select
              id="menu"
              value={menuItemId}
              onChange={(e) => {
                setMenuItemId(e.target.value);
                resetFlow();
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
            >
              <option value="">Select an approved item…</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.item_name} — {inr(m.price)}
                  {m.is_special_care_equivalent ? " (special care)" : ""}
                </option>
              ))}
            </select>
            {menusError && <p className="mt-1 text-xs text-red-600">{menusError}</p>}
            {!menusError && menus.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">No approved menu items yet.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Location</span>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoBusy}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
              >
                {geoBusy ? "Locating…" : geo ? "Update location" : "Use my location"}
              </button>
              {geo && (
                <p className="mt-1 text-xs text-slate-500">
                  {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
                </p>
              )}
              {geoError && <p className="mt-1 text-xs text-red-600">{geoError}</p>}
            </div>

            <div>
              <label htmlFor="copay" className="mb-1 block text-sm font-medium text-slate-700">
                Co-pay (optional)
              </label>
              <input
                id="copay"
                type="number"
                min="0"
                max={CO_PAY_MAX}
                step="1"
                value={coPay}
                onChange={(e) => {
                  // Client-side clamp to ₹0..₹5; the server clamps to co_contribution_max too.
                  const raw = e.target.value;
                  if (raw === "") {
                    setCoPay("");
                  } else {
                    const n = Number(raw);
                    setCoPay(isNaN(n) ? "" : String(Math.max(CO_PAY_DEFAULT, Math.min(CO_PAY_MAX, n))));
                  }
                  resetFlow();
                }}
                placeholder={String(CO_PAY_DEFAULT)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
              />
              <p className="mt-1 text-xs text-slate-400">
                Optional voluntary contribution — default ₹{CO_PAY_DEFAULT}, max ₹{CO_PAY_MAX}.
              </p>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Beneficiary face (required to serve)
            </span>
            <FaceCapture
              label="Beneficiary face"
              onCapture={(f) => {
                setFace(f);
                resetFlow();
              }}
            />
            {face && (
              <p className="mt-1 text-xs text-green-700">
                Face captured (liveness {Math.round(face.liveness * 100)}%).
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onCheck}
            disabled={previewBusy}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2"
          >
            {previewBusy ? "Checking…" : "Check"}
          </button>
        </div>
      </section>

      {actionError && (
        <div className="mt-4">
          <Notice tone="error" title="Something went wrong">
            {actionError}
          </Notice>
        </div>
      )}

      {/* Step 2 — preview / validations */}
      {preview && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">2 · Validations</h2>

          <ul className="mt-4 space-y-2">
            {preview.checks.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                  c.pass ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${
                    c.pass ? "bg-green-600" : "bg-red-600"
                  }`}
                >
                  {c.pass ? "✓" : "✕"}
                </span>
                <span>
                  <span className={`font-medium ${c.pass ? "text-green-800" : "text-red-800"}`}>
                    {c.name}
                  </span>
                  {c.detail && <span className="ml-1 text-slate-600">— {c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>

          <ValueTable value={preview.value} />

          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onRedeem}
              disabled={!allChecksPass || redeemBusy || redeem != null || !face}
              className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
            >
              {redeemBusy ? "Redeeming…" : "Serve & redeem"}
            </button>
            {!allChecksPass && (
              <span className="text-sm text-red-600">Resolve the failing checks before serving.</span>
            )}
            {allChecksPass && !face && (
              <span className="text-sm text-amber-600">Capture the beneficiary&apos;s face before serving.</span>
            )}
          </div>
        </section>
      )}

      {/* Step 3 — payment locked + proof */}
      {redeem && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">3 · Proof</h2>

          <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
            Redemption <span className="break-all font-mono font-medium">{redeem.redemption_id}</span> created — payment
            locked. Upload proof for admin review.
          </div>

          {proofDone ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm font-medium text-green-800">
              Proof submitted ✓ — awaiting admin review. Payment is released once an admin approves it.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="photo" className="mb-1 block text-sm font-medium text-slate-700">
                    Plate photo
                  </label>
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={onPickPhoto}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                  />
                  {photoPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoPreview}
                      alt="Plate preview"
                      className="mt-2 h-32 w-full rounded-lg border border-slate-200 object-cover"
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="receipt" className="mb-1 block text-sm font-medium text-slate-700">
                    Receipt
                  </label>
                  <input
                    id="receipt"
                    type="file"
                    accept="image/*"
                    onChange={onPickReceipt}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                  />
                  {receiptPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="mt-2 h-32 w-full rounded-lg border border-slate-200 object-cover"
                    />
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Both the plate photo and the receipt are required. They&apos;re uploaded securely
                and reviewed by an admin; payment is released once your proof is approved.
              </p>

              <button
                type="button"
                onClick={onUploadProof}
                disabled={proofBusy || !photoFile || !receiptFile}
                className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
              >
                {proofBusy ? "Uploading…" : "Submit proof for review"}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ValueTable({ value }: { value: ValueBreakdown }) {
  const rows: { label: string; amount: number; emphasis?: boolean }[] = [
    { label: "Token value", amount: value.token_value },
    { label: "Menu value", amount: value.menu_value },
    { label: "Difference paid", amount: value.difference_paid },
    { label: "Co-pay", amount: value.co_pay },
    { label: "Forfeited", amount: value.forfeited },
  ];
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 text-slate-600">{r.label}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-900">
                {r.amount != null ? inr(r.amount) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
