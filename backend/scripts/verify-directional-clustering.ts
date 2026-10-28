import { bearingDeg } from '../src/lib/routeOptimizer';
import {
  clusterOrdersByCups,
  clusterOrdersByDirection,
  compassLabel,
  DEFAULT_MAX_CUPS_PER_RIDER,
  DIRECTIONAL_CUP_THRESHOLD,
  type ClusterableOrder,
} from '../src/lib/orderClustering';

function makeOrder(
  id: string,
  lat: number,
  lng: number,
  itemCount = 1
): ClusterableOrder {
  return {
    orderId: id,
    orderNumber: id,
    customerName: 'Test',
    addressLine: 'Addr',
    city: 'City',
    district: 'Dist',
    total: 500,
    itemCount,
    paymentStatus: 'PENDING',
    paymentMethod: 'CASH_ON_DELIVERY',
    lat,
    lng,
  };
}

function cupsInCluster(orders: ClusterableOrder[]): number {
  return orders.reduce((n, o) => n + o.itemCount, 0);
}

const origin = { lat: 6.9271, lng: 79.8612 };

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}`);
  }
}

console.log('bearingDeg');
assert('north is ~0', Math.abs(bearingDeg(origin, { lat: origin.lat + 0.1, lng: origin.lng })) < 5);
assert('east is ~90', Math.abs(bearingDeg(origin, { lat: origin.lat, lng: origin.lng + 0.1 }) - 90) < 5);

console.log('\ncompassLabel');
assert('0 -> North', compassLabel(0) === 'North');
assert('45 -> North-East', compassLabel(45) === 'North-East');

console.log(`\nmanual mode (< ${DIRECTIONAL_CUP_THRESHOLD} cups)`);
const manualOrders = [
  makeOrder('o1', origin.lat + 0.05, origin.lng, 3),
  makeOrder('o2', origin.lat - 0.05, origin.lng, 4),
];
const manualClusters = clusterOrdersByDirection(manualOrders, origin);
assert('single cluster', manualClusters.length === 1);
assert('manual id', manualClusters[0].id === 'manual');
assert('all orders included', manualClusters[0].orders.length === 2);

console.log('\ndirectional mode (N vs S)');
const north = makeOrder('n1', origin.lat + 0.08, origin.lng, 5);
const north2 = makeOrder('n2', origin.lat + 0.06, origin.lng + 0.01, 3);
const south = makeOrder('s1', origin.lat - 0.08, origin.lng, 4);
const south2 = makeOrder('s2', origin.lat - 0.06, origin.lng - 0.01, 3);
const dirClusters = clusterOrdersByDirection([north, north2, south, south2], origin);
assert('two directional groups', dirClusters.length === 2);
const allIds = dirClusters.flatMap((c) => c.orderIds).sort();
assert('all orders assigned', allIds.join(',') === 'n1,n2,s1,s2');
const northCluster = dirClusters.find((c) => c.orderIds.includes('n1'));
const southCluster = dirClusters.find((c) => c.orderIds.includes('s1'));
assert('north and south separated', Boolean(northCluster && southCluster && northCluster !== southCluster));

console.log('\ncups batching (max 20 cups per run)');
const cupOrders = [
  makeOrder('a', origin.lat, origin.lng, 8),
  makeOrder('b', origin.lat, origin.lng, 8),
  makeOrder('c', origin.lat, origin.lng, 8),
  makeOrder('d', origin.lat, origin.lng, 5),
];
const cupBatches = clusterOrdersByCups(cupOrders, 20);
assert('splits into 2 runs', cupBatches.length === 2);
assert('first run has 16 cups', cupsInCluster(cupBatches[0].orders) === 16);
assert('second run has 13 cups', cupsInCluster(cupBatches[1].orders) === 13);
assert(
  'each run <= 20 cups',
  cupBatches.every((b) => cupsInCluster(b.orders) <= 20)
);

console.log('\noversized single order (>20 cups)');
const bigOrder = clusterOrdersByCups([makeOrder('big', origin.lat, origin.lng, 25)], 20);
assert('single oversized order gets own run', bigOrder.length === 1);
assert('oversized run has 25 cups', cupsInCluster(bigOrder[0].orders) === 25);

console.log('\ndirectional sub-batching by cups (>20 cups in one half)');
const manyNorth = [
  ...Array.from({ length: 20 }, (_, i) => makeOrder(`m${i}`, origin.lat + 0.01 + i * 0.001, origin.lng, 1)),
  ...Array.from({ length: 5 }, (_, i) => makeOrder(`mX${i}`, origin.lat + 0.03 + i * 0.001, origin.lng, 1)),
];
const manySouth = Array.from({ length: 5 }, (_, i) =>
  makeOrder(`s${i}`, origin.lat - 0.05 - i * 0.001, origin.lng, 1)
);
const subClusters = clusterOrdersByDirection([...manyNorth, ...manySouth], origin, DEFAULT_MAX_CUPS_PER_RIDER);
const northRuns = subClusters.filter((c) => c.orderIds.some((id) => id.startsWith('m')));
assert('north half split into 2 runs by cups', northRuns.length === 2);
assert(
  'north runs have 20 and 5 cups',
  northRuns.map((c) => cupsInCluster(c.orders)).sort((a, b) => b - a).join(',') === '20,5'
);
assert(
  'all directional runs <= 20 cups',
  subClusters.every((c) => cupsInCluster(c.orders) <= 20 || cupsInCluster(c.orders) > 20 && c.orders.length === 1)
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
