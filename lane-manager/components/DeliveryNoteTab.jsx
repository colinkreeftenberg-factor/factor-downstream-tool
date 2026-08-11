// Übergabeschein tab: pick a lane, check/complete the fields in the pop-up,
// print an A4 handover note for the transporter.
//
// Anything typed here that has a home on the sheet (plates, actual times, ramp,
// counts, driver) goes back to the lane on print, so filling in the note counts
// as filling in the lane. The rest of the form — seal number, temperatures, yard
// counts, pallet exchange, the checklist — has no column and stays on paper.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DeliveryNoteSheet from './DeliveryNoteSheet';
import {
  applyRefrigeratedChange,
  buildNoteFromLane,
  CHECKLIST,
  diffForWriteBack,
  WRITE_BACK_NOTE_KEYS,
  writeBackPayload,
  YARD_COLUMNS,
} from '../lib/deliveryNote';
import { isToday } from '../lib/dateUtils';
import { KEY_HEADER } from '../lib/columns';

// The two names are the same person for a whole shift, so remember whoever
// was typed last instead of asking again for every single lane.
const PREPARED_BY_KEY = 'laneManagerNotePreparedBy';
const HANDED_OVER_BY_KEY = 'laneManagerNoteHandedOverBy';

/**
 * Hides the dashboard, prints just the note, then puts everything back. The
 * @page rule is injected only for the duration of this print so the existing
 * "Print daily sheet" button keeps its own margins.
 */
function printNote() {
  const style = document.createElement('style');
  style.textContent = '@page { size: A4 portrait; margin: 8mm 9mm; }';
  document.head.appendChild(style);
  document.body.classList.add('dn-printing');

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.body.classList.remove('dn-printing');
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Safari doesn't always fire afterprint — don't leave the page hidden.
  setTimeout(cleanup, 60000);

  window.print();
}

export default function DeliveryNoteTab({ lanes, onLaneUpdated }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('today'); // 'today' | 'all'
  const [note, setNote] = useState(null);
  const [noteLane, setNoteLane] = useState(null);

  const visibleLanes = useMemo(() => {
    const base = scope === 'today' ? lanes.filter((l) => isToday(l['Date'])) : lanes;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((l) => {
      const hay = `${l[KEY_HEADER] || ''} ${l['Carrier'] || ''} ${l['Destination'] || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lanes, scope, query]);

  function openNote(lane) {
    const built = buildNoteFromLane(lane);
    setNote({
      ...built,
      preparedBy: window.localStorage.getItem(PREPARED_BY_KEY) || '',
      handedOverBy: window.localStorage.getItem(HANDED_OVER_BY_KEY) || '',
    });
    setNoteLane(lane);
  }

  function closeNote() {
    setNote(null);
    setNoteLane(null);
  }

  function rememberNames(n) {
    if (n.preparedBy) window.localStorage.setItem(PREPARED_BY_KEY, n.preparedBy);
    if (n.handedOverBy) window.localStorage.setItem(HANDED_OVER_BY_KEY, n.handedOverBy);
  }

  return (
    <>
      <div className="section-header-row no-print">
        <h2 className="section-heading">Delivery notes · Übergabescheine</h2>
        <div>
          <input
            className="search-box"
            placeholder="Search reference, courier, destination…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={`tab-btn ${scope === 'today' ? 'tab-btn-active' : ''}`} onClick={() => setScope('today')}>
            Today
          </button>
          <button className={`tab-btn ${scope === 'all' ? 'tab-btn-active' : ''}`} onClick={() => setScope('all')}>
            All lanes
          </button>
        </div>
      </div>

      <p className="notify-result no-print" style={{ marginTop: 0 }}>
        Pick a lane to prefill the handover note. Everything stays editable in the pop-up before it prints.
      </p>

      <div className="card no-print" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Load reference</th>
              <th>Courier</th>
              <th>Destination</th>
              <th>Date</th>
              <th>Ramp</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleLanes.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-muted)' }}>
                  No lanes {scope === 'today' ? 'today' : ''} match this search.
                </td>
              </tr>
            )}
            {visibleLanes.map((lane) => (
              <tr key={lane[KEY_HEADER]}>
                <td style={{ fontWeight: 600 }}>{lane[KEY_HEADER]}</td>
                <td>{lane['Carrier'] || '—'}</td>
                <td>{lane['Destination'] || '—'}</td>
                <td>{lane['Date'] || '—'}</td>
                <td>{lane['Bay door allocation'] || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-primary" onClick={() => openNote(lane)}>
                    Übergabeschein
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {note && (
        <DeliveryNoteModal
          note={note}
          setNote={setNote}
          lane={noteLane}
          onClose={closeNote}
          onBeforePrint={rememberNames}
          onLaneUpdated={onLaneUpdated}
          onSavedToLane={(written) => setNoteLane((prev) => ({ ...prev, ...written }))}
        />
      )}
    </>
  );
}

/** Marks an input whose value goes back to the lane, not just onto the paper. */
function LaneBadge() {
  return (
    <span className="dn-wb-badge" title="Saved back to the lane when you print">
      ↩ lane
    </span>
  );
}

/** One labelled text input bound to a key on the note. */
function NoteField({ note, setNote, name, label, hint, disabled, placeholder }) {
  return (
    <div className="field">
      <label>
        {label}
        {WRITE_BACK_NOTE_KEYS.has(name) ? <LaneBadge /> : null}
        {hint ? <span className="dn-hint"> {hint}</span> : null}
      </label>
      <input
        value={note[name] || ''}
        disabled={disabled}
        placeholder={placeholder || ''}
        onChange={(e) => setNote((n) => ({ ...n, [name]: e.target.value }))}
      />
    </div>
  );
}

function DeliveryNoteModal({ note, setNote, lane, onClose, onBeforePrint, onLaneUpdated, onSavedToLane }) {
  const [mounted, setMounted] = useState(false);
  const [saveBack, setSaveBack] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  useEffect(() => setMounted(true), []);

  // What the pop-up would change on the lane. DACH lanes come from the master
  // sheet and are read-only here — the WA Liste sync would overwrite anything
  // we wrote, and the row number wouldn't even point at the right sheet.
  const changes = useMemo(() => (lane?.editable ? diffForWriteBack(note, lane) : []), [note, lane]);
  const willSave = saveBack && changes.length > 0;

  async function handlePrint() {
    onBeforePrint(note);
    setSaveError(null);

    if (willSave) {
      setSaving(true);
      const payload = writeBackPayload(changes);
      try {
        const res = await fetch(`/api/lanes/${lane._rowNumber}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to update the lane');
        // Fold the written values into this lane snapshot so reprinting doesn't
        // offer the same changes a second time, then refresh the dashboard.
        if (onSavedToLane) onSavedToLane(payload);
        if (onLaneUpdated) onLaneUpdated();
      } catch (err) {
        // The driver is waiting at the ramp, so print anyway and be loud about
        // the lane not having been updated.
        setSaveError(`${err.message} — the note printed, but the lane was not updated.`);
      } finally {
        setSaving(false);
      }
    }

    printNote();
  }

  function setFreight(key, value) {
    setNote((n) => {
      const freight = [...n.freight];
      freight[0] = { ...freight[0], [key]: value };
      // The yard row and the freight row describe the same load, so keep the
      // load name in step rather than making it two fields to remember.
      const yard = key === 'load' ? [{ ...n.yard[0], load: value }] : n.yard;
      return { ...n, freight, yard };
    });
  }

  function setYard(key, value) {
    setNote((n) => {
      const yard = [...n.yard];
      yard[0] = { ...yard[0], [key]: value };
      return { ...n, yard };
    });
  }

  const ambient = note.refrigerated === 'nein';

  return (
    <>
      <div className="modal-backdrop no-print" onClick={onClose}>
        <div className="modal modal-note" onClick={(e) => e.stopPropagation()}>
          <div className="modal-note-form">
            <h2>
              Übergabeschein · {note.reference || lane?.[KEY_HEADER] || 'lane'}
            </h2>
            <p className="dn-hint" style={{ marginTop: -8 }}>
              Prefilled from the lane. Blank fields print as empty boxes to fill in by hand.
            </p>

            <fieldset className="dn-fs">
              <legend>Adressen &amp; Informationen</legend>
              <div className="dn-fs-grid">
                <NoteField note={note} setNote={setNote} name="reference" label="Referenz / Reference" hint="· print only" />
                <NoteField note={note} setNote={setNote} name="forwarder" label="LKW Spedition / Forwarder" />
                <NoteField note={note} setNote={setNote} name="destination1" label="1. Entladestelle / 1st delivery address" />
                <NoteField note={note} setNote={setNote} name="destination2" label="2. Entladestelle / 2nd delivery address" />
                <NoteField note={note} setNote={setNote} name="loadingDate" label="Verladedatum / Loading date" placeholder="TT.MM.JJJJ" />
                <NoteField note={note} setNote={setNote} name="arrivalTime" label="Ankunftszeit / Time of arrival" placeholder="HH:MM" />
                <NoteField note={note} setNote={setNote} name="departureTime" label="Tatsächliche Abfahrtszeit / Actual departure" placeholder="HH:MM" />
              </div>
            </fieldset>

            <fieldset className="dn-fs">
              <legend>Temperatur &amp; Kühlung</legend>
              <div className="dn-fs-grid">
                <div className="field">
                  <label>1. Kühlfahrzeug / Refrigerated trailer</label>
                  <select
                    value={note.refrigerated}
                    onChange={(e) => setNote((n) => applyRefrigeratedChange(n, e.target.value))}
                  >
                    <option value="ja">ja / yes</option>
                    <option value="nein">nein / no</option>
                  </select>
                </div>
                <NoteField
                  note={note}
                  setNote={setNote}
                  name="tempTarget"
                  label="Temp. Laderaum SOLL / target"
                  hint={ambient ? '· ambient' : ''}
                />
                <NoteField note={note} setNote={setNote} name="tempActual" label="Temp. Laderaum IST / actual" placeholder="z. B. 2 °C" />
                <NoteField
                  note={note}
                  setNote={setNote}
                  name="goodsDe"
                  label="Ladegut / Goods (DE)"
                  disabled={!ambient}
                  hint={ambient ? '· editable' : '· fixed for reefers'}
                />
                <NoteField
                  note={note}
                  setNote={setNote}
                  name="goodsEn"
                  label="Ladegut / Goods (EN)"
                  disabled={!ambient}
                  placeholder={ambient ? 'optional English translation' : ''}
                />
              </div>
            </fieldset>

            <fieldset className="dn-fs">
              <legend>Kennzeichen &amp; Zahlen</legend>
              <div className="dn-fs-grid">
                <NoteField note={note} setNote={setNote} name="truckPlate" label="Kennzeichen LKW / Truck plate" />
                <NoteField note={note} setNote={setNote} name="trailerPlate" label="Kennzeichen Trailer / Trailer plate" />
                <NoteField note={note} setNote={setNote} name="ramp" label="Rampe / Ramp" />
                <NoteField note={note} setNote={setNote} name="seal" label="Nr. Plombe / Seal no." />
              </div>
            </fieldset>

            <fieldset className="dn-fs">
              <legend>Ladung &amp; Entladestelle</legend>
              <div className="dn-fs-grid">
                <div className="field">
                  <label>Ladung / Load</label>
                  <input value={note.freight[0].load || ''} onChange={(e) => setFreight('load', e.target.value)} />
                </div>
                <div className="field">
                  <label>
                    Boxen / Boxes
                    <LaneBadge />
                  </label>
                  <input value={note.freight[0].boxes || ''} onChange={(e) => setFreight('boxes', e.target.value)} />
                </div>
                <div className="field">
                  <label>
                    Palettenzahl / Pallets
                    <LaneBadge />
                  </label>
                  <input value={note.freight[0].pallets || ''} onChange={(e) => setFreight('pallets', e.target.value)} />
                </div>
                <div className="field">
                  <label>Gewicht / Weight (kg)</label>
                  <input value={note.freight[0].weight || ''} onChange={(e) => setFreight('weight', e.target.value)} />
                </div>
                <div className="field dn-fs-wide">
                  <label>Inhalt / Contents</label>
                  <input value={note.freight[0].contents || ''} onChange={(e) => setFreight('contents', e.target.value)} />
                </div>
              </div>
            </fieldset>

            <fieldset className="dn-fs">
              <legend>
                Yard Check Out <span className="dn-hint">· usually left blank and filled in at the yard</span>
              </legend>
              <div className="dn-fs-grid dn-fs-grid-3">
                {YARD_COLUMNS.map((c) => (
                  <div className="field" key={c.key}>
                    <label>{c.en ? `${c.de} / ${c.en}` : c.de}</label>
                    <input value={note.yard[0][c.key] || ''} onChange={(e) => setYard(c.key, e.target.value)} />
                  </div>
                ))}
              </div>
            </fieldset>

            <fieldset className="dn-fs">
              <legend>Paletten Umschlag Produktion</legend>
              <div className="dn-fs-grid">
                <NoteField note={note} setNote={setNote} name="palletsReceived" label="Erhalten / Received" />
                <NoteField note={note} setNote={setNote} name="palletsIssued" label="Ausgegeben / Issued" />
                <NoteField note={note} setNote={setNote} name="palletsTotalEuro" label="Gesamt Europaletten / Total euro pallets" />
                <NoteField note={note} setNote={setNote} name="palletsDamaged" label="Davon defekt / Of which damaged" />
              </div>
            </fieldset>

            <fieldset className="dn-fs">
              <legend>
                Checkliste <span className="dn-hint">· leave blank to tick by hand during loading</span>
              </legend>
              {CHECKLIST.map((item, i) => (
                <div className="dn-chk-row" key={item.key}>
                  <span className="dn-chk-num">{i + 1}</span>
                  <span className="dn-chk-text">{item.de}</span>
                  <select
                    value={note.checklist[item.key] || ''}
                    onChange={(e) =>
                      setNote((n) => ({ ...n, checklist: { ...n.checklist, [item.key]: e.target.value } }))
                    }
                  >
                    <option value="">— blank —</option>
                    <option value="ja">ja / yes</option>
                    <option value="nein">nein / no</option>
                  </select>
                </div>
              ))}
            </fieldset>

            <fieldset className="dn-fs">
              <legend>Verladung &amp; Unterschriften</legend>
              <div className="dn-fs-grid">
                <NoteField note={note} setNote={setNote} name="loadedBy" label="Verladung durchgeführt / Loading by" />
                <NoteField note={note} setNote={setNote} name="preparedBy" label="Papiere erstellt / Prepared by" />
                <NoteField note={note} setNote={setNote} name="handedOverBy" label="Papiere übergeben / Handed over by" />
                <NoteField note={note} setNote={setNote} name="driverName" label="Fahrer / Truck driver" />
              </div>
            </fieldset>

            <div className="dn-wb">
              {!lane?.editable ? (
                <p className="dn-wb-empty">
                  This is a DACH Logs lane — read-only here, so the note prints without touching the
                  lane.
                </p>
              ) : changes.length === 0 ? (
                <p className="dn-wb-empty">
                  Nothing new to save back — the note matches the lane. Fields marked{' '}
                  <span className="dn-wb-badge">↩ lane</span> update the lane when you change them.
                </p>
              ) : (
                <>
                  <label className="dn-wb-toggle">
                    <input
                      type="checkbox"
                      checked={saveBack}
                      onChange={(e) => setSaveBack(e.target.checked)}
                    />
                    <span>
                      Also save {changes.length} change{changes.length === 1 ? '' : 's'} back to the
                      lane
                    </span>
                  </label>
                  <ul className="dn-wb-list">
                    {changes.map((c) => (
                      <li key={c.header}>
                        <span className="dn-wb-field">{c.label}</span>
                        <span className="dn-wb-from">{c.from || 'empty'}</span>
                        <span className="dn-wb-arrow">→</span>
                        <span className="dn-wb-to">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="dn-wb-note">
                    Cleared fields are never written — an empty box here won't wipe a value on the
                    sheet.
                  </p>
                </>
              )}
            </div>

            {saveError && <p className="dn-wb-error">{saveError}</p>}

            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handlePrint} disabled={saving}>
                {saving ? 'Saving…' : willSave ? 'Save & print' : 'Print / Drucken'}
              </button>
            </div>
          </div>

          <div className="modal-note-preview">
            <div className="dn-preview-label">Preview · A4</div>
            <div className="dn-preview-clip">
              <div className="dn-preview-scale">
                <DeliveryNoteSheet note={note} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The only copy that actually goes to the printer. Portalled to <body>
          so hiding the dashboard for printing is a single CSS rule. */}
      {mounted &&
        createPortal(
          <div className="dn-print-root">
            <DeliveryNoteSheet note={note} />
          </div>,
          document.body
        )}
    </>
  );
}
