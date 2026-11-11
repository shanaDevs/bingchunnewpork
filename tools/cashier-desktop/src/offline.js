'use strict';

const params = new URLSearchParams(location.search);
const url = params.get('url') || '';
document.getElementById('url').textContent = url || '(no URL)';

document.getElementById('retry').addEventListener('click', () => {
  if (window.bingchunCashier?.reloadPos) {
    window.bingchunCashier.reloadPos();
  } else if (url) {
    location.href = url;
  }
});
