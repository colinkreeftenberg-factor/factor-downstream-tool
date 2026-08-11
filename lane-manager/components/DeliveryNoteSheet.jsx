// The printable A4 Übergabeschein. Pure render — hand it a note object from
// lib/deliveryNote.js and it lays out exactly one A4 page.
//
// Sizing is deliberately in mm/pt rather than px: this only ever exists to be
// printed, and the whole thing is tuned to land inside 297mm minus the 8/9mm
// page margin. If you add a row here, re-check it still prints on one page.
//
// Colours stay Carbon + Natural with a single Saffron accent bar that carries
// no information, so a black & white printout loses nothing.

import { CHECKLIST, PICKUP_ADDRESS, YARD_COLUMNS } from '../lib/deliveryNote';

/** German label with the English underneath, the compact bilingual pattern. */
function Lbl({ de, en }) {
  return (
    <span className="dn-lbl">
      <span className="dn-de">{de}</span>
      {en ? <span className="dn-en">{en}</span> : null}
    </span>
  );
}

/** A filled-in value, or an empty well to write in by hand. */
function Val({ v, className = '' }) {
  const text = String(v ?? '').trim();
  if (!text) return <span className={`dn-val dn-blank ${className}`} />;
  return <span className={`dn-val ${className}`}>{text}</span>;
}

function Box({ on }) {
  return <span className={`dn-box ${on ? 'dn-box-on' : ''}`} />;
}

/** ja/nein pair, used by the trailer question and every checklist line. */
function JaNein({ value, small }) {
  return (
    <>
      <span className={`dn-opt ${small ? 'dn-opt-sm' : ''}`}>
        <Box on={value === 'ja'} />
        ja<span className="dn-en-b">&nbsp;/ yes</span>
      </span>
      <span className={`dn-opt ${small ? 'dn-opt-sm' : ''}`}>
        <Box on={value === 'nein'} />
        nein<span className="dn-en-b">&nbsp;/ no</span>
      </span>
    </>
  );
}

export default function DeliveryNoteSheet({ note }) {
  // The paper has room for two freight lines; pad with a blank one so there's
  // always somewhere to write a second load without breaking onto page 2.
  const freightRows = [...note.freight];
  while (freightRows.length < 2) freightRows.push(null);

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
          <b>{note.reference || '—'}</b>
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
            <Val v={note.destination1} className="dn-addr" />
          </div>
          <div className="dn-cell">
            <Lbl de="2. Entladestelle" en="2nd delivery address" />
            <Val v={note.destination2} className="dn-addr" />
          </div>
        </div>
        <div className="dn-grid dn-row-last" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="dn-cell">
            <Lbl de="LKW Spedition" en="Forwarder" />
            <Val v={note.forwarder} />
          </div>
          <div className="dn-cell">
            <Lbl de="Verladedatum" en="Loading date" />
            <Val v={note.loadingDate} />
          </div>
          <div className="dn-cell">
            <Lbl de="Ankunftszeit" en="Time of arrival" />
            <Val v={note.arrivalTime} />
          </div>
          <div className="dn-cell">
            <Lbl de="Tatsächliche Abfahrtszeit" en="Actual departure" />
            <Val v={note.departureTime} />
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
            <span className="dn-val" style={{ marginTop: '1.2mm' }}>
              <JaNein value={note.refrigerated} />
            </span>
          </div>
          <div className="dn-cell">
            <Lbl de="2. Temp. Laderaum vor Beladung — SOLL" en="Loading space before loading — target" />
            <Val v={note.tempTarget} />
          </div>
          <div className="dn-cell">
            <Lbl de="Temp. Laderaum — IST" en="Loading space — actual" />
            <Val v={note.tempActual} />
          </div>
          <div className="dn-cell">
            <Lbl de="Ladegut" en="Goods" />
            {String(note.goodsDe || '').trim() ? (
              <span className="dn-val">
                {note.goodsDe}
                {note.goodsEn ? <span className="dn-en dn-en-block">{note.goodsEn}</span> : null}
              </span>
            ) : (
              <span className="dn-val dn-blank" />
            )}
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
            <Val v={note.truckPlate} />
          </div>
          <div className="dn-cell">
            <Lbl de="Kennzeichen Trailer" en="Trailer plate" />
            <Val v={note.trailerPlate} />
          </div>
          <div className="dn-cell">
            <Lbl de="Rampe" en="Ramp" />
            <Val v={note.ramp} />
          </div>
          <div className="dn-cell">
            <Lbl de="Nr. Plombe" en="Seal no." />
            <Val v={note.seal} />
          </div>
        </div>
      </section>

      {/* ---------------- 4. freight & destination ---------------- */}
      <section className="dn-sec">
        <h2>
          Ladung &amp; Entladestelle <span className="dn-en">Freight &amp; destination</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '27%' }}>
                Ladung<span className="dn-en">Load</span>
              </th>
              <th className="dn-num" style={{ width: '11%' }}>
                Boxen<span className="dn-en">Boxes</span>
              </th>
              <th className="dn-num" style={{ width: '13%' }}>
                Palettenzahl<span className="dn-en">Pallets</span>
              </th>
              <th className="dn-num" style={{ width: '14%' }}>
                Gewicht (kg)<span className="dn-en">Weight (kg)</span>
              </th>
              <th>
                Inhalt<span className="dn-en">Contents</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {freightRows.map((row, i) => (
              <tr key={i}>
                <td className={row?.load ? '' : 'dn-fill'}>{row?.load || ''}</td>
                <td className={`dn-num ${row?.boxes ? '' : 'dn-fill'}`}>{row?.boxes || ''}</td>
                <td className={`dn-num ${row?.pallets ? '' : 'dn-fill'}`}>{row?.pallets || ''}</td>
                <td className={`dn-num ${row?.weight ? '' : 'dn-fill'}`}>{row?.weight || ''}</td>
                <td className={row?.contents ? '' : 'dn-fill'}>{row?.contents || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------- 5. yard check out ---------------- */}
      <section className="dn-sec">
        <h2>
          Yard Check Out <span className="dn-en">Yard check out</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '22%' }}>
                Ladung<span className="dn-en">Load</span>
              </th>
              {YARD_COLUMNS.map((c) => (
                <th className="dn-num" key={c.key}>
                  {c.de}
                  <span className="dn-en">{c.en || ' '}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {note.yard.map((row, i) => (
              <tr key={i}>
                <td className={row?.load ? '' : 'dn-fill'}>{row?.load || ''}</td>
                {YARD_COLUMNS.map((c) => (
                  <td className={`dn-num ${row?.[c.key] ? '' : 'dn-fill'}`} key={c.key}>
                    {row?.[c.key] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------- 6. pallet exchange ---------------- */}
      <section className="dn-sec">
        <h2>
          Paletten Umschlag Produktion <span className="dn-en">Pallet exchange production</span>
        </h2>
        <div className="dn-grid dn-row-last" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="dn-cell">
            <Lbl de="Erhalten" en="Received" />
            <Val v={note.palletsReceived} />
          </div>
          <div className="dn-cell">
            <Lbl de="Ausgegeben" en="Issued" />
            <Val v={note.palletsIssued} />
          </div>
          <div className="dn-cell">
            <Lbl de="Gesamt Anzahl Europaletten" en="Total euro pallets" />
            <Val v={note.palletsTotalEuro} />
          </div>
          <div className="dn-cell">
            <Lbl de="Davon defekt" en="Of which damaged" />
            <Val v={note.palletsDamaged} />
          </div>
        </div>
      </section>

      {/* ---------------- 7. checklist ---------------- */}
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
                <JaNein value={note.checklist[item.key]} small />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- 8. loading & signatures ---------------- */}
      <section className="dn-sec">
        <h2>
          Verladung &amp; Unterschriften <span className="dn-en">Loading &amp; signatures</span>
        </h2>

        <div className="dn-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="dn-cell">
            <Lbl de="Verladung durchgeführt" en="Loading carried out by" />
            <Val v={note.loadedBy} />
          </div>
          <div className="dn-cell">
            <Lbl de="Papiere erstellt" en="Documents prepared by" />
            <Val v={note.preparedBy} />
          </div>
          <div className="dn-cell">
            <Lbl de="Papiere übergeben" en="Documents handed over by" />
            <Val v={note.handedOverBy} />
          </div>
        </div>

        <div className="dn-grid dn-sig">
          <div className="dn-pane">
            <Lbl de="Fahrer" en="Truck driver — name in block capitals" />
            <div className="dn-nameline">{note.driverName || ''}</div>
            <div className="dn-sigline">Unterschrift / Signature</div>
          </div>
          <div className="dn-pane">
            <Lbl de={PICKUP_ADDRESS[0]} en="Handed over by — name in block capitals" />
            <div className="dn-nameline">{note.handedOverBy || ''}</div>
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
