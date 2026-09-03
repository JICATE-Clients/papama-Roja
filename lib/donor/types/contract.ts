export interface DonationRequest {
  amount: number; // in INR, > 0
  payment_method: 'upi' | 'qr' | 'card' | 'netbanking' | 'bank_transfer';
  donor_id: string | null; // null for guest / no-app donation
}

export interface DonationResponse {
  donation_id: string;
  amount: number;
  payment_method: 'upi' | 'qr' | 'card' | 'netbanking' | 'bank_transfer';
  status: 'success' | 'failed' | 'pending';
  credit_added: number;
  credit_balance: number;
  threshold_reached: boolean;
  created_at: string;
}

// Authoritative token status enum (token-flow.md). Legacy values
// (active/invalidated/unused/cancelled) are dropped from the UI.
export type TokenStatus =
  | 'generated'
  | 'live'
  | 'in_admin_pool'
  | 'assigned_to_volunteer'
  | 'distributed'
  | 'redeemed'
  | 'expired';

export interface CreditTransaction {
  id: string;
  type: 'donation' | 'purchase'; // governed credits ledger: { id, type, amount, at }
  amount: number;
  at: string;
}

export interface CreditsResponse {
  credit_balance: number;
  threshold: number; // conversion threshold (₹50)
  threshold_reached: boolean;
  convertible_tokens: number;
  withdrawable: boolean; // always false
  transactions: CreditTransaction[];
}

// Donors mint Standard only, exactly ONE token per convert. The distribution
// path is chosen after a successful mint (Path A "use it now" → live;
// Path B "authorize pApAmA" → in_admin_pool).
export interface ConvertRequest {
  amount: number; // >= threshold, <= balance
  distribution_path: 'use_now' | 'authorize_papama';
}

export interface ConvertTokenItem {
  token_id: string;
  serial_number: string;
  type: 'standard' | 'special_care';
  qr_payload: string;
  status: TokenStatus;
  value: number;
  expires_at: string;
}

// One mint → one token. `credit_balance` is the balance after the mint.
export interface ConvertResponse {
  token: ConvertTokenItem;
  credit_balance: number;
  converted: number;
}

export interface TokenItem {
  token_id: string;
  serial_number?: string;
  type: 'standard' | 'special_care';
  status: TokenStatus;
  qr_payload: string;
  // Rupees, not paise. The live route (app/api/donor/tokens/route.ts)
  // passes `value_inr` straight through; this comment used to claim paise
  // and the fixture written from it rendered every token as ₹5000.
  value: number;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  // Token Holder Support (token_flow.md)
  current_holder_type?: 'donor' | 'pool' | 'volunteer' | string;
  current_holder_id?: string;
  // Extracted from timeline journey if redeemed or if it has details:
  vendor_name?: string;
  location?: string;
  meal_info?: string;
  beneficiary_category?: string;
  is_special_care?: boolean;
  special_instructions?: string;
  // Printed-token area-lock (DIST-5 / owner §4.3): optional city/locality/PIN the
  // printed token is restricted to. Surfaced on the printable view; undefined when
  // the token has no per-token lock and no configured default region.
  area_lock?: string;
}

export interface TokensResponse {
  tokens: TokenItem[];
}

export interface MonthlySummaryItem {
  month: string; // "YYYY-MM"
  donated: number;
  meals: number;
}

export interface DashboardDonationHistoryItem {
  id: string;
  amount: number;
  at: string;
}

export interface RedemptionHistoryItem {
  token_id: string;
  vendor_name: string;
  location: string;
  time: string;
  meal_info: string;
  // 'beneficiary' is a neutral fallback when the category is unknown/private;
  // the UI maps any unrecognised value to a generic "Beneficiary" card.
  beneficiary_category: 'pregnant_women' | 'patient' | 'disability' | 'disaster_affected' | 'beneficiary' | string;
  // addon2 A5 — human-readable token ref + verified meal photo (signed URL,
  // present only once proof is approved).
  token_reference?: string;
  meal_photo_url?: string;
}

export interface DashboardResponse {
  total_credit: number;
  total_donations: number;
  total_tokens: number;
  meals_sponsored: number;
  monthly_summary: MonthlySummaryItem[];
  donation_history: DashboardDonationHistoryItem[];
  redemption_history: RedemptionHistoryItem[];
}

export interface NotificationMeta {
  vendor_name?: string;
  location?: string;
  time?: string;
  meal_info?: string;
  beneficiary_category?: 'pregnant_women' | 'patient' | 'disability' | 'disaster_affected';
  // addon2 A5 — donor transparency: human-readable token ref + verified meal photo.
  token_reference?: string;
  meal_photo_url?: string;
  value_inr?: number;
}

export interface NotificationItem {
  id: string;
  type: 'donation_success' | 'threshold' | 'token_generated' | 'redemption' | 'thank_you' | 'meal_photo';
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  meta: NotificationMeta | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
}

/**
 * One of the donor's own failed/duplicated payments that has no refund request
 * against it yet (GET /api/donor/refund-request).
 */
export interface DonorPaymentFailure {
  id: string;
  amount_inr: number;
  reason: string;
  status: string;
  created_at: string;
}

/** One refund the donor has raised, at whatever stage it has reached. */
export interface DonorRefund {
  id: string;
  payment_failure_id: string;
  amount_inr: number;
  reason: string;
  status: string;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface RefundOverview {
  payment_failures: DonorPaymentFailure[];
  refunds: DonorRefund[];
}
