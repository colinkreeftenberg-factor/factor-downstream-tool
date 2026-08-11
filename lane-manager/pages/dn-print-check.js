// Temporary harness: reproduces the exact print path (portal to <body>, the
// dn-printing class, the injected @page rule) so the A4 fit can be verified
// with a real print-to-PDF. Delete when done.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DeliveryNoteSheet from '../components/DeliveryNoteSheet';
import { buildNoteFromLane } from '../lib/deliveryNote';

const SAMPLE_LANE = {
  'Load Reference': 'DPD_HER_REG_VE_WES_090826_H1',
  Carrier: 'Wesemann',
  Destination: 'DPD_HER_REG_VE',
  Date: '2026-08-09',
  'Actual Arrival time': '8:15:00 AM',
  'Actual Dispatch time': '4:23:00 PM',
  'Trailer number': 'NI W 2125',
  'Vehicle Registration': 'NI B 3780',
  'Bay door allocation': '73',
  'Total Boxes Loaded': '157',
  'Pallets loaded': '5',
  'Loader(s)': 'Team 4',
  'Driver Name': 'M. Schneider',
};

function sampleNote() {
  const note = buildNoteFromLane(SAMPLE_LANE);
  note.seal = 'DPD185182560P';
  note.freight[0].weight = '1.050,33';
  note.freight[0].contents = 'Frischware 2 °C — Grad Kühlen';
  note.tempActual = '2 °C';
  note.preparedBy = 'Sven';
  note.handedOverBy = 'Sven';
  return note;
}

export default function PrintCheck() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 portrait; margin: 8mm 9mm; }';
    document.head.appendChild(style);
    document.body.classList.add('dn-printing');
    setMounted(true);
  }, []);

  return (
    <div style={{ padding: 20, fontSize: 13 }}>
      Print-path harness — the sheet is portalled to &lt;body&gt;. Print this page to check the A4 fit.
      {mounted &&
        createPortal(
          <div className="dn-print-root">
            <DeliveryNoteSheet note={sampleNote()} />
          </div>,
          document.body
        )}
    </div>
  );
}
