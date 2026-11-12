'use strict';

const $ = (id) => document.getElementById(id);

async function fillPrinters(selected) {
  const select = $('printer');
  select.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Windows default printer';
  select.appendChild(def);

  try {
    const printers = await window.cashierSettings.listPrinters();
    for (const p of printers) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.isDefault ? `${p.displayName} (default)` : p.displayName;
      select.appendChild(opt);
    }
  } catch {
    /* keep default option */
  }

  select.value = selected || '';
}

async function boot() {
  const cfg = await window.cashierSettings.getConfig();
  $('posUrl').value = cfg.posUrl || '';
  $('ver').textContent = await window.cashierSettings.getVersion();
  await fillPrinters(cfg.printerName || '');
}

$('refreshPrinters').addEventListener('click', async () => {
  await fillPrinters($('printer').value);
});

$('save').addEventListener('click', async () => {
  try {
    await window.cashierSettings.setConfig({
      posUrl: $('posUrl').value.trim(),
      printerName: $('printer').value,
      autoStartAgent: false,
    });
    const label = $('printer').value || 'Windows default';
    $('msg').textContent = `Saved. Stickers print to “${label}”.`;
    $('msg').className = 'msg';
  } catch (e) {
    $('msg').textContent = e instanceof Error ? e.message : 'Save failed';
    $('msg').className = 'msg err';
  }
});

$('cancel').addEventListener('click', () => window.close());
boot();
