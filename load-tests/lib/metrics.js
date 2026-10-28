import { Counter, Rate, Trend } from 'k6/metrics';

/** Shared custom metrics across scenarios. */
export const orderSuccessRate = new Rate('order_success_rate');
export const orderDuration = new Trend('order_place_duration', true);
export const browseErrors = new Counter('browse_errors');
export const wsConnectErrors = new Counter('ws_connect_errors');
export const wsConnectDuration = new Trend('ws_connect_duration', true);
export const wsFirstEventDuration = new Trend('ws_first_event_duration', true);
export const wsConnectSuccess = new Rate('ws_connect_success');
export const driverGpsSuccess = new Rate('driver_gps_success');
export const driverGpsDuration = new Trend('driver_gps_duration', true);

export const cartSuccessRate = new Rate('cart_success_rate');
export const cartOpDuration = new Trend('cart_op_duration', true);
export const accountSuccessRate = new Rate('account_success_rate');
export const authChurnSuccessRate = new Rate('auth_churn_success_rate');
export const writeErrors = new Counter('write_errors');
