import { useEffect, useState } from 'react';
import { generateWeekOptions, DAYS_OF_WEEK } from '../lib/dateUtils';
import { CREATE_FIELDS } from '../lib/columns';

const FIELD_TYPES = {
  'Date': 'date',
  'Planned Arrival Time': 'time',
  'Planned Dispatch Time': 'time',
};

export function CreateLaneModal({ onClose, onCreated }) {
  const [values, setValues] = useState({});
  const [carriers, setCarriers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const weekOptions = generateWeekOptions();

  useEffect(() => {
    fetch('/api/carriers')
      .then((r) => r.json())
      .then((d) => setCarriers(d.carriers || []))
      .catch(() => setCarriers([]));
  }, []);

  function set(field, val) {
    setValues((v) => ({ ...v, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/lanes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create lane');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New lane</h2>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Week</label>
            <select value={values['Week'] || ''} onChange={(e) => set('Week', e.target.value)} required>
              <option value="" disabled>Select week…</option>
              {weekOptions.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Collection Day</label>
            <select value={values['Collection Day'] || ''} onChange={(e) => set('Collection Day', e.target.value)} required>
              <option value="" disabled>Select day…</option>
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Courier</label>
            <select value={values['Carrier'] || ''} onChange={(e) => set('Carrier', e.target.value)} required>
              <option value="" disabled>Select courier…</option>
              {carriers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {carriers.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                No couriers loaded — check the "links" tab / LINKS_SHEET_ID setting.
              </span>
            )}
          </div>

          {CREATE_FIELDS.filter((f) => !['Collection Day', 'Carrier', 'Week'].includes(f)).map((field) => (
            <div className="field" key={field}>
              <label>{field}</label>
              <input
                type={FIELD_TYPES[field] || 'text'}
                value={values[field] || ''}
                onChange={(e) => set(field, e.target.value)}
              />
            </div>
          ))}

          {error && <p style={{ color: '#b42318', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create lane'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditCellModal({ lane, field, initialValue, onClose, onSaved }) {
  const [value, setValue] = useState(initialValue || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const inputType = field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text';

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/lanes/${lane._rowNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field.header]: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit {field.label}</h2>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{field.label}</label>
            <input type={inputType} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </div>
          {error && <p style={{ color: '#b42318', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
