import { useState } from 'react';
import { SUMMARY_FIELDS, ALL_FIELDS_BY_HEADER, DETAIL_SECTIONS } from '../lib/columns';
import { toDateInputValue, toTimeInputValue } from '../lib/dateUtils';

const LOAD_STATUS_HEADER = 'Load Status';
const NOTES_HEADER = 'Notes, Issues Detected:';

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

  function set(header, val) {
    setValues((v) => ({ ...v, [header]: val }));
  }

  async function handleRequestUpdate() {
    setNotifying(true);
    setNotifyMsg(null);
    try {
      const res = await fetch('/api/notify-lane', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadReference: lane['Load Reference'] }),
      });
      const data = await res.json();
      setNotifyMsg(data.skipped ? `Not configured: ${data.reason}` : 'Update request sent to Slack.');
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
            overwritten on its next run.
          </p>
        )}

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
        {notifyMsg && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{notifyMsg}</p>}

        <div className="modal-actions">
          {lane.editable && (
            <button type="button" className="btn" onClick={handleRequestUpdate} disabled={notifying} style={{ marginRight: 'auto' }}>
              {notifying ? 'Sending…' : 'Request Slack update'}
            </button>
          )}
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
