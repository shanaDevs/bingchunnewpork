-- Add REMOVE_BRANCH to driver branch request types (QA #12).
ALTER TYPE "DriverBranchRequestType" ADD VALUE IF NOT EXISTS 'REMOVE_BRANCH';
