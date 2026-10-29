import { Prisma } from '@prisma/client';

/**
 * Large TEXT columns that Postgres stores out-of-line (TOAST). List endpoints never render
 * them, and reading them for every row both slows pages down and makes a single corrupt
 * TOAST chunk (SQLSTATE XX001) break the whole list.
 */
const HEAVY_ORDER_COLUMNS = ['qrCode'] as const;

type HeavyOrderColumn = (typeof HEAVY_ORDER_COLUMNS)[number];
type LightOrderColumn = Exclude<Prisma.OrderScalarFieldEnum, HeavyOrderColumn>;

/** `select` fragment with every Order scalar except heavy TOAST columns. */
export const ORDER_LIST_SCALARS = Object.fromEntries(
  Object.values(Prisma.OrderScalarFieldEnum)
    .filter((field) => !(HEAVY_ORDER_COLUMNS as readonly string[]).includes(field))
    .map((field) => [field, true]),
) as Record<LightOrderColumn, true>;
