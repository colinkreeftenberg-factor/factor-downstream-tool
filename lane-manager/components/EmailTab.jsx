import { useEffect, useMemo, useState } from 'react';
import { DAYS_OF_WEEK, generateWeekOptions, toTimeInputValue } from '../lib/dateUtils';
import { KEY_HEADER } from '../lib/columns';

function buildSubject(factorTeam, week) {
  const teamPart = factorTeam ? `Factor ${factorTeam}` : 'Factor';
  const weekPart = week ? ` - Transport Request W${week}` : ' - Transport Request';
  return `${teamPart}${weekPart}`;
}

function buildBody({ factorTeam, destination, collDay, collTime, numTrailers, loadRef }) {
  const teamLine = factorTeam ? `${factorTeam}-team` : 'team';
  return `Hi ${teamLine},

I would like to request a transport from Verden DC going to ${destination || '[destination]'}. Pick up details:

📍 Location: Verden DC
📅 Collection day: ${collDay || '[collection day]'}
⏰ Collection time: ${collTime || '[collection time]'}
🚛 Number of trailers: ${numTrailers || '[number of trailers]'}
🔖 Loading Reference: ${loadRef || '[load reference]'}

Please let us know when confirmed — please always click 'reply-all' to streamline communications.

Best,`;
}

export default function EmailTab({ lanes }) {
  const weekOptions = useMemo(() => generateWeekOptions(), []);
  const [carriers, setCarriers] = useState([]);
  const [selectedLaneRef, setSelectedLaneRef] = useState('');

  const [to, setTo] = useState('');
  const [factorTeam, setFactorTeam] = useState('');
  const [week, setWeek] = useState('');
  const [destination, setDestination] = useState('');
  const [loadRef, setLoadRef] = useState('');
  const [collDay, setCollDay] = useState('');
  const [collTime, setCollTime] = useState('');
  const [numTrailers, setNumTrailers] = useState('');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(null);
  const [lookingUpEmail, setLookingUpEmail] = useState(false);

  useEffect(() => {
    fetch('/api/carriers')
      .then((r) => r.json())
      .then((d) => setCarriers(d.carriers || []))
      .catch(() => setCarriers([]));
  }, []);

  function prefillFromLane(ref) {
    setSelectedLaneRef(ref);
    if (!ref) return;
    const lane = lanes.find((l) => l[KEY_HEADER] === ref);
    if (!lane) return;
    setDestination(lane['Destination'] || '');
    setLoadRef(lane['Load Reference'] || '');
    setCollDay(lane['Collection Day'] || '');
    setCollTime(toTimeInputValue(lane['Planned Dispatch Time']) || '');
    if (lane['Week']) setWeek(String(lane['Week']));
    if (lane['Carrier']) lookUpCarrierEmail(lane['Carrier']);
  }

  async function lookUpCarrierEmail(carrierName) {
    if (!carrierName) return;
    setLookingUpEmail(true);
    try {
      const res = await fetch('/api/carrier-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: carrierName }),
      });
      const data = await res.json();
      if (data.email) setTo(data.email);
      else setStatus(`No email on file for ${carrierName} — add one to the "links" tab, column H.`);
    } catch {
      // Non-critical — the person can still type the address manually.
    } finally {
      setLookingUpEmail(false);
    }
  }

  function handleGeneratePreview() {
    setSubject(buildSubject(factorTeam, week));
    setBody(buildBody({ factorTeam, destination, collDay, collTime, numTrailers, loadRef }));
    setStatus(null);
  }

  async function handleOpenInGmail() {
    if (!to.trim()) {
      setStatus('Add a recipient email first.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setStatus('Generate the preview first (or write your own subject/body below).');
      return;
    }
    try {
      await fetch('/api/transport-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, loadReference: loadRef, subject }),
      });
    } catch {
      // Logging failure shouldn't block opening the draft.
    }
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
    setStatus(`Opened a draft to ${to} in Gmail — review and hit send there.`);
  }

  const mailtoHref = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div>
      <div className="section-header-row">
        <h2 className="section-heading">Email — Transport Request</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -6 }}>
        Fills in a transport request, then opens it as a prefilled draft in your own Gmail — you
        review and hit send yourself. Plain text only (Gmail's compose link can't carry the
        colored table from the old sheet version, just the same information as a plain list).
      </p>

      <div className="card" style={{ padding: 20, maxWidth: 640 }}>
        <div className="field">
          <label>Prefill from an existing lane (optional)</label>
          <select value={selectedLaneRef} onChange={(e) => prefillFromLane(e.target.value)}>
            <option value="">— choose a lane —</option>
            {lanes.map((l) => (
              <option key={`${l.source}-${l._rowNumber}`} value={l[KEY_HEADER]}>
                {l[KEY_HEADER]} ({l['Carrier'] || 'no carrier'} → {l['Destination'] || '?'})
              </option>
            ))}
          </select>
        </div>

        <div className="detail-grid">
          <div className="field">
            <label>To (carrier email)</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="carrier@example.com" />
          </div>
          <div className="field">
            <label>Or pick a carrier to look up their email</label>
            <select defaultValue="" onChange={(e) => e.target.value && lookUpCarrierEmail(e.target.value)}>
              <option value="">— choose a carrier —</option>
              {carriers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {lookingUpEmail && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Looking up email…</p>}

        <div className="detail-grid">
          <div className="field">
            <label>Factor team (e.g. SE, DE, NL)</label>
            <input value={factorTeam} onChange={(e) => setFactorTeam(e.target.value)} />
          </div>
          <div className="field">
            <label>Week</label>
            <select value={week} onChange={(e) => setWeek(e.target.value)}>
              <option value="">—</option>
              {weekOptions.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Destination</label>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>

        <div className="field">
          <label>Loading reference</label>
          <input value={loadRef} onChange={(e) => setLoadRef(e.target.value)} />
        </div>

        <div className="detail-grid">
          <div className="field">
            <label>Collection day</label>
            <select value={collDay} onChange={(e) => setCollDay(e.target.value)}>
              <option value="">—</option>
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Collection time</label>
            <input type="time" value={collTime} onChange={(e) => setCollTime(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Number of trailers</label>
          <input type="number" min="1" value={numTrailers} onChange={(e) => setNumTrailers(e.target.value)} style={{ maxWidth: 120 }} />
        </div>

        <button type="button" className="btn" onClick={handleGeneratePreview}>
          Generate preview
        </button>

        {(subject || body) && (
          <>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Subject (editable)</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="field">
              <label>Body (editable)</label>
              <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </>
        )}

        {status && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{status}</p>}

        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn btn-primary" onClick={handleOpenInGmail} disabled={!subject || !body}>
            Open in Gmail
          </button>
          {to && subject && body && (
            <a href={mailtoHref} className="lane-link" style={{ alignSelf: 'center', fontSize: 12 }}>
              Not on Gmail? Use your default mail app
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
