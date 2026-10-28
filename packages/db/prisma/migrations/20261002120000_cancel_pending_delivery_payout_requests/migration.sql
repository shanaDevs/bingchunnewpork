-- Retire delivery-admin payout request flow: pending rows block periods via exclusion constraint.
UPDATE "delivery_payouts"
SET
  "status" = 'CANCELLED',
  "rejectionReason" = 'Request flow retired; pay from Payouts Due',
  "updatedAt" = NOW()
WHERE "status" = 'PENDING';
