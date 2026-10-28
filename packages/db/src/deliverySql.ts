/** Postgres schema that owns delivery tables (see migration move_delivery_tables_to_delivery_schema). */
export const DELIVERY_PG_SCHEMA = process.env.PG_DELIVERY_SCHEMA || 'delivery';

/** Qualified identifier for raw SQL, e.g. delivery."delivery_jobs". */
export function deliveryTableSql(tableName: string): string {
  const schema = DELIVERY_PG_SCHEMA.replace(/"/g, '""');
  const table = tableName.replace(/"/g, '""');
  return `"${schema}"."${table}"`;
}
