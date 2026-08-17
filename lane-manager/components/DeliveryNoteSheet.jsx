// The A4 Übergabeschein. One component for both jobs: on screen it *is* the
// form (every box is typed into in place), and in print it's the paper.
//
// The trick that makes that safe: each editable box renders both a print-only
// <span> and a screen-only <input>, fed from the same value. Printing therefore
// lays out real wrapping text rather than a fixed-width input that could clip
// a long value, and the printed height can't drift from what was measured.
//
// Sizing is deliberately in mm/pt — the whole thing is tuned to land inside
// 297mm minus the 8/9mm page margin, with all ten freight rows present. If you
// add a row or a section here, re-check it still prints on one page.
//
// Colours stay Carbon + Natural with a single Saffron accent bar that carries
// no information, so a black & white printout loses nothing.

import {
  CHECKLIST,
  FREIGHT_COLUMNS,
  FREIGHT_GROUPS,
  freightTotals,
  PICKUP_ADDRESS,
  WRITE_BACK_NOTE_KEYS,
} from '../lib/deliveryNote';

/** German label with the English underneath, the compact bilingual pattern. */
function Lbl({ de, en }) {
  return (
    <span className="dn-lbl">
      <span className="dn-de">{de}</span>
      {en ? <span className="dn-en">{en}</span> : null}
    </span>
  );
}

/**
 * A value box. Read-only it's just text (or an empty well to write in by hand);
 * editable it's that same text for print plus an input for the screen.
 */
function Val({ value, onChange, className = '', placeholder, align, title, wb }) {
  const text = String(value ?? '').trim();
  const printClass = `dn-val ${text ? '' : 'dn-blank'} ${className}`;

  if (!onChange) {
    return <span className={printClass} style={align ? { textAlign: align } : undefined}>{text}</span>;
  }

  return (
    <>
      <span className={`${printClass} dn-print-only`} style={align ? { textAlign: align } : undefined}>
        {text}
      </span>
      <input
        className={`dn-input dn-screen-only ${wb ? 'dn-wb' : ''} ${className}`}
        style={align ? { textAlign: align } : undefined}
        value={value ?? ''}
        placeholder={placeholder || ''}
        title={wb ? 'Also saved back to the lane' : title || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function Box({ on, onClick, title }) {
  if (!onClick) return <span className={`dn-box ${on ? 'dn-box-on' : ''}`} />;
  return (
    <button
      type="button"
      className={`dn-box dn-box-btn ${on ? 'dn-box-on' : ''}`}
      onClick={onClick}
      title={title}
      aria-pressed={on}
    />
  );
}

/**
 * ja/nein pair. Clicking a box picks it; clicking the picked one clears back to
 * blank, which is how a checklist line gets left for someone to tick by hand.
 */
function JaNein({ value, onChange, small }) {
  const pick = (v) => (onChange ? () => onChange(value === v ? '' : v) : null);
  return (
    <>
      <span className={`dn-opt ${small ? 'dn-opt-sm' : ''}`}>
        <Box on={value === 'ja'} onClick={pick('ja')} title="ja / yes" />
        ja<span className="dn-en-b">&nbsp;/ yes</span>
      </span>
      <span className={`dn-opt ${small ? 'dn-opt-sm' : ''}`}>
        <Box on={value === 'nein'} onClick={pick('nein')} title="nein / no" />
        nein<span className="dn-en-b">&nbsp;/ no</span>
      </span>
    </>
  );
}

export default function DeliveryNoteSheet({ note, onField, onFreightCell, onChecklist }) {
  // No handlers means print/preview mode — every box renders as plain text.
  const f = (key) => (onField ? (v) => onField(key, v) : undefined);
  const totals = freightTotals(note.freight);
  const ambient = note.refrigerated === 'nein';

  /**
   * A box bound to one note field, gold-outlined if it also updates the lane.
   * Deliberately a function that returns an element rather than a component
   * declared here: a component defined inside render is a new type on every
   * keystroke, which would remount the input and drop the caret.
   */
  const field = (k, { editable = true, ...rest } = {}) => (
    <Val
      value={note[k]}
      onChange={editable ? f(k) : undefined}
      wb={WRITE_BACK_NOTE_KEYS.has(k)}
      {...rest}
    />
  );

  return (
    <div className="dn-sheet">
      {/* ---------------- header ---------------- */}
      <div className="dn-hdr">
        <div className="dn-wordmark">Factor_</div>
        <div className="dn-hdr-title">
          <h1>Übergabeschein</h1>
          <span className="dn-en">Handover&nbsp;/&nbsp;delivery note</span>
        </div>
        <div className="dn-refchip">
          <span className="dn-en">Referenz / Reference</span>
          {field('reference', { className: 'dn-ref-val', align: 'right' })}
        </div>
      </div>
      <div className="dn-accentbar" />

      {/* ---------------- 1. addresses & information ---------------- */}
      <section className="dn-sec">
        <h2>
          Adressen &amp; Informationen <span className="dn-en">Addresses &amp; information</span>
        </h2>
        <div className="dn-grid" style={{ gridTemplateColumns: '1.25fr 1fr 1fr' }}>
          <div className="dn-cell">
            <Lbl de="Ladestelle" en="Pick up address" />
            <span className="dn-val dn-addr">
              {PICKUP_ADDRESS[0]}
              <br />
              {PICKUP_ADDRESS[1]}
            </span>
          </div>
          <div className="dn-cell">
            <Lbl de="1. Entladestelle" en="1st delivery address" />
            {field('destination1', { className: 'dn-addr' })}
          </div>
          <div className="dn-cell">
            <Lbl de="2. Entladestelle" en="2nd delivery address" />
            {field('destination2', { className: 'dn-addr' })}
          </div>
        </div>
        <div className="dn-grid dn-row-last" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="dn-cell">
            <Lbl de="LKW Spedition" en="Forwarder" />
            {field('forwarder')}
          </div>
          <div className="dn-cell">
            <Lbl de="Verladedatum" en="Loading date" />
            {field('loadingDate', { placeholder: 'TT.MM.JJJJ' })}
          </div>
          <div className="dn-cell">
            <Lbl de="Ankunftszeit" en="Time of arrival" />
            {field('arrivalTime', { placeholder: 'HH:MM' })}
          </div>
          <div className="dn-cell">
            <Lbl de="Tatsächliche Abfahrtszeit" en="Actual departure" />
            {field('departureTime', { placeholder: 'HH:MM' })}
          </div>
        </div>
      </section>

      {/* ---------------- 2. temperature & cooling ---------------- */}
      <section className="dn-sec">
        <h2>
          Temperatur &amp; Kühlung <span className="dn-en">Temperature &amp; cooling</span>
        </h2>
        <div className="dn-grid dn-row-last" style={{ gridTemplateColumns: '1fr 1.05fr .8fr 1.15fr' }}>
          <div className="dn-cell">
            <Lbl de="1. Kühlfahrzeug" en="Refrigerated trailer" />
            <span className="dn-val dn-opts">
              <JaNein
                value={note.refrigerated}
                onChange={onField ? (v) => onField('refrigerated', v || 'ja') : undefined}
              />
            </span>
          </div>
          <div className="dn-cell">
            <Lbl de="2. Temp. Laderaum vor Beladung — SOLL" en="Loading space before loading — target" />
            {field('tempTarget')}
          </div>
          <div className="dn-cell">
            <Lbl de="Temp. Laderaum — IST" en="Loading space — actual" />
            {field('tempActual', { placeholder: 'z. B. 2 °C' })}
          </div>
          <div className="dn-cell">
            <Lbl de="Ladegut" en="Goods" />
            {field('goodsDe', { editable: ambient, title: ambient ? '' : 'Fixed for refrigerated trailers' })}
            {note.goodsEn ? <span className="dn-en dn-en-block">{note.goodsEn}</span> : null}
          </div>
        </div>
      </section>

      {/* ---------------- 3. marks & numbers ---------------- */}
      <section className="dn-sec">
        <h2>
          Kennzeichen &amp; Zahlen <span className="dn-en">Marks &amp; numbers</span>
        </h2>
        <div className="dn-grid dn-row-last" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="dn-cell">
            <Lbl de="Kennzeichen LKW" en="Truck plate" />
            {field('truckPlate')}
          </div>
          <div className="dn-cell">
            <Lbl de="Kennzeichen Trailer" en="Trailer plate" />
            {field('trailerPlate')}
          </div>
          <div className="dn-cell">
            <Lbl de="Rampe" en="Ramp" />
            {field('ramp')}
          </div>
          <div className="dn-cell">
            <Lbl de="Nr. Plombe" en="Seal no." />
            {field('seal')}
          </div>
        </div>
      </section>

      {/* ---------------- 4. freight + yard check out, merged ---------------- */}
      <section className="dn-sec">
        <h2>
          Ladung &amp; Yard Check Out <span className="dn-en">Freight &amp; yard check out</span>
        </h2>
        <table className="dn-freight">
          {/* Explicit widths: with table-layout:fixed the *first* row decides
              them, and that row is the colSpan'd group header — which would
              split each group evenly and squeeze the Ladung names. */}
          <colgroup>
            {FREIGHT_COLUMNS.map((c) => (
              <col key={c.key} style={{ width: c.width || '13mm' }} />
            ))}
          </colgroup>
          <thead>
            <tr className="dn-thead-groups">
              {FREIGHT_GROUPS.map((g) => (
                <th key={g.de} colSpan={g.columns.length}>
                  {g.de}
                  {g.en ? <span className="dn-en"> {g.en}</span> : null}
                </th>
              ))}
            </tr>
            <tr>
              {FREIGHT_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? 'dn-num' : ''}
                  style={{ textAlign: c.align }}
                >
                  {c.de}
                  {c.en ? <span className="dn-en">{c.en}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {note.freight.map((row, i) => (
              <tr key={i}>
                {FREIGHT_COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className={`${c.num ? 'dn-num' : ''} ${row[c.key] ? '' : 'dn-fill'}`}
                    style={{ textAlign: c.align }}
                  >
                    <Val
                      value={row[c.key]}
                      onChange={onFreightCell ? (v) => onFreightCell(i, c.key, v) : undefined}
                      className="dn-cellval"
                      align={c.num ? 'right' : c.align}
                      wb={c.wb}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="dn-totals">
              <td colSpan={2}>
                Gesamt<span className="dn-en">Total</span>
              </td>
              <td className="dn-num dn-weight">
                <span className="dn-en">Gewicht kg</span>
                {field('totalWeight', { className: 'dn-cellval', align: 'right' })}
              </td>
              {FREIGHT_COLUMNS.slice(3).map((c) => (
                <td className="dn-num" key={c.key}>
                  {totals[c.key] || ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---------------- 5. pallet exchange ---------------- */}
      <section className="dn-sec">
        <h2>
          Paletten Umschlag Produktion <span className="dn-en">Pallet exchange production</span>
        </h2>
        <div className="dn-grid dn-row-last dn-tight" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="dn-cell">
            <Lbl de="Erhalten" en="Received" />
            {field('palletsReceived')}
          </div>
          <div className="dn-cell">
            <Lbl de="Ausgegeben" en="Issued" />
            {field('palletsIssued')}
          </div>
          <div className="dn-cell">
            <Lbl de="Gesamt Anzahl Europaletten" en="Total euro pallets" />
            {field('palletsTotalEuro')}
          </div>
          <div className="dn-cell">
            <Lbl de="Davon defekt" en="Of which damaged" />
            {field('palletsDamaged')}
          </div>
        </div>
      </section>

      {/* ---------------- 6. checklist ---------------- */}
      <section className="dn-sec">
        <h2>
          Checkliste <span className="dn-en">Checklist</span>
        </h2>
        <ul className="dn-chk">
          {CHECKLIST.map((item, i) => (
            <li key={item.key}>
              <span className="dn-n">{i + 1}</span>
              <span className="dn-t">
                <span className="dn-de">{item.de}</span>
                <span className="dn-en dn-en-block">{item.en}</span>
              </span>
              <span className="dn-marks">
                <JaNein
                  value={note.checklist[item.key]}
                  onChange={onChecklist ? (v) => onChecklist(item.key, v) : undefined}
                  small
                />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- 7. loading & signatures ---------------- */}
      <section className="dn-sec">
        <h2>
          Verladung &amp; Unterschriften <span className="dn-en">Loading &amp; signatures</span>
        </h2>

        <div className="dn-grid dn-tight" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="dn-cell">
            <Lbl de="Verladung durchgeführt" en="Loading carried out by" />
            {field('loadedBy')}
          </div>
          <div className="dn-cell">
            <Lbl de="Papiere erstellt" en="Documents prepared by" />
            {field('preparedBy')}
          </div>
          <div className="dn-cell">
            <Lbl de="Papiere übergeben" en="Documents handed over by" />
            {field('handedOverBy')}
          </div>
        </div>

        <div className="dn-grid dn-sig">
          <div className="dn-pane">
            <Lbl de="Fahrer" en="Truck driver — name in block capitals" />
            <div className="dn-nameline">
              {field('driverName', { className: 'dn-cellval' })}
            </div>
            <div className="dn-sigline">Unterschrift / Signature</div>
          </div>
          <div className="dn-pane">
            <Lbl de={PICKUP_ADDRESS[0]} en="Handed over by — name in block capitals" />
            <div className="dn-nameline">
              <span className="dn-val">{note.handedOverBy || ''}</span>
            </div>
            <div className="dn-sigline">Unterschrift / Signature</div>
          </div>
        </div>

        <div className="dn-confirm-wrap">
          <div className="dn-confirm">
            <span className="dn-de">Ware wurde vollständig und einwandfrei übernommen.</span>
            <span className="dn-en dn-en-block">Goods were taken over completely and flawlessly.</span>
          </div>
        </div>
      </section>

      <div className="dn-foot">
        <span>
          {PICKUP_ADDRESS[0]} · {PICKUP_ADDRESS[1]}
        </span>
        <span>Übergabeschein · {note.reference || '—'} · Seite 1/1</span>
      </div>
    </div>
  );
}
