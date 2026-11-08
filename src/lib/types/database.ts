/**
 * Hand-written types for the Phase 0 schema.
 *
 * Once the local stack is running, prefer generating this file:
 *   npm run db:types
 *
 * Numeric columns are typed as `number`, which is what PostgREST returns.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "owner" | "admin" | "cashier" | "waiter" | "kitchen";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type RestaurantRow = Timestamps & {
  id: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  state_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  timezone: string;
  settings: Json;
  is_active: boolean;
  created_by: string | null;
};

export type PlanRow = Timestamps & {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  currency: string;
  trial_days: number;
  grace_period_days: number;
  max_staff: number | null;
  max_tables: number | null;
  features: Json;
  sort_order: number;
  is_active: boolean;
};

export type MembershipRow = Timestamps & {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  pin_hash: string | null;
  invited_by: string | null;
  joined_at: string | null;
};

export type SubscriptionRow = Timestamps & {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  valid_until: string;
  grace_period_days: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  metadata: Json;
};

export type SubscriptionEventRow = {
  id: number;
  restaurant_id: string;
  subscription_id: string | null;
  event_type: string;
  actor_id: string | null;
  details: Json;
  created_at: string;
};

export type CategoryRow = Timestamps & {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type MenuItemRow = Timestamps & {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  tax_rate: number;
  hsn_code: string | null;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
  sort_order: number;
};

export type DiningTableRow = Timestamps & {
  id: string;
  restaurant_id: string;
  label: string;
  seats: number;
  floor: string | null;
  status: "free" | "occupied" | "reserved" | "cleaning";
  current_order_id: string | null;
};

export type OrderRow = Timestamps & {
  id: string;
  restaurant_id: string;
  order_number: number;
  kot_number: number | null;
  table_id: string | null;
  order_type: "dine_in" | "takeaway" | "delivery" | "online";
  status: "new" | "preparing" | "served" | "billed" | "cancelled";
  cover_count: number;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  subtotal: number;
  discount_amount: number;
  tax_total: number;
  total: number;
  client_id: string;
  created_by: string | null;
  opened_at: string;
  closed_at: string | null;
};

export type OrderItemRow = Timestamps & {
  id: string;
  restaurant_id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  hsn_code: string | null;
  unit_price: number;
  tax_rate: number;
  quantity: number;
  discount_amount: number;
  line_total: number;
  line_tax: number;
  status: "active" | "void";
  notes: string | null;
  created_by: string | null;
};

export type BillRow = Timestamps & {
  id: string;
  restaurant_id: string;
  order_id: string;
  bill_number: number;
  subtotal: number;
  discount_amount: number;
  discount_percent: number | null;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  tax_total: number;
  round_off: number;
  total: number;
  status: "unpaid" | "partial" | "paid" | "void";
  tax_breakup: Json;
  is_interstate: boolean;
  customer_name: string | null;
  customer_gstin: string | null;
  idempotency_key: string | null;
  issued_at: string;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  voided_by: string | null;
  created_by: string | null;
};

export type PaymentRow = {
  id: string;
  restaurant_id: string;
  bill_id: string;
  mode: "cash" | "card" | "upi" | "wallet" | "credit" | "other";
  amount: number;
  reference: string | null;
  client_id: string | null;
  received_by: string | null;
  created_at: string;
};

export type DailySummaryRow = {
  restaurant_id: string;
  summary_date: string;
  orders_count: number;
  bills_count: number;
  void_bills_count: number;
  gross_sales: number;
  discounts: number;
  tax_total: number;
  net_sales: number;
  void_amount: number;
  cash_total: number;
  card_total: number;
  upi_total: number;
  other_total: number;
  updated_at: string;
};

export type AuditLogRow = {
  id: number;
  restaurant_id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: "insert" | "update" | "delete";
  table_name: string;
  record_id: string | null;
  before: Json | null;
  after: Json | null;
  reason: string | null;
  created_at: string;
};

export type MyRestaurantRow = {
  id: string;
  name: string;
  gstin: string | null;
  currency: string;
  timezone: string;
  settings: Json;
  role: AppRole;
  plan_id: string | null;
  plan_name: string | null;
  subscription_status: SubscriptionStatus | null;
  valid_until: string | null;
  grace_period_days: number | null;
  is_writable: boolean;
  days_left: number;
  in_grace: boolean;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      restaurants: Table<RestaurantRow, "name">;
      plans: Table<PlanRow, "id" | "name">;
      memberships: Table<MembershipRow, "restaurant_id" | "user_id" | "role">;
      subscriptions: Table<
        SubscriptionRow,
        "restaurant_id" | "plan_id" | "valid_until"
      >;
      subscription_events: Table<
        SubscriptionEventRow,
        "restaurant_id" | "event_type"
      >;
      categories: Table<CategoryRow, "restaurant_id" | "name">;
      menu_items: Table<MenuItemRow, "restaurant_id" | "name" | "price">;
      dining_tables: Table<DiningTableRow, "restaurant_id" | "label">;
      orders: Table<OrderRow, "restaurant_id" | "order_number" | "client_id">;
      order_items: Table<
        OrderItemRow,
        "restaurant_id" | "order_id" | "item_name" | "unit_price" | "tax_rate" | "quantity"
      >;
      bills: Table<BillRow, "restaurant_id" | "order_id" | "bill_number">;
      payments: Table<PaymentRow, "restaurant_id" | "bill_id" | "mode" | "amount">;
      daily_summaries: Table<DailySummaryRow, "restaurant_id" | "summary_date">;
      audit_log: Table<AuditLogRow, "restaurant_id" | "action" | "table_name">;
    };
    Views: {
      v_my_restaurants: {
        Row: MyRestaurantRow;
        Relationships: [];
      };
    };
    Functions: {
      create_restaurant: {
        Args: {
          p_name: string;
          p_phone?: string | null;
          p_address?: string | null;
          p_gstin?: string | null;
          p_state_code?: string | null;
          p_timezone?: string | null;
        };
        Returns: string;
      };
      create_order: {
        Args: {
          p_restaurant_id: string;
          p_client_id: string;
          p_items: Json;
          p_table_id?: string | null;
          p_order_type?: string | null;
          p_cover_count?: number | null;
          p_customer_name?: string | null;
          p_customer_phone?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      add_order_items: {
        Args: { p_order_id: string; p_items: Json };
        Returns: null;
      };
      update_order_status: {
        Args: { p_order_id: string; p_status: string };
        Returns: null;
      };
      void_order_item: {
        Args: { p_order_item_id: string; p_reason: string };
        Returns: null;
      };
      generate_bill: {
        Args: {
          p_order_id: string;
          p_discount_amount?: number | null;
          p_discount_percent?: number | null;
          p_payment_mode?: string | null;
          p_idempotency_key?: string | null;
          p_is_interstate?: boolean | null;
        };
        Returns: string;
      };
      record_payment: {
        Args: {
          p_bill_id: string;
          p_mode: string;
          p_amount: number;
          p_reference?: string | null;
          p_client_id?: string | null;
        };
        Returns: string;
      };
      void_bill: {
        Args: { p_bill_id: string; p_reason: string };
        Returns: null;
      };
      set_table_status: {
        Args: { p_table_id: string; p_status: string };
        Returns: null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
