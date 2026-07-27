import { useMemo } from 'react';
import { SUMMARY_FIELDS, SUMMARY_GROUPS } from '../lib/columns';
import {
  toDateInputValue,
  toTimeInputValue,
  isDispatchingSoon,
  isArrivalDelayed,
  isShipped,
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
  const delayed = isArrivalDelayed(lane['Date'], lane['Planned Arrival Time'], lane['Actual Arrival time']);
  const shipped = isShipped(lane['Actual Dispatch time']);
  const missingInfo = isMissingInfoSoon(lane['Date'], lane['Planned Dispatch Time'], lane['Vehicle Registration Number'], 4);
  const stale = lane.source === 'factor' && isStale(lane['Created at'], lane['Load Status'], 2);
  return { urgent, delayed, shipped, missingInfo, stale };
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

  // Maps a column header to its group color, if it belongs to one — used
  // to underline just that cell rather than adding a whole extra header
  // row. The header itself stays carbon/white throughout.
  const groupColorByHeader = {};
  SUMMARY_GROUPS.forEach((g) => {
    g.headers.forEach((h) => {
      groupColorByHeader[h] = g.color;
    });
  });

  return (
    <div className="card" style={{ overflow: 'auto', maxHeight: '65vh' }}>
      <table>
        <thead>
          <tr>
            <th>Brand</th>
            {SUMMARY_FIELDS.map((f) => {
              const groupColor = groupColorByHeader[f.header];
              return (
                <th key={f.header} style={groupColor ? { boxShadow: `inset 0 -3px 0 0 ${groupColor}` } : undefined}>
                  {f.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filtered.map((lane) => {
            const { urgent, delayed, shipped, missingInfo, stale } = computeFlags(lane);
            return (
              <tr key={`${lane.source}-${lane._rowNumber}`}>
                <td>
                  <span className={`badge ${lane.source === 'factor' ? 'badge-factor' : 'badge-german'}`}>
                    {lane.source === 'factor' ? 'FACTOR_' : 'DACH'}
                  </span>
                  {shipped && (
                    <span className="badge badge-shipped" title="Actual dispatch time recorded">
                      <img src="/shipped-truck-icon.png" alt="" /> Shipped
                    </span>
                  )}
                  {delayed && <span className="badge badge-delayed" title="Past planned arrival time with no actual arrival yet"> ⚠ delayed</span>}
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
