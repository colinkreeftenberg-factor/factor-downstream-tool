import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import LaneTable, { computeFlags } from '../components/LaneTable';
import LaneDetailModal from '../components/LaneDetailModal';
import { CreateLaneModal, EditCellModal } from '../components/LaneForm';
import SlackUpdatesTab from '../components/SlackUpdatesTab';
import HistoryTab from '../components/HistoryTab';
import { isToday } from '../lib/dateUtils';
import { downloadCSV } from '../lib/csvExport';

const AUTO_REFRESH_MS = 3 * 60 * 1000; // 3 minutes

function EmailToolPlaceholder() {
  return (
    <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>This module will be enabled later.</p>
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState('lanes');
  const [lanes, setLanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailLane, setDetailLane] = useState(null);
  const [search, setSearch] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);

  const loadLanes = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/lanes');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load lanes');
      const data = await res.json();
      setLanes(data.lanes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLanes();
    const interval = setInterval(loadLanes, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadLanes]);

  const todayLanes = useMemo(() => lanes.filter((l) => isToday(l['Date'])), [lanes]);

  const stats = useMemo(() => {
    let urgent = 0, delayed = 0, missingInfo = 0, stale = 0;
    lanes.forEach((lane) => {
      const f = computeFlags(lane);
      if (f.urgent) urgent++;
      if (f.delayed) delayed++;
      if (f.missingInfo) missingInfo++;
      if (f.stale) stale++;
    });
    return { total: lanes.length, today: todayLanes.length, urgent, delayed, missingInfo, stale };
  }, [lanes, todayLanes]);

  async function handleNotifyNow() {
    setNotifying(true);
    setNotifyResult(null);
    try {
      const res = await fetch('/api/notify-manual', { method: 'POST' });
      const data = await res.json();
      setNotifyResult(data.skipped ? `Not configured: ${data.reason}` : `Sent ${data.sent} Slack notification(s).`);
    } catch (err) {
      setNotifyResult('Failed to run notification check.');
    } finally {
      setNotifying(false);
    }
  }

  return (
    <div className="page">
      <Head>
        <title>Verden Lane Manager</title>
      </Head>
      <div className="topbar">
        <div className="topbar-brand">
          <img src="/logo.png" alt="Factor" />
          <div>
            <h1>Verden Lane Manager</h1>
            <span className="meta">{lanes.length} lane(s) loaded · auto-refreshes every 3 min</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="search-box"
            placeholder="Search all lanes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New lane
          </button>
          <button className="btn" onClick={loadLanes}>
            Refresh
          </button>
        </div>
      </div>

      <div className="tab-bar no-print">
        <button className={`tab-btn ${tab === 'lanes' ? 'tab-btn-active' : ''}`} onClick={() => setTab('lanes')}>
          Lanes
        </button>
        <button className={`tab-btn ${tab === 'slack-updates' ? 'tab-btn-active' : ''}`} onClick={() => setTab('slack-updates')}>
          Slack Updates
        </button>
        <button className={`tab-btn ${tab === 'history' ? 'tab-btn-active' : ''}`} onClick={() => setTab('history')}>
          History
        </button>
        <button className={`tab-btn ${tab === 'email' ? 'tab-btn-active' : ''}`} onClick={() => setTab('email')}>
          Email
        </button>
      </div>

      {tab === 'email' && <EmailToolPlaceholder />}
      {tab === 'slack-updates' && <SlackUpdatesTab lanes={lanes} />}
      {tab === 'history' && <HistoryTab lanes={lanes} />}

      {tab === 'lanes' && (
        <>
          {error && <p style={{ color: '#b42318' }}>{error}</p>}

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading lanes…</p>
          ) : (
            <>
              <div className="stat-strip no-print">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div className="stat-card">
                    <div className="stat-value">{stats.today}</div>
                    <div className="stat-label">Today</div>
                  </div>
                  <div className={`stat-card ${stats.urgent ? 'stat-warn' : ''}`}>
                    <div className="stat-value">{stats.urgent}</div>
                    <div className="stat-label">Dispatching soon</div>
                  </div>
                  <div className={`stat-card ${stats.delayed ? 'stat-warn' : ''}`}>
                    <div className="stat-value">{stats.delayed}</div>
                    <div className="stat-label">Delayed</div>
                  </div>
                  <div className={`stat-card ${stats.missingInfo ? 'stat-warn' : ''}`}>
                    <div className="stat-value">{stats.missingInfo}</div>
                    <div className="stat-label">Missing info</div>
                  </div>
                  <div className={`stat-card ${stats.stale ? 'stat-warn' : ''}`}>
                    <div className="stat-value">{stats.stale}</div>
                    <div className="stat-label">Stale</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">All lanes</div>
                  </div>
                </div>
                <button className="btn slack-btn" onClick={handleNotifyNow} disabled={notifying}>
                  <img src="/slack-logo.png" alt="" />
                  {notifying ? 'Checking…' : 'Check & notify Slack'}
                </button>
              </div>
              {notifyResult && <p className="notify-result">{notifyResult}</p>}

              <div className="section-header-row">
                <h2 className="section-heading">Today</h2>
                <div className="no-print">
                  <button className="btn" onClick={() => downloadCSV(todayLanes, `today-lanes-${new Date().toISOString().slice(0, 10)}.csv`)}>
                    Export today (CSV)
                  </button>
                  <button className="btn" onClick={() => window.print()}>
                    Print daily sheet
                  </button>
                </div>
              </div>
              <LaneTable
                lanes={todayLanes}
                globalSearch={search}
                onQuickEdit={(lane, field, value) => setEditing({ lane, field, value })}
                onOpenDetail={(lane) => setDetailLane(lane)}
              />

              <div className="all-lanes-section">
                <div className="section-header-row" style={{ marginTop: 28 }}>
                  <h2 className="section-heading">All lanes</h2>
                  <div className="no-print">
                    <button className="btn" onClick={() => downloadCSV(lanes, 'all-lanes.csv')}>
                      Export all (CSV)
                    </button>
                  </div>
                </div>
                <LaneTable
                  lanes={lanes}
                  globalSearch={search}
                  sortByDate
                  onQuickEdit={(lane, field, value) => setEditing({ lane, field, value })}
                  onOpenDetail={(lane) => setDetailLane(lane)}
                />
              </div>
            </>
          )}
        </>
      )}

      {showCreate && (
        <CreateLaneModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadLanes();
          }}
        />
      )}

      {editing && (
        <EditCellModal
          lane={editing.lane}
          field={editing.field}
          initialValue={editing.value}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadLanes();
          }}
        />
      )}

      {detailLane && (
        <LaneDetailModal
          lane={detailLane}
          onClose={() => setDetailLane(null)}
          onSaved={() => {
            setDetailLane(null);
            loadLanes();
          }}
        />
      )}
    </div>
  );
}
