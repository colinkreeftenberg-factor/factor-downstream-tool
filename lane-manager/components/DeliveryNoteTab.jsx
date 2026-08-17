// Delivery note tab: pick a lane, complete the note on the page itself, print.
//
// The pop-up shows the A4 page at full size and every box on it is typed into
// directly — there's no separate form, so what's on screen is what prints.
//
// Anything typed here that has a home on the sheet (plates, actual times, ramp,
// loaded totals, driver) goes back to the lane on print, so filling in the note
// counts as filling in the lane. The rest — seal number, temperatures, yard
// counts, pallet exchange, the checklist — has no column and stays on paper.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DeliveryNoteSheet from './DeliveryNoteSheet';
import {
  applyRefrigeratedChange,
  buildNoteFromLane,
  diffForWriteBack,
  writeBackPayload,
} from '../lib/deliveryNote';
import { matchGroup } from '../lib/loadingReference';
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
  const [referenz, setReferenz] = useState({ groups: [], loaded: false, error: null });

  // The planned lanes per load reference. Loaded once — the endpoint caches for
  // five minutes anyway, and a failure here only costs the prefill.
  useEffect(() => {
    fetch('/api/loading-reference')
      .then((r) => r.json())
      .then((d) => setReferenz({ groups: d.groups || [], loaded: true, error: d.error || null }))
      .catch(() => setReferenz({ groups: [], loaded: true, error: 'Could not load the Referenz tab' }));
  }, []);

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
    const group = matchGroup(referenz.groups, lane[KEY_HEADER]);
    const built = buildNoteFromLane(lane, group);
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

  /** How many planned lanes the Referenz tab has for this reference. */
  function plannedCount(lane) {
    const group = matchGroup(referenz.groups, lane[KEY_HEADER]);
    return group ? group.rows.length : 0;
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
        Pick a lane to prefill the handover note, then complete it on the page itself before printing.
        {referenz.error ? (
          <span style={{ color: 'var(--red)' }}> Referenz tab unavailable — the freight rows start blank.</span>
        ) : null}
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
              <th>Planned lanes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleLanes.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--text-muted)' }}>
                  No lanes {scope === 'today' ? 'today' : ''} match this search.
                </td>
              </tr>
            )}
            {visibleLanes.map((lane) => {
              const planned = plannedCount(lane);
              return (
                <tr key={lane[KEY_HEADER]}>
                  <td style={{ fontWeight: 600 }}>{lane[KEY_HEADER]}</td>
                  <td>{lane['Carrier'] || '—'}</td>
                  <td>{lane['Destination'] || '—'}</td>
                  <td>{lane['Date'] || '—'}</td>
                  <td>{lane['Bay door allocation'] || '—'}</td>
                  <td style={{ color: planned ? 'var(--text)' : 'var(--text-muted)' }}>
                    {!referenz.loaded ? '…' : planned ? `${planned} from Referenz` : 'no match'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-primary" onClick={() => openNote(lane)}>
                      Delivery note
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {note && (
        <DeliveryNoteEditor
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

function DeliveryNoteEditor({ note, setNote, lane, onClose, onBeforePrint, onLaneUpdated, onSavedToLane }) {
  const [mounted, setMounted] = useState(false);
  const [saveBack, setSaveBack] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => setMounted(true), []);

  // What the note would change on the lane. DACH lanes come from the master
  // sheet and are read-only here — the WA Liste sync would overwrite anything
  // we wrote, and the row number wouldn't even point at the right sheet.
  const changes = useMemo(() => (lane?.editable ? diffForWriteBack(note, lane) : []), [note, lane]);
  const willSave = saveBack && changes.length > 0;

  const onField = useCallback(
    (key, value) => {
      // The Kühlfahrzeug toggle drags the target temperature and the cargo
      // wording with it, so it can't be a plain field write.
      if (key === 'refrigerated') return setNote((n) => applyRefrigeratedChange(n, value));
      setNote((n) => ({ ...n, [key]: value }));
    },
    [setNote]
  );

  const onFreightCell = useCallback(
    (rowIndex, key, value) => {
      setNote((n) => {
        const freight = n.freight.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row));
        return { ...n, freight };
      });
    },
    [setNote]
  );

  const onChecklist = useCallback(
    (key, value) => setNote((n) => ({ ...n, checklist: { ...n.checklist, [key]: value } })),
    [setNote]
  );

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

  const editor = (
    <div className="dn-editor-root">
      <div className="dn-editor-backdrop" onClick={onClose}>
        <div className="dn-editor" onClick={(e) => e.stopPropagation()}>
          <div className="dn-editor-bar dn-chrome">
            <div className="dn-editor-title">
              Delivery note · <b>{note.reference || lane?.[KEY_HEADER] || 'lane'}</b>
              {note.freightMatched ? (
                <span className="dn-editor-sub">
                  freight prefilled from Referenz · {note.freightMatchedKey}
                </span>
              ) : (
                <span className="dn-editor-sub">no Referenz match · blank freight rows</span>
              )}
            </div>
            <div className="dn-editor-tools">
              <button className="btn" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}>
                −
              </button>
              <span className="dn-zoom">{Math.round(zoom * 100)}%</span>
              <button className="btn" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))}>
                +
              </button>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handlePrint} disabled={saving}>
                {saving ? 'Saving…' : willSave ? 'Save & print' : 'Print / Drucken'}
              </button>
            </div>
          </div>

          <p className="dn-editor-help dn-chrome">
            Type straight into the page — every shaded box is a field, and the ja/nein boxes are
            clickable. Fields that also update the lane are outlined in gold.
          </p>

          <div className="dn-editor-scroll">
            <div className="dn-editor-zoom" style={{ '--dn-zoom': zoom }}>
              <DeliveryNoteSheet
                note={note}
                onField={onField}
                onFreightCell={onFreightCell}
                onChecklist={onChecklist}
              />
            </div>
          </div>

          <div className="dn-editor-foot dn-chrome">
            {!lane?.editable ? (
              <p className="dn-wb-empty">
                This is a DACH Logs lane — read-only here, so the note prints without touching the lane.
              </p>
            ) : changes.length === 0 ? (
              <p className="dn-wb-empty">Nothing new to save back — the note matches the lane.</p>
            ) : (
              <>
                <label className="dn-wb-toggle">
                  <input type="checkbox" checked={saveBack} onChange={(e) => setSaveBack(e.target.checked)} />
                  <span>
                    Also save {changes.length} change{changes.length === 1 ? '' : 's'} back to the lane
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
              </>
            )}
            {saveError && <p className="dn-wb-error">{saveError}</p>}
          </div>
        </div>
      </div>
    </div>
  );

  // Portalled to <body> so hiding the dashboard for printing is one CSS rule,
  // and so the thing being edited is literally the thing that prints.
  return mounted ? createPortal(editor, document.body) : null;
}
