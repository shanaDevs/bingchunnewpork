import { createApiRouter } from './surfaces';

/** Full API used when API_SURFACE is unset. Role processes use createApiRouter directly. */
const router = createApiRouter('core');

export default router;
