// Temporary harness: the Delivery Notes tab with sample lanes, so the picker,
// the pop-up and the live preview can be eyeballed without Sheets creds.
// Delete when done.
import { useEffect } from 'react';
import DeliveryNoteTab from '../components/DeliveryNoteTab';

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const TODAY = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const LANES = [
  {
    'Load Reference': 'DPD_HER_REG_VE_WES_090826_H1',
    Carrier: 'Wesemann',
    Destination: 'DPD_HER_REG_VE',
    Date: TODAY,
    'Actual Arrival time': '8:15:00 AM',
    'Actual Dispatch time': '4:23:00 PM',
    'Trailer number': 'NI W 2125',
    'Vehicle Registration': 'NI B 3780',
    'Bay door allocation': '73',
    'Total Boxes Loaded': '157',
    'Pallets loaded': '5',
    'Loader(s)': 'Team 4',
    'Driver Name': 'M. Schneider',
  },
  {
    'Load Reference': 'DPD_MUC_REG_VE_KUE_100826_H2',
    Carrier: 'Kühne',
    Destination: 'DPD_MUC_REG_VE',
    Date: TODAY,
    'Bay door allocation': '68',
  },
];

export default function UiCheck({ autoOpen = true }) {
  useEffect(() => {
    if (!autoOpen) return;
    // Click the first "Übergabeschein" button so the pop-up is on screen for
    // the screenshot.
    const t = setTimeout(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Übergabeschein')
      );
      if (btn) btn.click();

      // ?nein=1 flips the Kühlfahrzeug select through a real change event, so
      // the knock-on effects (ambient target, unlocked cargo) get exercised.
      if (new URLSearchParams(window.location.search).get('nein')) {
        setTimeout(() => {
          const sel = [...document.querySelectorAll('select')].find((s) =>
            [...s.options].some((o) => o.value === 'nein' && o.text.includes('no'))
          );
          if (sel) {
            sel.value = 'nein';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 200);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [autoOpen]);

  return (
    <div className="page">
      <DeliveryNoteTab lanes={LANES} />
    </div>
  );
}
