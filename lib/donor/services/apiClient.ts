import {
  DonationResponse,
  CreditsResponse,
  ConvertResponse,
  TokensResponse,
  DashboardResponse,
  NotificationsResponse,
  TokenItem,
  CreditTransaction,
  NotificationItem,
  ConvertTokenItem,
  RefundOverview,
} from '../types/contract';
import { DashboardService } from './dashboardService';
import { isMockMode } from './mock-mode';

const STORAGE_KEYS = {
  CREDITS: 'papama_mock_credits',
  TOKENS: 'papama_mock_tokens',
  DASHBOARD: 'papama_mock_dashboard',
  NOTIFICATIONS: 'papama_mock_notifications',
};

// Helper for generating UUIDs
function generateUUID(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

// Mock QR payload that MIRRORS the production opaque format (`PAPAMA:<64-hex>`,
// see app/api/_lib/tokenQr.ts) instead of the old guessable plaintext
// `PAPAMA:<serial>`. Cosmetic — this path runs only in offline mock mode.
function mockOpaqueQr(): string {
  let hex = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    for (let i = 0; i < 64; i++) hex += ((Math.random() * 16) | 0).toString(16);
  }
  return `PAPAMA:${hex}`;
}

// Initial Data representing contract-aligned mockup values
const INITIAL_CREDITS: CreditsResponse = {
  credit_balance: 150,
  threshold: 50,
  threshold_reached: true,
  convertible_tokens: 3,
  withdrawable: false,
  transactions: [
    { id: 'tx_001', type: 'purchase', amount: 1000, at: '2026-06-10T10:00:00Z' },
    { id: 'tx_002', type: 'donation', amount: -600, at: '2026-06-11T12:30:00Z' },
    { id: 'tx_003', type: 'donation', amount: -250, at: '2026-06-14T15:00:00Z' },
  ],
};

const INITIAL_TOKENS: TokenItem[] = [
  {
    token_id: 'tok_001',
    serial_number: 'PPM-STD-10001',
    type: 'standard',
    status: 'redeemed',
    qr_payload: 'PAPAMA:9f2c4b7a1e6d8053c2a4f1b9e7d6038a5c1b2e4f7a9d0c3b6e8f1a2d4c5b7e90',
    value: 50,
    issued_at: '2026-06-11T12:30:00Z',
    expires_at: '2026-09-11T12:30:00Z',
    redeemed_at: '2026-06-17T13:00:00Z',
    vendor_name: 'Anna Canteen',
    location: 'T. Nagar, Chennai',
    meal_info: 'Lunch — Veg Thali',
    beneficiary_category: 'pregnant_women',
  },
  {
    token_id: 'tok_002',
    serial_number: 'PPM-STD-10002',
    type: 'standard',
    status: 'live',
    qr_payload: 'PAPAMA:3a1d5e8c0b7f2649d8c3a6f0e1b4d7029c5a8e3f6b1d4097e2c5a8f0b3d6e1c4',
    value: 50,
    issued_at: '2026-06-11T12:30:00Z',
    expires_at: '2026-09-11T12:30:00Z',
    redeemed_at: null,
  },
  {
    token_id: 'tok_003',
    serial_number: 'PPM-STD-10003',
    type: 'standard',
    status: 'redeemed',
    qr_payload: 'PAPAMA:7c0b3e6a9d2f5184b0e3c6a9f2d5081b4e7a0c3d6f9b2e5081a4d7c0b3f6e9a2',
    value: 50,
    issued_at: '2026-06-14T15:00:00Z',
    expires_at: '2026-09-14T15:00:00Z',
    redeemed_at: '2026-06-18T12:45:00Z',
    vendor_name: 'Sri Sai Kitchen',
    location: 'Velachery, Chennai',
    meal_info: 'Lunch — Sambar Rice',
    beneficiary_category: 'disability',
  },
  {
    token_id: 'tok_004',
    serial_number: 'PPM-STD-10004',
    type: 'standard',
    status: 'expired',
    qr_payload: 'PAPAMA:1e4a7d0c3b6f9285e1b4a7d0c3f6092b5e8a1d4c7f0b3e6a9d2c5f8b1e4a7d0c',
    value: 50,
    issued_at: '2026-03-01T10:00:00Z',
    expires_at: '2026-06-01T00:00:00Z',
    redeemed_at: null,
  },
  {
    token_id: 'tok_005',
    serial_number: 'PPM-STD-10005',
    type: 'standard',
    status: 'in_admin_pool',
    qr_payload: 'PAPAMA:5b8e1a4d7c0f3692b5e8a1d4f7c0b3e6a9d2f5081b4e7a0c3d6f9b2e5a8d1c4f',
    value: 50,
    issued_at: '2026-06-14T15:00:00Z',
    expires_at: '2026-09-14T15:00:00Z',
    redeemed_at: null,
  },
];

const INITIAL_DASHBOARD: DashboardResponse = {
  total_credit: 150,
  total_donations: 1200,
  total_tokens: 12,
  meals_sponsored: 12,
  monthly_summary: [
    { month: '2026-05', donated: 400, meals: 4 },
    { month: '2026-06', donated: 800, meals: 8 },
  ],
  donation_history: [
    { id: 'don_101', amount: 600, at: '2026-06-11T12:30:00Z' },
    { id: 'don_102', amount: 600, at: '2026-06-14T15:00:00Z' },
  ],
  redemption_history: [
    {
      token_id: 'tok_001',
      vendor_name: 'Anna Canteen',
      location: 'T. Nagar, Chennai',
      time: '2026-06-17T13:00:00Z',
      meal_info: 'Lunch — Veg Thali',
      beneficiary_category: 'pregnant_women',
    },
    {
      token_id: 'tok_003',
      vendor_name: 'Sri Sai Kitchen',
      location: 'Velachery, Chennai',
      time: '2026-06-18T12:45:00Z',
      meal_info: 'Lunch — Sambar Rice',
      beneficiary_category: 'disability',
    },
  ],
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif_101',
    type: 'redemption',
    title: 'Your meal was served',
    body: 'A standard token you funded was redeemed for a hot meal.',
    read: false,
    created_at: '2026-06-17T13:05:00Z',
    meta: {
      vendor_name: 'Anna Canteen',
      location: 'T. Nagar, Chennai',
      time: '2026-06-17T13:00:00Z',
      meal_info: 'Lunch — Veg Thali',
      beneficiary_category: 'pregnant_women',
    },
  },
  {
    id: 'notif_102',
    type: 'threshold',
    title: 'Conversion Threshold Met',
    body: 'Your credit balance is ₹150. You can now convert credits into food tokens!',
    read: false,
    created_at: '2026-06-18T10:00:00Z',
    meta: null,
  },
];

// Browser Local Mock DB Class
class MockDb {
  private isClient = typeof window !== 'undefined';

  private get<T>(key: string, defaultValue: T): T {
    if (!this.isClient) return defaultValue;
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  }

  private set<T>(key: string, value: T): void {
    if (!this.isClient) return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  getCredits(): CreditsResponse {
    return this.get(STORAGE_KEYS.CREDITS, INITIAL_CREDITS);
  }

  saveCredits(data: CreditsResponse): void {
    this.set(STORAGE_KEYS.CREDITS, data);
  }

  getTokens(): TokenItem[] {
    return this.get(STORAGE_KEYS.TOKENS, INITIAL_TOKENS);
  }

  saveTokens(data: TokenItem[]): void {
    this.set(STORAGE_KEYS.TOKENS, data);
  }

  getDashboard(): DashboardResponse {
    return this.get(STORAGE_KEYS.DASHBOARD, INITIAL_DASHBOARD);
  }

  saveDashboard(data: DashboardResponse): void {
    this.set(STORAGE_KEYS.DASHBOARD, data);
  }

  getNotifications(): NotificationItem[] {
    return this.get(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
  }

  saveNotifications(data: NotificationItem[]): void {
    this.set(STORAGE_KEYS.NOTIFICATIONS, data);
  }

  resetAll(): void {
    if (!this.isClient) return;
    localStorage.removeItem(STORAGE_KEYS.CREDITS);
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.DASHBOARD);
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
  }
}

const mockDb = new MockDb();

// ---------------------------------------------------------------------------
// Mock-mode handlers. These run ONLY when NEXT_PUBLIC_USE_MOCK_API === 'true'
// (offline demo). Every default path below hits the real governed same-origin
// routes with the session cookie.
// ---------------------------------------------------------------------------

function mockCreateDonation(amount: number, paymentMethod: string, donorId: string | null): DonationResponse {
  const donationId = generateUUID();
  const now = new Date().toISOString();

  const credits = mockDb.getCredits();
  const wasReached = credits.threshold_reached;
  const newBalance = credits.credit_balance + amount;
  const thresholdReached = newBalance >= credits.threshold;

  credits.credit_balance = newBalance;
  credits.threshold_reached = thresholdReached;
  credits.convertible_tokens = Math.floor(newBalance / credits.threshold);
  credits.transactions.unshift({ id: generateUUID(), type: 'purchase', amount, at: now });
  mockDb.saveCredits(credits);

  if (donorId) {
    const dashboard = mockDb.getDashboard();
    dashboard.total_credit = newBalance;
    dashboard.total_donations += amount;
    dashboard.donation_history.unshift({ id: donationId, amount, at: now });
    const currentMonth = now.substring(0, 7);
    const monthlyItem = dashboard.monthly_summary.find((m) => m.month === currentMonth);
    if (monthlyItem) {
      monthlyItem.donated += amount;
    } else {
      dashboard.monthly_summary.push({ month: currentMonth, donated: amount, meals: 0 });
    }
    mockDb.saveDashboard(dashboard);
  }

  const notifs = mockDb.getNotifications();
  notifs.unshift({
    id: generateUUID(),
    type: 'donation_success',
    title: 'Donation Completed Successfully',
    body: `Thank you! Your donation of ₹${amount} was processed using ${paymentMethod.toUpperCase()}.`,
    read: false,
    created_at: now,
    meta: null,
  });
  if (!wasReached && thresholdReached) {
    notifs.unshift({
      id: generateUUID(),
      type: 'threshold',
      title: 'Conversion Threshold Met',
      body: `Your credit balance is ₹${newBalance}. You can now convert credits into food tokens!`,
      read: false,
      created_at: now,
      meta: null,
    });
  }
  mockDb.saveNotifications(notifs);

  return {
    donation_id: donationId,
    amount,
    payment_method: paymentMethod as DonationResponse['payment_method'],
    status: 'success',
    credit_added: amount,
    credit_balance: newBalance,
    threshold_reached: thresholdReached,
    created_at: now,
  };
}

function mockConvert(amount: number, distributionPath: 'use_now' | 'authorize_papama'): ConvertResponse {
  const now = new Date().toISOString();
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 3);
  const expiresAt = expiry.toISOString();

  const credits = mockDb.getCredits();
  if (credits.credit_balance < amount) {
    throw new Error('Insufficient credit balance');
  }

  const newBalance = credits.credit_balance - amount;
  credits.credit_balance = newBalance;
  credits.threshold_reached = newBalance >= credits.threshold;
  credits.convertible_tokens = Math.floor(newBalance / credits.threshold);
  credits.transactions.unshift({ id: generateUUID(), type: 'donation', amount: -amount, at: now });
  mockDb.saveCredits(credits);

  const tokenId = generateUUID();
  const serial = `PPM-STD-${Math.floor(10000 + Math.random() * 90000)}`;
  const status = distributionPath === 'use_now' ? 'live' : 'in_admin_pool';
  const newToken: TokenItem = {
    token_id: tokenId,
    serial_number: serial,
    type: 'standard',
    status,
    qr_payload: mockOpaqueQr(),
    value: amount,
    issued_at: now,
    expires_at: expiresAt,
    redeemed_at: null,
  };

  const tokensList = mockDb.getTokens();
  tokensList.unshift(newToken);
  mockDb.saveTokens(tokensList);

  const dashboard = mockDb.getDashboard();
  dashboard.total_credit = newBalance;
  dashboard.total_tokens += 1;
  mockDb.saveDashboard(dashboard);

  const notifs = mockDb.getNotifications();
  notifs.unshift({
    id: generateUUID(),
    type: 'token_generated',
    title: 'Token Generated Successfully',
    body: `Converted ₹${amount} credit into 1 standard food token.`,
    read: false,
    created_at: now,
    meta: null,
  });
  mockDb.saveNotifications(notifs);

  const convertToken: ConvertTokenItem = {
    token_id: newToken.token_id,
    serial_number: serial,
    type: newToken.type,
    qr_payload: newToken.qr_payload,
    status: newToken.status,
    value: newToken.value,
    expires_at: newToken.expires_at,
  };

  return { token: convertToken, credit_balance: newBalance, converted: amount };
}

async function readError(res: Response, fallback: string): Promise<string> {
  return (await res.json().catch(() => ({}))).error ?? fallback;
}

export const ApiClient = {
  // The real same-origin governed routes are the DEFAULT for every method
  // (POST /api/donations/create, /api/tokens/convert; GET /api/donor/credits,
  // /api/donor/tokens, /api/donor/dashboard, /api/donor/notifications). The
  // in-browser mock DB is used ONLY when NEXT_PUBLIC_USE_MOCK_API === 'true'.

  async createDonation(amount: number, paymentMethod: string, donorId: string | null): Promise<DonationResponse> {
    if (isMockMode()) {
      return mockCreateDonation(amount, paymentMethod, donorId);
    }
    const res = await fetch('/api/donations/create', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_inr: amount, payment_method: paymentMethod }),
    });
    if (!res.ok) throw new Error(await readError(res, `Donation failed (${res.status})`));
    const d = await res.json();
    return {
      donation_id: d.donation_id,
      amount,
      payment_method: paymentMethod as DonationResponse['payment_method'],
      status: d.status === 'completed' ? 'success' : (d.status as DonationResponse['status']),
      credit_added: d.credit_added,
      credit_balance: d.credit_balance,
      threshold_reached: d.threshold_reached,
      created_at: new Date().toISOString(),
    };
  },

  // Guest / no-account donation (public /donate, /donate/qr, and the donor
  // "Donate anonymously" toggle). Hits the UNGATED /api/donations/create-guest
  // so it succeeds without a session (the gated /create 401s for guests).
  async createGuestDonation(amount: number, paymentMethod: string): Promise<DonationResponse> {
    if (isMockMode()) {
      return mockCreateDonation(amount, paymentMethod, null);
    }
    const res = await fetch('/api/donations/create-guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_inr: amount, payment_method: paymentMethod }),
    });
    if (!res.ok) throw new Error(await readError(res, `Donation failed (${res.status})`));
    const d = await res.json();
    return {
      donation_id: d.donation_id,
      amount,
      payment_method: paymentMethod as DonationResponse['payment_method'],
      status: d.status === 'completed' ? 'success' : (d.status as DonationResponse['status']),
      credit_added: d.credit_added,
      credit_balance: d.credit_balance,
      threshold_reached: d.threshold_reached,
      created_at: new Date().toISOString(),
    };
  },

  // Real UPI manual-QR flow. `generateUpiQr` creates a PENDING payment + QR;
  // `confirmUpiQr` records the donor's UTR and credits the donation.
  async generateUpiQr(amount: number): Promise<{
    qrCode: string;
    upiString: string;
    transactionRef: string;
    expiresAt: string;
    amount: number;
    merchantName: string;
    upiId: string;
    usingPlaceholder: boolean;
  }> {
    const res = await fetch('/api/payment/upi-qr/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_inr: amount }),
    });
    if (!res.ok) throw new Error(await readError(res, `Could not generate QR (${res.status})`));
    return res.json();
  },

  async confirmUpiQr(
    transactionRef: string,
    upiTransactionId: string
  ): Promise<{ donation_id: string; amount: number; status: string; upiTransactionId: string }> {
    const res = await fetch('/api/payment/upi-qr/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionRef, upiTransactionId }),
    });
    if (!res.ok) throw new Error(await readError(res, `Could not confirm payment (${res.status})`));
    return res.json();
  },

  async getCredits(): Promise<CreditsResponse> {
    if (isMockMode()) {
      return mockDb.getCredits();
    }
    const res = await fetch('/api/donor/credits', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(await readError(res, `Failed to load credits (${res.status})`));
    const c = await res.json();
    const threshold: number = c.threshold ?? 0;
    return {
      credit_balance: c.credit_balance,
      threshold,
      threshold_reached: c.threshold_reached,
      convertible_tokens: threshold > 0 ? Math.floor(c.credit_balance / threshold) : 0,
      withdrawable: false,
      transactions: (c.transactions ?? []).map(
        (t: { id: string; type: string; amount: number; description?: string; timestamp: string }): CreditTransaction => ({
          id: t.id,
          type: t.type as CreditTransaction['type'],
          amount: t.amount,
          at: t.timestamp,
        })
      ),
    };
  },

  // Mints exactly ONE standard token. `distributionPath` is the Path A/B fork:
  // 'use_now' → live, 'authorize_papama' → in_admin_pool.
  async convertCreditToToken(
    amount: number,
    distributionPath: 'use_now' | 'authorize_papama'
  ): Promise<ConvertResponse> {
    if (isMockMode()) {
      return mockConvert(amount, distributionPath);
    }
    const res = await fetch('/api/tokens/convert', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token_type: 'standard',
        amount_inr: amount,
        distribution_path: distributionPath,
      }),
    });
    if (!res.ok) throw new Error(await readError(res, `Conversion failed (${res.status})`));
    const t = await res.json();
    const token: ConvertTokenItem = {
      token_id: t.token_id,
      serial_number: t.serial_number,
      type: t.token_type,
      qr_payload: t.qr_payload,
      status: t.status,
      value: t.value,
      expires_at: t.expires_at ?? '',
    };
    return { token, credit_balance: t.credit_balance, converted: amount };
  },

  async getTokens(): Promise<TokensResponse> {
    if (isMockMode()) {
      return { tokens: mockDb.getTokens() };
    }
    const res = await fetch('/api/donor/tokens', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(await readError(res, `Failed to load tokens (${res.status})`));
    const d = await res.json();
    return {
      tokens: (d.tokens ?? []).map((t: Record<string, unknown>): TokenItem => ({
        token_id: t.token_id as string,
        serial_number: t.serial_number as string | undefined,
        type: t.token_type as TokenItem['type'],
        status: t.status as TokenItem['status'],
        qr_payload: t.qr_payload as string,
        value: t.value as number,
        issued_at: (t.issued_at as string) ?? (t.minted_at as string),
        expires_at: (t.expires_at as string | null) ?? '',
        redeemed_at: (t.redeemed_at as string | null) ?? null,
        is_special_care: t.is_special_care as boolean | undefined,
        special_instructions: t.special_instructions as string | undefined,
        // Printed-token area-lock (DIST-5): pass through when the API surfaces it.
        area_lock: (t.area_lock as string | null) ?? undefined,
      })),
    };
  },

  async getDashboard(donorId?: string): Promise<DashboardResponse> {
    if (isMockMode()) {
      const dashboard = mockDb.getDashboard();
      dashboard.total_credit = mockDb.getCredits().credit_balance;
      return dashboard;
    }
    // Prefer the real same-origin dashboard route. The Supabase service is a
    // fallback for when a donor id is known but the route is unavailable.
    const res = await fetch('/api/donor/dashboard', { credentials: 'same-origin', cache: 'no-store' });
    if (res.ok) {
      return (await res.json()) as DashboardResponse;
    }
    if (donorId) {
      try {
        return await DashboardService.getDashboardData(donorId);
      } catch (err) {
        console.warn('Failed to fetch dashboard from Supabase:', err);
      }
    }
    throw new Error(await readError(res, `Failed to load dashboard (${res.status})`));
  },

  async getNotifications(): Promise<NotificationsResponse> {
    if (isMockMode()) {
      return { notifications: mockDb.getNotifications() };
    }
    const res = await fetch('/api/donor/notifications', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(await readError(res, `Failed to load notifications (${res.status})`));
    return (await res.json()) as NotificationsResponse;
  },

  async markNotificationRead(id: string): Promise<void> {
    if (isMockMode()) {
      const notifs = mockDb.getNotifications();
      const item = notifs.find((n) => n.id === id);
      if (item) {
        item.read = true;
        mockDb.saveNotifications(notifs);
      }
      return;
    }
    const res = await fetch('/api/donor/notifications/read', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(await readError(res, `Failed to mark notification read (${res.status})`));
  },

  /**
   * The donor's own open payment failures (nothing requested against them yet)
   * plus every refund they have raised. Mock mode returns empty rather than
   * inventing a failed payment — a fake one would invite a refund request that
   * cannot exist.
   */
  async getRefundOverview(): Promise<RefundOverview> {
    if (isMockMode()) {
      return { payment_failures: [], refunds: [] };
    }
    const res = await fetch('/api/donor/refund-request', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(await readError(res, `Failed to load refunds (${res.status})`));
    return (await res.json()) as RefundOverview;
  },

  /** Raise a refund against one open payment failure. */
  async requestRefund(paymentFailureId: string, amountInr: number, reason: string): Promise<{ id: string }> {
    const res = await fetch('/api/donor/refund-request', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_failure_id: paymentFailureId, amount_inr: amountInr, reason }),
    });
    if (!res.ok) throw new Error(await readError(res, `Refund request failed (${res.status})`));
    return (await res.json()) as { id: string };
  },

  // Developer utility to reset local db state if needed
  resetMockDb(): void {
    mockDb.resetAll();
  },
};
