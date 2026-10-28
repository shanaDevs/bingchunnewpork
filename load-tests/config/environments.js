/** Target environments — switch with `-e ENV=local|production`. */
export const environments = {
  local: {
    httpBase: 'http://localhost:4000',
    wsBase: 'ws://localhost:4000',
    deliveryBase: 'http://localhost:4100',
  },
  production: {
    httpBase: 'https://bing-chun-core.bc.dartcodes.com',
    wsBase: 'wss://bing-chun-core.bc.dartcodes.com',
    deliveryBase: 'https://bing-chun-delivery.bc.dartcodes.com',
    shopBase: 'https://bing-chun.bc.dartcodes.com',
  },
};
