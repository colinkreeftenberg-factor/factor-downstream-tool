import { useEffect, useState } from 'react';
import { SUMMARY_FIELDS, ALL_FIELDS_BY_HEADER, DETAIL_SECTIONS } from '../lib/columns';
import { toDateInputValue, toTimeInputValue } from '../lib/dateUtils';

const LOAD_STATUS_HEADER = 'Load Status';
const NOTES_HEADER = 'Notes, Issues Detected:';

// Same cadence as the dashboard's own auto-refresh (pages/index.js), so a
// reply shows up here on roughly the same rhythm the rest of the app
// updates on, without needing Slack to push to us.
const THREAD_POLL_MS = 3 * 60 * 1000;

function initialValueFor(field, raw) {
  if (field.type === 'date') return toDateInputValue(raw);
  if (field.type === 'time') return toTimeInputValue(raw);
  return raw || '';
}

export default function LaneDetailModal({ lane, onClose, onSaved }) {
  const editableHeaders = [
    LOAD_STATUS_HEADER,
    NOTES_HEADER,
    ...DETAIL_SECTIONS.flatMap((s) => s.headers),
  ];

  const [values, setValues] = useState(() => {
    const initial = {};
    editableHeaders.forEach((header) => {
      const field = ALL_FIELDS_BY_HEADER[header] || { type: 'text' };
      initial[header] = initialValueFor(field, lane[header]);
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState(null);

  // Thread address starts from whatever's already known for this lane
  // (attached by /api/lanes from the "Slack Threads" tab — works the same
  // for DACH lanes since that mapping never touches their source sheet).
  // Once a new request is sent we get a fresh address back immediately
  // and don't have to wait for the lane list to reload.
  const latestKnownThread = (lane._slackThreads && lane._slackThreads[0]) || null;
  const [threadAddr, setThreadAddr] = useState(() => ({
    channel: latestKnownThread?.channel || null,
    ts: latestKnownThread?.ts || null,
  }));
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(null);

  function set(header, val) {
    setValues((v) => ({ ...v, [header]: val }));
  }

  async function loadThread(addr) {
    if (!addr.channel || !addr.ts) return;
    setThreadLoading(true);
    setThreadError(null);
    try {
      const res = await fetch(`/api/lane-thread?channel=${encodeURIComponent(addr.channel)}&ts=${encodeURIComponent(addr.ts)}`);
      const data = await res.json();
      if (!res.ok) {
        const debugBits = data.channel || data.ts ? ` (channel=${data.channel}, ts=${data.ts})` : '';
        setThreadError((data.detail || data.error || `Request failed (${res.status})`) + debugBits);
      } else if (data.skipped) {
        setThreadError(data.reason);
      } else if (data.ok) {
        setThreadMessages(data.messages || []);
      }
    } catch (err) {
      setThreadError('Failed to load replies.');
    } finally {
      setThreadLoading(false);
    }
  }

  // Fetch on open, then poll on the same cadence as the dashboard's own
  // auto-refresh for as long as the popup stays open.
  useEffect(() => {
    loadThread(threadAddr);
    if (!threadAddr.channel || !threadAddr.ts) return undefined;
    const interval = setInterval(() => loadThread(threadAddr), THREAD_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadAddr.channel, threadAddr.ts]);

  async function handleRequestUpdate() {
    setNotifying(true);
    setNotifyMsg(null);
    try {
      const res = await fetch('/api/notify-lane', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loadReference: lane['Load Reference'],
          source: lane.source,
          dispatchTimeDisplay: toTimeInputValue(lane['Planned Dispatch Time']),
        }),
      });
      const data = await res.json();
      if (data.skipped) {
        setNotifyMsg(`Not configured: ${data.reason}`);
      } else {
        setNotifyMsg('Update request sent to Slack.');
        if (data.channel && data.ts) setThreadAddr({ channel: data.channel, ts: data.ts });
      }
    } catch (err) {
      setNotifyMsg('Failed to send.');
    } finally {
      setNotifying(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/lanes/${lane._rowNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const infoLine = [lane['Carrier'], lane['Destination'], lane['Collection Day'], lane['Date']]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>
          {lane['Load Reference'] || 'Lane details'}{' '}
          <span className={`badge ${lane.source === 'factor' ? 'badge-factor' : 'badge-german'}`}>
            {lane.source === 'factor' ? 'FACTOR_' : 'DACH'}
          </span>
        </h2>
        {infoLine && <p className="detail-infoline">{infoLine}</p>}

        {!lane.editable && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            DACH lanes are read-only here — they come from the WA Liste sync and would be
            overwritten on its next run. Slack update requests still work though.
          </p>
        )}

        {/* Slack widget — sits on top of the lane details, per your steer */}
        <div className="slack-widget">
          <div className="slack-widget-header">
            <span className="slack-widget-title">
              <img src="/slack-logo.png" alt="" style={{ width: 14, height: 14 }} />
              Slack updates
            </span>
            {threadAddr.channel && (
              <button type="button" className="slack-widget-refresh" onClick={() => loadThread(threadAddr)} disabled={threadLoading}>
                {threadLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>

          {threadError && <p className="slack-widget-empty">{threadError}</p>}
          {!threadError && threadAddr.channel && threadMessages.length === 0 && (
            <p className="slack-widget-empty">No replies yet.</p>
          )}
          {!threadAddr.channel && !threadError && (
            <p className="slack-widget-empty">No update requested yet for this lane.</p>
          )}
          {threadMessages.length > 0 && (
            <div className="slack-widget-messages">
              {threadMessages.map((m) => (
                <div key={m.ts} className="slack-widget-message">
                  <strong>{m.user}</strong>
                  <span className="slack-widget-message-meta">{new Date(m.time).toLocaleString()}</span>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn slack-btn"
            onClick={handleRequestUpdate}
            disabled={notifying}
            style={{ marginTop: 10 }}
          >
            <img src="/slack-logo.png" alt="" />
            {notifying ? 'Sending…' : 'Request Update'}
          </button>
          {notifyMsg && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>{notifyMsg}</p>}
        </div>

        <div className="field">
          <label>Load status</label>
          <input
            value={values[LOAD_STATUS_HEADER]}
            onChange={(e) => set(LOAD_STATUS_HEADER, e.target.value)}
            disabled={!lane.editable}
            placeholder="Fill this in as you go"
          />
        </div>

        {DETAIL_SECTIONS.map((section) => (
          <div className={`detail-section detail-section-${section.color}`} key={section.title}>
            <div className="detail-section-title">{section.title}</div>
            <div className="detail-grid">
              {section.headers.map((header) => {
                const field = ALL_FIELDS_BY_HEADER[header] || { label: header, type: 'text' };
                const inputType = field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text';
                return (
                  <div className="field" key={header}>
                    <label>{field.label}</label>
                    <input
                      type={inputType}
                      value={values[header] || ''}
                      onChange={(e) => set(header, e.target.value)}
                      disabled={!lane.editable}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="field">
          <label>Notes, issues detected</label>
          <textarea
            rows={3}
            value={values[NOTES_HEADER]}
            onChange={(e) => set(NOTES_HEADER, e.target.value)}
            disabled={!lane.editable}
          />
        </div>

        {error && <p style={{ color: '#b42318', fontSize: 13 }}>{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {lane.editable && (
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
