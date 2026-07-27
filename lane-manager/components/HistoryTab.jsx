import { useEffect, useState } from 'react';
import { KEY_HEADER } from '../lib/columns';

export default function HistoryTab({ lanes }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backlog');
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to load history');
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Only changes for lanes still visible in the dashboard — older entries
  // for lanes that have aged out of the source sheet are hidden here too.
  const visibleRefs = new Set(lanes.map((l) => l[KEY_HEADER]));
  const visibleEntries = entries.filter((e) => visibleRefs.has(e.loadReference));

  return (
    <div>
      <div className="section-header-row">
        <h2 className="section-heading">History</h2>
        <div className="no-print">
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {error && <p style={{ color: '#b42318' }}>{error}</p>}
      {!error && loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {!error && !loading && visibleEntries.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No history for currently visible lanes yet.</p>
      )}
      {!error && !loading && visibleEntries.length > 0 && (
        <div className="card" style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <table className="history-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Load reference</th>
                <th>Brand</th>
                <th>Type</th>
                <th>Field</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((e, i) => (
                <tr key={`${e.loadReference}-${e.timestamp}-${i}`}>
                  <td>{new Date(e.timestamp).toLocaleString()}</td>
                  <td>{e.loadReference}</td>
                  <td>
                    <span className={`badge ${e.source === 'factor' ? 'badge-factor' : 'badge-german'}`}>
                      {e.source === 'factor' ? 'FACTOR_' : 'DACH'}
                    </span>
                  </td>
                  <td>{e.type}</td>
                  <td>{e.field}</td>
                  <td>
                    {e.oldValue && <span className="history-value-old">{e.oldValue}</span>}
                    {e.newValue && <span className="history-value-new">{e.newValue}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
