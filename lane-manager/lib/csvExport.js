import { SUMMARY_FIELDS } from './columns';
import { toDateInputValue, toTimeInputValue } from './dateUtils';

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function lanesToCSV(lanes) {
  const headers = ['Brand', ...SUMMARY_FIELDS.map((f) => f.label)];
  const lines = [headers.map(csvEscape).join(',')];

  lanes.forEach((lane) => {
    const row = [lane.source === 'factor' ? 'FACTOR_' : 'DACH'];
    SUMMARY_FIELDS.forEach((f) => {
      const raw = lane[f.header];
      let val = raw || '';
      if (f.type === 'date') val = toDateInputValue(raw) || raw || '';
      if (f.type === 'time') val = toTimeInputValue(raw) || raw || '';
      row.push(val);
    });
    lines.push(row.map(csvEscape).join(','));
  });

  return lines.join('\n');
}

export function downloadCSV(lanes, filename) {
  const csv = lanesToCSV(lanes);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
