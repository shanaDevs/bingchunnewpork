/** Radius in metres for the branch job-completion zone circle on the admin route map.
 *  Override via NEXT_PUBLIC_BRANCH_RETURN_RADIUS_M env var. */
export const BRANCH_RETURN_RADIUS_M =
  Number(process.env.NEXT_PUBLIC_BRANCH_RETURN_RADIUS_M) || 100;
