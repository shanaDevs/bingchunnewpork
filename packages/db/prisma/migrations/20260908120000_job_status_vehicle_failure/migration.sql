-- Close rides that end in a mid-route bike breakdown as DeliveryJobStatus.VEHICLE_FAILURE
-- (distinct from CANCELLED). Runtime patch also exists in backend deliverySchema.ts.
ALTER TYPE "DeliveryJobStatus" ADD VALUE IF NOT EXISTS 'VEHICLE_FAILURE';
