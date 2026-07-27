import { useEffect, useState } from 'react';
import { KEY_HEADER } from '../lib/columns';

const VISIBLE_COUNT = 3;

function TicketCard({ ticket }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? ticket.messages : ticket.messages.slice(0, VISIBLE_COUNT);
  const remaining = ticket.messages.length - shown.length;

  return (
    <div className="ticket-card">
      <div className="ticket-card-header">
        <span className="ticket-card-ref">{ticket.loadReference}</span>
        <span className={`badge ${ticket.source === 'factor' ? 'badge-factor' : 'badge-german'}`}>
          {ticket.source === 'factor' ? 'FACTOR_' : 'DACH'}
        </span>
      </div>
      <div className="ticket-messages">
        {shown.map((m) => (
          <div key={m.ts} className={`ticket-message ${m.isRoot ? 'is-root' : ''}`}>
            <strong>{m.user}</strong>
            <span className="ticket-message-meta">{new Date(m.time).toLocaleString()}</span>
            <div>{m.text}</div>
          </div>
        ))}
        {remaining > 0 && (
          <button type="button" className="ticket-more-btn" onClick={() => setExpanded(true)}>
            Show {remaining} more
          </button>
        )}
        {expanded && ticket.messages.length > VISIBLE_COUNT && (
          <button type="button" className="ticket-more-btn" onClick={() => setExpanded(false)}>
            Show fewer
          </button>
        )}
      </div>
    </div>
  );
}

export default function SlackUpdatesTab({ lanes }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/slack-updates');
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Failed to load Slack updates');
      setTickets(data.tickets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Only lanes that are still visible in the dashboard — once a lane ages
  // out of the source sheet, its Slack updates disappear from here too.
  const visibleRefs = new Set(lanes.map((l) => l[KEY_HEADER]));
  const visibleTickets = tickets.filter((t) => visibleRefs.has(t.loadReference) && t.messages.length > 0);

  return (
    <div>
      <div className="section-header-row">
        <h2 className="section-heading">Slack Updates</h2>
        <div className="no-print">
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {error && <p style={{ color: '#b42318' }}>{error}</p>}
      {!error && loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {!error && !loading && visibleTickets.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No Slack updates for currently visible lanes yet.</p>
      )}
      {!error && !loading && visibleTickets.length > 0 && (
        <div className="ticket-list">
          {visibleTickets.map((t) => (
            <TicketCard key={`${t.source}-${t.loadReference}`} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}
