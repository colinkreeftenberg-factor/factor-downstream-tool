import { useEffect, useMemo, useState } from 'react';
import { DAYS_OF_WEEK, generateWeekOptions, toTimeInputValue } from '../lib/dateUtils';
import { KEY_HEADER } from '../lib/columns';

function buildSubject(receivingName, week, loadRef) {
  const namePart = receivingName ? `Factor ${receivingName}` : 'Factor';
  const weekPart = week ? ` - Transport Request W${week}` : ' - Transport Request';
  const refPart = ` - ${loadRef || '[load reference]'}`;
  return `${namePart}${weekPart}${refPart}`;
}

function buildBody({ receivingName, destination, collDay, collTime, numTrailers, loadRef }) {
  const greetingName = receivingName ? `${receivingName} team` : 'team';
  return `Hi ${greetingName},

I would like to request a transport from Verden DC going to ${destination || '[destination]'}. Pick up details:

📍 Location:\tVerden DC
📅 Collection day:\t${collDay || '[collection day]'}
⏰ Collection time:\t${collTime || '[collection time]'}
🚛 Number of trailers:\t${numTrailers || '[number of trailers]'}
🔖 Loading Reference:\t${loadRef || '[load reference]'}

Please let us know when confirmed — please always click 'reply-all' to streamline communications.

Best,`;
}

export default function EmailTab({ lanes }) {
  const weekOptions = useMemo(() => generateWeekOptions(), []);
  const [carriers, setCarriers] = useState([]);

  const [laneQuery, setLaneQuery] = useState('');
  const [laneOpen, setLaneOpen] = useState(false);

  const [to, setTo] = useState('');
  const [receivingName, setReceivingName] = useState('');
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

  const filteredLanes = useMemo(() => {
    const q = laneQuery.trim().toLowerCase();
    if (!q) return lanes.slice(0, 20);
    return lanes
      .filter((l) => {
        const hay = `${l[KEY_HEADER] || ''} ${l['Carrier'] || ''} ${l['Destination'] || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [lanes, laneQuery]);

  function laneLabel(l) {
    return `${l[KEY_HEADER]} — ${l['Carrier'] || 'no carrier'} → ${l['Destination'] || '?'}`;
  }

  function prefillFromLane(lane) {
    setLaneQuery(laneLabel(lane));
    setLaneOpen(false);
    setDestination(lane['Destination'] || '');
    setLoadRef(lane['Load Reference'] || '');
    setCollDay(lane['Collection Day'] || '');
    setCollTime(toTimeInputValue(lane['Planned Dispatch Time']) || '');
    if (lane['Week']) setWeek(String(lane['Week']));
    if (lane['Carrier']) lookUpCarrierEmail(lane['Carrier']);
  }

  async function lookUpCarrierEmail(carrierName) {
    if (!carrierName) return;
    setReceivingName(carrierName);
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
    setSubject(buildSubject(receivingName, week, loadRef));
    setBody(buildBody({ receivingName, destination, collDay, collTime, numTrailers, loadRef }));
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
        review and hit send yourself.
      </p>

      <div className="card" style={{ padding: 20, maxWidth: 640 }}>
        {/* Group: prefill from lane (searchable) or pick a carrier */}
        <div className="email-group email-group-a">
          <div className="combobox-wrap field">
            <label>Prefill from an existing lane</label>
            <input
              value={laneQuery}
              onChange={(e) => { setLaneQuery(e.target.value); setLaneOpen(true); }}
              onFocus={() => setLaneOpen(true)}
              placeholder="Search load reference, carrier, or destination…"
            />
            {laneOpen && filteredLanes.length > 0 && (
              <div className="combobox-list">
                {filteredLanes.map((l) => (
                  <div
                    key={`${l.source}-${l._rowNumber}`}
                    className="combobox-item"
                    onMouseDown={(e) => { e.preventDefault(); prefillFromLane(l); }}
                  >
                    {laneLabel(l)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>…or pick a carrier</label>
            <select defaultValue="" onChange={(e) => e.target.value && lookUpCarrierEmail(e.target.value)}>
              <option value="">— choose a carrier —</option>
              {carriers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>To (carrier email)</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="carrier@example.com" />
        </div>
        {lookingUpEmail && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8 }}>Looking up email…</p>}

        <div className="field">
          <label>Receiving name</label>
          <input value={receivingName} onChange={(e) => setReceivingName(e.target.value)} placeholder="Autofills from the carrier picked above" />
        </div>

        <div className="field">
          <label>Loading reference</label>
          <input value={loadRef} onChange={(e) => setLoadRef(e.target.value)} />
        </div>

        {/* Group: week + destination */}
        <div className="email-group email-group-b">
          <div className="detail-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Week</label>
              <select value={week} onChange={(e) => setWeek(e.target.value)}>
                <option value="">—</option>
                {weekOptions.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Destination</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Group: collection day + time + number of trailers */}
        <div className="email-group email-group-a">
          <div className="detail-grid-3">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Collection day</label>
              <select value={collDay} onChange={(e) => setCollDay(e.target.value)}>
                <option value="">—</option>
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Collection time</label>
              <input type="time" value={collTime} onChange={(e) => setCollTime(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Number of trailers</label>
              <input type="number" min="1" value={numTrailers} onChange={(e) => setNumTrailers(e.target.value)} />
            </div>
          </div>
        </div>

        <button type="button" className="btn btn-primary" onClick={handleGeneratePreview}>
          Generate preview
        </button>

        {status && !(subject || body) && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{status}</p>}

        {(subject || body) && (
          <div className="email-group email-group-b" style={{ marginTop: 16, marginBottom: 0 }}>
            <div className="field">
              <label>Subject (editable)</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Body (editable)</label>
              <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>

            {status && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{status}</p>}

            <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
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
        )}
      </div>
    </div>
  );
}
