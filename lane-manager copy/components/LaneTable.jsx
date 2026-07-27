import { useMemo } from 'react';
import { SUMMARY_FIELDS } from '../lib/columns';
import {
  toDateInputValue,
  toTimeInputValue,
  isDispatchingSoon,
  isDispatchDelayed,
  isMissingInfoSoon,
  isStale,
  parseFlexibleDate,
} from '../lib/dateUtils';
import { carrierColorClass } from '../lib/carrierColors';

function displayValue(lane, field) {
  const raw = lane[field.header];
  if (!raw) return '';
  if (field.type === 'date') return toDateInputValue(raw) || raw;
  if (field.type === 'time') return toTimeInputValue(raw) || raw;
  return raw;
}

export function computeFlags(lane) {
  const urgent = isDispatchingSoon(lane['Date'], lane['Actual Dispatch time'] || lane['Planned Dispatch Time'], 3);
  const delayed = isDispatchDelayed(lane['Date'], lane['Planned Dispatch Time'], lane['Actual Dispatch time']);
  const missingInfo = isMissingInfoSoon(lane['Date'], lane['Planned Dispatch Time'], lane['Vehicle Registration Number'], 4);
  const stale = lane.source === 'factor' && isStale(lane['Created at'], lane['Load Status'], 2);
  return { urgent, delayed, missingInfo, stale };
}

export default function LaneTable({ lanes, onQuickEdit, onOpenDetail, globalSearch = '', sortByDate = false }) {
  const filtered = useMemo(() => {
    const search = globalSearch.trim().toLowerCase();
    let result = lanes;
    if (search) {
      result = result.filter((lane) => {
        const haystack = SUMMARY_FIELDS.map((f) => String(lane[f.header] || '')).join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }
    if (sortByDate) {
      result = [...result].sort((a, b) => {
        const da = parseFlexibleDate(a['Date']);
        const db = parseFlexibleDate(b['Date']);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      });
    }
    return result;
  }, [lanes, globalSearch, sortByDate]);

  if (lanes.length === 0) {
    return <p style={{ color: 'var(--text-muted)', padding: 20 }}>No lanes here yet.</p>;
  }

  return (
    <div className="card" style={{ overflow: 'auto', maxHeight: '65vh' }}>
      <table>
        <thead>
          <tr>
            <th>Brand</th>
            {SUMMARY_FIELDS.map((f) => (
              <th key={f.header}>{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((lane) => {
            const { urgent, delayed, missingInfo, stale } = computeFlags(lane);
            return (
              <tr key={`${lane.source}-${lane._rowNumber}`}>
                <td>
                  <span className={`badge ${lane.source === 'factor' ? 'badge-factor' : 'badge-german'}`}>
                    {lane.source === 'factor' ? 'FACTOR_' : 'DACH'}
                  </span>
                  {delayed && <span className="badge badge-delayed" title="Actual dispatch differs from planned"> ⚠ delayed</span>}
                  {urgent && <span className="badge badge-soon" title="Dispatching within 3 hours"> ⏱ soon</span>}
                  {missingInfo && <span className="badge badge-missing" title="Missing vehicle reg, dispatch within 4h"> missing info</span>}
                  {stale && <span className="badge badge-stale" title="Created a while ago, no status update"> stale</span>}
                </td>
                {SUMMARY_FIELDS.map((f) => {
                  const isKey = f.header === 'Load Reference';
                  const isCourier = f.header === 'Carrier';
                  const value = displayValue(lane, f);

                  if (isKey) {
                    return (
                      <td key={f.header}>
                        <a className="lane-link" onClick={() => onOpenDetail(lane)}>
                          {value || '(open)'}
                        </a>
                      </td>
                    );
                  }

                  if (isCourier) {
                    return (
                      <td
                        key={f.header}
                        className={lane.editable ? 'edit-cell' : ''}
                        onClick={() => lane.editable && onQuickEdit(lane, f, value)}
                        title={lane.editable ? 'Click to edit' : ''}
                      >
                        {value ? (
                          <span className={`carrier-badge carrier-badge-${carrierColorClass(value)}`}>{value}</span>
                        ) : (
                          ''
                        )}
                      </td>
                    );
                  }

                  return (
                    <td
                      key={f.header}
                      className={lane.editable ? 'edit-cell' : ''}
                      onClick={() => lane.editable && onQuickEdit(lane, f, value)}
                      title={lane.editable ? 'Click to edit' : ''}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
