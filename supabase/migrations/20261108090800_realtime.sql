-- ============================================================================
-- 090800_realtime
-- Publish only the tables the kitchen display, waiter screens and bill list
-- actually need. Every extra table costs fan-out on the connection limit.
--
-- Realtime respects RLS, so a subscriber only receives rows from restaurants
-- they belong to.
-- ============================================================================

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.dining_tables;
alter publication supabase_realtime add table public.bills;

-- Full row images so updates and deletes carry restaurant_id (needed for RLS
-- checks on UPDATE/DELETE payloads).
alter table public.orders replica identity full;
alter table public.dining_tables replica identity full;
