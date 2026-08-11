import { estimatedEffortHours, hoursPerPeriod, totalClientCost } from './calculations';

export type ClientPngAllocation = { periodNumber: number; allocation: number };

export type ClientPngPlanRow = {
  clientRole: string;
  name: string;
  clientHourlyRate: number;
  allocations: ClientPngAllocation[];
};

export type ClientPngPhase = { name: string; periodCount: number };

export type ClientPngInput = {
  projectName: string;
  clientCurrency: string;
  planningMode: 'weekly' | 'monthly';
  daysInFTE: number;
  resourcePlans: ClientPngPlanRow[];
  phases: ClientPngPhase[];
  /** Override for deterministic filename tests */
  now?: Date;
};

export type ClientPngColumn = { label: string; w: number };

export type ClientPngBuiltRow = {
  cells: string[];
  price: number;
  efforts: number;
};

export type ClientPngPhaseBreakdown = {
  name: string;
  price: number;
  efforts: number;
};

export type ClientPngExportModel = {
  filename: string;
  currencySymbol: string;
  projectName: string;
  generatedLabel: string;
  columns: ClientPngColumn[];
  rows: ClientPngBuiltRow[];
  totalsCells: string[];
  totals: {
    totalPrice: number;
    totalEfforts: number;
    blendedHourlyRate: number;
    blendedDailyRate: number;
    duration: number;
    durationLabel: string;
  };
  phaseBreakdown: ClientPngPhaseBreakdown[];
};

/** Labels/fragments that must never appear in a client-safe PNG. */
export const CLIENT_PNG_FORBIDDEN_LABEL_FRAGMENTS = [
  'int.',
  'internal',
  'margin',
  'rate card',
] as const;

export function clientCurrencySymbol(clientCurrency: string): string {
  if (clientCurrency === 'EUR') return '€';
  if (clientCurrency === 'GBP') return '£';
  return '$';
}

export function buildClientPngExport(
  input: ClientPngInput
): { ok: false; error: 'empty' } | { ok: true; model: ClientPngExportModel } {
  if (!input.resourcePlans.length) {
    return { ok: false, error: 'empty' };
  }

  const symbol = clientCurrencySymbol(input.clientCurrency);
  const isMonthly = input.planningMode === 'monthly';
  const periodLbl = isMonthly ? 'Month' : 'Week';
  const hrsPerPeriod = hoursPerPeriod(input.planningMode, input.daysInFTE);

  const totalPeriods = input.phases.reduce((s, p) => {
    const n = Number(p.periodCount);
    return s + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  }, 0);
  const periodNumbers = Array.from({ length: totalPeriods }, (_, i) => i + 1);

  const columns: ClientPngColumn[] = [
    { label: 'Role', w: 160 },
    { label: 'Name', w: 130 },
    { label: `Hourly Rate (${symbol})`, w: 110 },
    { label: `Daily Rate (${symbol})`, w: 110 },
    ...periodNumbers.map((n) => ({ label: `${periodLbl} ${n} (%)`, w: isMonthly ? 70 : 64 })),
    { label: `Total Price (${symbol})`, w: 120 },
    { label: 'Estimated Efforts (h)', w: 120 },
  ];

  const rows: ClientPngBuiltRow[] = input.resourcePlans.map((plan) => {
    const rate = Number.isFinite(plan.clientHourlyRate) ? plan.clientHourlyRate : 0;
    let periodsEquiv = 0;
    periodNumbers.forEach((weekNum) => {
      const alloc = plan.allocations.find((a) => a.periodNumber === weekNum);
      const pct = Number.isFinite(alloc?.allocation) ? (alloc?.allocation || 0) : 0;
      periodsEquiv += pct / 100;
    });
    const efforts = estimatedEffortHours(periodsEquiv, hrsPerPeriod);
    const price = totalClientCost(efforts, rate);
    const daily = rate * 8;
    const cells = [
      plan.clientRole || '',
      plan.name || '',
      `${symbol}${Math.round(rate)}`,
      `${symbol}${Math.round(daily)}`,
      ...periodNumbers.map((weekNum) => {
        const alloc = plan.allocations.find((a) => a.periodNumber === weekNum);
        const pct = Number.isFinite(alloc?.allocation) ? (alloc?.allocation || 0) : 0;
        return `${pct}`;
      }),
      `${symbol}${Math.round(price).toLocaleString()}`,
      `${Math.round(efforts).toLocaleString()}`,
    ];
    return { cells, price, efforts };
  });

  const totalPrice = rows.reduce((s, r) => s + r.price, 0);
  const totalEfforts = rows.reduce((s, r) => s + r.efforts, 0);
  const blendedHourlyRate = totalEfforts > 0 ? totalPrice / totalEfforts : 0;
  const blendedDailyRate = blendedHourlyRate * 8;

  const totalsCells = [
    'TOTALS',
    '',
    '',
    '',
    ...periodNumbers.map(() => ''),
    `${symbol}${Math.round(totalPrice).toLocaleString()}`,
    `${Math.round(totalEfforts).toLocaleString()}`,
  ];

  let startPeriod = 1;
  const phaseBreakdown: ClientPngPhaseBreakdown[] = input.phases.map((phase) => {
    const raw = Number(phase.periodCount);
    const count = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    const endPeriod = startPeriod + count - 1;
    let price = 0;
    let efforts = 0;
    input.resourcePlans.forEach((plan) => {
      const rate = Number.isFinite(plan.clientHourlyRate) ? plan.clientHourlyRate : 0;
      let periodsEquiv = 0;
      for (let p = startPeriod; p <= endPeriod; p++) {
        const alloc = plan.allocations.find((a) => a.periodNumber === p);
        const pct = Number.isFinite(alloc?.allocation) ? (alloc?.allocation || 0) : 0;
        periodsEquiv += pct / 100;
      }
      const hours = estimatedEffortHours(periodsEquiv, hrsPerPeriod);
      price += totalClientCost(hours, rate);
      efforts += hours;
    });
    startPeriod = endPeriod + 1;
    return { name: phase.name, price, efforts };
  });

  const candidateNow = input.now ?? new Date();
  const now =
    candidateNow instanceof Date && !Number.isNaN(candidateNow.getTime())
      ? candidateNow
      : new Date();
  const datePart = now.toISOString().split('T')[0];
  const safeName = (input.projectName || 'project')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim() || 'project';
  const filename = `resource-plan-${safeName}-${datePart}.png`;

  return {
    ok: true,
    model: {
      filename,
      currencySymbol: symbol,
      projectName: safeName,
      generatedLabel: `Generated: ${now.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`,
      columns,
      rows,
      totalsCells,
      totals: {
        totalPrice,
        totalEfforts,
        blendedHourlyRate,
        blendedDailyRate,
        duration: totalPeriods,
        durationLabel: isMonthly ? 'Duration (months)' : 'Duration (weeks)',
      },
      phaseBreakdown,
    },
  };
}

export function downloadClientViewPng(model: ClientPngExportModel): void {
  const SCALE = 2;
  const PAD = 32;
  const HEADER_H = 88;
  const COL_H = 38;
  const ROW_H = 30;
  const GAP = 24;
  const SUMMARY_METRICS_H = 140;
  const PHASE_HEADER_H = 36;
  const PHASE_ROW_H = 28;
  const phaseBlockH =
    model.phaseBreakdown.length > 0
      ? PHASE_HEADER_H + 28 + model.phaseBreakdown.length * PHASE_ROW_H + 16
      : 0;
  const SUMMARY_H = SUMMARY_METRICS_H + phaseBlockH + GAP;

  const tableW = model.columns.reduce((s, c) => s + c.w, 0);
  const canvasW = Math.max(tableW + PAD * 2, 900);
  const tableH = COL_H + (model.rows.length + 1) * ROW_H;
  const canvasH = HEADER_H + GAP + tableH + GAP + SUMMARY_H + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * SCALE;
  canvas.height = canvasH * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px system-ui, -apple-system, Arial, sans-serif';
  ctx.fillText(model.projectName, PAD, PAD + 26);
  ctx.fillStyle = '#64748b';
  ctx.font = '13px system-ui, -apple-system, Arial, sans-serif';
  ctx.fillText(model.generatedLabel, PAD, PAD + 52);

  const tableX = PAD;
  let tableY = HEADER_H + GAP;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(tableX, tableY, tableW, COL_H);
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 10.5px system-ui, -apple-system, Arial, sans-serif';
  let cx = tableX;
  model.columns.forEach((col) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx + 1, tableY, col.w - 2, COL_H);
    ctx.clip();
    ctx.fillText(col.label, cx + 7, tableY + 24);
    ctx.restore();
    cx += col.w;
  });
  tableY += COL_H;

  model.rows.forEach((row, i) => {
    const rowY = tableY + i * ROW_H;
    ctx.fillStyle = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(tableX, rowY, tableW, ROW_H);
    ctx.fillStyle = '#334155';
    ctx.font = '11px system-ui, -apple-system, Arial, sans-serif';
    let vx = tableX;
    row.cells.forEach((val, idx) => {
      const colW = model.columns[idx]?.w;
      if (colW == null) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(vx + 1, rowY, colW - 2, ROW_H);
      ctx.clip();
      ctx.fillText(val, vx + 7, rowY + 19);
      ctx.restore();
      vx += colW;
    });
  });

  const totalsY = tableY + model.rows.length * ROW_H;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(tableX, totalsY, tableW, ROW_H);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px system-ui, -apple-system, Arial, sans-serif';
  let tx = tableX;
  model.totalsCells.forEach((val, idx) => {
    const colW = model.columns[idx]?.w;
    if (colW == null) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx + 1, totalsY, colW - 2, ROW_H);
    ctx.clip();
    ctx.fillText(val, tx + 7, totalsY + 19);
    ctx.restore();
    tx += colW;
  });

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 0.5;
  const gridTop = HEADER_H + GAP;
  const gridBottom = gridTop + COL_H + (model.rows.length + 1) * ROW_H;
  for (let i = 0; i <= model.rows.length + 2; i++) {
    const ly = gridTop + (i === 0 ? 0 : i === 1 ? COL_H : COL_H + (i - 1) * ROW_H);
    ctx.beginPath();
    ctx.moveTo(tableX, ly);
    ctx.lineTo(tableX + tableW, ly);
    ctx.stroke();
  }
  let vlineX = tableX;
  model.columns.forEach((col) => {
    ctx.beginPath();
    ctx.moveTo(vlineX, gridTop);
    ctx.lineTo(vlineX, gridBottom);
    ctx.stroke();
    vlineX += col.w;
  });
  ctx.beginPath();
  ctx.moveTo(vlineX, gridTop);
  ctx.lineTo(vlineX, gridBottom);
  ctx.stroke();

  const cardX = PAD;
  const cardY = HEADER_H + GAP + tableH + GAP;
  const cardW = canvasW - PAD * 2;
  const cardH = SUMMARY_H - GAP;
  const r = 10;

  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(cardX + r, cardY);
  ctx.lineTo(cardX + cardW - r, cardY);
  ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + r, r);
  ctx.lineTo(cardX + cardW, cardY + cardH - r);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH, r);
  ctx.lineTo(cardX + r, cardY + cardH);
  ctx.arcTo(cardX, cardY + cardH, cardX, cardY + cardH - r, r);
  ctx.lineTo(cardX, cardY + r);
  ctx.arcTo(cardX, cardY, cardX + r, cardY, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px system-ui, -apple-system, Arial, sans-serif';
  ctx.fillText('Financial Summary', cardX + 16, cardY + 28);

  const { currencySymbol: symbol, totals } = model;
  const metrics = [
    { label: 'Total Price', value: `${symbol}${Math.round(totals.totalPrice).toLocaleString()}` },
    { label: 'Total Estimated Efforts', value: `${Math.round(totals.totalEfforts).toLocaleString()} h` },
    { label: totals.durationLabel, value: `${totals.duration}` },
    { label: 'Blended Hourly Rate', value: `${symbol}${totals.blendedHourlyRate.toFixed(0)}` },
    { label: 'Blended Daily Rate', value: `${symbol}${totals.blendedDailyRate.toFixed(0)}` },
  ];

  const METRICS_COLS = 3;
  const metricW = cardW / METRICS_COLS;
  metrics.forEach((m, i) => {
    const col = i % METRICS_COLS;
    const row = Math.floor(i / METRICS_COLS);
    const mx = cardX + col * metricW + 16;
    const my = cardY + 48 + row * 52;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui, -apple-system, Arial, sans-serif';
    ctx.fillText(m.label, mx, my);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px system-ui, -apple-system, Arial, sans-serif';
    ctx.fillText(m.value, mx, my + 28);
  });

  if (model.phaseBreakdown.length > 0) {
    let py = cardY + SUMMARY_METRICS_H;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px system-ui, -apple-system, Arial, sans-serif';
    ctx.fillText('Phase Breakdown', cardX + 16, py);
    py += 22;
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 10px system-ui, -apple-system, Arial, sans-serif';
    ctx.fillText('Phase', cardX + 16, py);
    ctx.fillText(`Price (${symbol})`, cardX + 220, py);
    ctx.fillText('Estimated Efforts (h)', cardX + 360, py);
    py += 18;
    model.phaseBreakdown.forEach((pt) => {
      ctx.fillStyle = '#334155';
      ctx.font = '11px system-ui, -apple-system, Arial, sans-serif';
      ctx.fillText(pt.name, cardX + 16, py);
      ctx.fillText(`${symbol}${Math.round(pt.price).toLocaleString()}`, cardX + 220, py);
      ctx.fillText(`${Math.round(pt.efforts).toLocaleString()}`, cardX + 360, py);
      py += PHASE_ROW_H;
    });
  }

  const link = document.createElement('a');
  link.download = model.filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
