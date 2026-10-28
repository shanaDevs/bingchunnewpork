-- Add VEHICLE_FAILURE as a delivery attempt outcome, reported by drivers whose
-- vehicle breaks down mid-ride (distinct from customer-side failure reasons).
ALTER TYPE "DeliveryAttemptOutcome" ADD VALUE IF NOT EXISTS 'VEHICLE_FAILURE';
