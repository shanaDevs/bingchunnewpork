-- Faster public menu, store list, and cashier activity lookups.
CREATE INDEX IF NOT EXISTS "stores_isActive_district_idx"
  ON "stores"("isActive", "district");

CREATE INDEX IF NOT EXISTS "categories_isActive_sortOrder_idx"
  ON "categories"("isActive", "sortOrder");

CREATE INDEX IF NOT EXISTS "products_categoryId_isAvailable_sortOrder_idx"
  ON "products"("categoryId", "isAvailable", "sortOrder");

CREATE INDEX IF NOT EXISTS "order_status_events_actorAdminId_createdAt_idx"
  ON "order_status_events"("actorAdminId", "createdAt");

DROP INDEX IF EXISTS "order_status_events_actorAdminId_idx";
