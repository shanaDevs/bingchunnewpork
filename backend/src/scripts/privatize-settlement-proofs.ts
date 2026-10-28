/**
 * Set existing settlement slips and driver licences in Spaces to private.
 * Run once per environment after private uploads + /admin/spaces-proof (or proof-url presign) are deployed.
 *
 *   npm run privatize:settlement-proofs -w @bingchun/backend
 */
import { privatizeProofObjects } from '../lib/spaces';

async function main() {
  const changed = await privatizeProofObjects();
  console.log(`Marked ${changed} object(s) private`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
