import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import LaneTable, { computeFlags } from '../components/LaneTable';
import LaneDetailModal from '../components/LaneDetailModal';
import { CreateLaneModal, EditCellModal } from '../components/LaneForm';
import SlackUpdatesTab from '../components/SlackUpdatesTab';
import HistoryTab from '../components/HistoryTab';
import EmailTab from '../components/EmailTab';
import { isToday } from '../lib/dateUtils';
import { downloadCSV } from '../lib/csvExport';
import { KEY_HEADER } from '../lib/columns';

const AUTO_REFRESH_MS = 3 * 60 * 1000; // 3 minutes
const SLACK_SEEN_KEY = 'laneManagerSlackUpdatesSeenTs';

export default function Dashboard() {
  const [tab, setTab] = useState('lanes');
  const [lanes, setLanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailLane, setDetailLane] = useState(null);
  const [search, setSearch] = useState('');
  const [hasNewSlackUpdates, setHasNewSlackUpdates] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null); // null | 'today' | 'urgent' | 'delayed' | 'missingInfo' | 'stale'

  function toggleFilter(key) {
    setActiveFilter((current) => (current === key ? null : key));
  }

  function matchesActiveFilter(lane) {
    if (!activeFilter) return true;
    if (activeFilter === 'today') return isToday(lane['Date']);
    return computeFlags(lane)[activeFilter];
  }

  // Checks whether any lane still visible in the dashboard has a Slack
  // message newer than the last time this browser looked at the Slack
  // Updates tab — that's what lights up the dot on the tab. Uses
  // localStorage (this is a real deployed app, not a Claude artifact, so
  // that's fine here) so it persists across reloads for this person.
  const checkSlackUpdates = useCallback(async (currentLanes) => {
    try {
      const res = await fetch('/api/slack-updates');
      if (!res.ok) return;
      const data = await res.json();
      const visibleRefs = new Set(currentLanes.map((l) => l[KEY_HEADER]));
      let latest = 0;
      (data.tickets || []).forEach((t) => {
        if (!visibleRefs.has(t.loadReference)) return;
        (t.messages || []).forEach((m) => {
          const ms = Number(m.ts) * 1000;
          if (ms > latest) latest = ms;
        });
      });
      const seen = Number(window.localStorage.getItem(SLACK_SEEN_KEY) || 0);
      setHasNewSlackUpdates(latest > seen);
    } catch {
      // Non-critical — just skip lighting up the dot this cycle.
    }
  }, []);

  const loadLanes = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/lanes');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load lanes');
      const data = await res.json();
      setLanes(data.lanes);
      checkSlackUpdates(data.lanes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [checkSlackUpdates]);

  useEffect(() => {
    loadLanes();
    const interval = setInterval(loadLanes, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadLanes]);

  function openSlackUpdatesTab() {
    setTab('slack-updates');
    setHasNewSlackUpdates(false);
    window.localStorage.setItem(SLACK_SEEN_KEY, String(Date.now()));
  }

  const todayLanes = useMemo(() => lanes.filter((l) => isToday(l['Date'])), [lanes]);
  const filteredTodayLanes = useMemo(() => todayLanes.filter(matchesActiveFilter), [todayLanes, activeFilter]);
  const filteredAllLanes = useMemo(() => lanes.filter(matchesActiveFilter), [lanes, activeFilter]);

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
        <button className={`tab-btn ${tab === 'slack-updates' ? 'tab-btn-active' : ''}`} onClick={openSlackUpdatesTab}>
          Slack Updates
          {hasNewSlackUpdates && <span className="tab-dot" />}
        </button>
        <button className={`tab-btn ${tab === 'history' ? 'tab-btn-active' : ''}`} onClick={() => setTab('history')}>
          History
        </button>
        <button className={`tab-btn ${tab === 'email' ? 'tab-btn-active' : ''}`} onClick={() => setTab('email')}>
          Email
        </button>
      </div>

      {tab === 'email' && <EmailTab lanes={lanes} />}
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
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div
                    className={`stat-card stat-card-clickable ${activeFilter === 'today' ? 'stat-card-active' : ''}`}
                    onClick={() => toggleFilter('today')}
                  >
                    <div className="stat-value">{stats.today}</div>
                    <div className="stat-label">Today</div>
                  </div>
                  <div
                    className={`stat-card stat-card-clickable ${stats.urgent ? 'stat-warn' : ''} ${activeFilter === 'urgent' ? 'stat-card-active' : ''}`}
                    onClick={() => toggleFilter('urgent')}
                  >
                    <div className="stat-value">{stats.urgent}</div>
                    <div className="stat-label">Dispatching soon</div>
                  </div>
                  <div
                    className={`stat-card stat-card-clickable ${stats.delayed ? 'stat-warn' : ''} ${activeFilter === 'delayed' ? 'stat-card-active' : ''}`}
                    onClick={() => toggleFilter('delayed')}
                  >
                    <div className="stat-value">{stats.delayed}</div>
                    <div className="stat-label">Delayed</div>
                  </div>
                  <div
                    className={`stat-card stat-card-clickable ${stats.missingInfo ? 'stat-warn' : ''} ${activeFilter === 'missingInfo' ? 'stat-card-active' : ''}`}
                    onClick={() => toggleFilter('missingInfo')}
                  >
                    <div className="stat-value">{stats.missingInfo}</div>
                    <div className="stat-label">Missing info</div>
                  </div>
                  <div
                    className={`stat-card stat-card-clickable ${stats.stale ? 'stat-warn' : ''} ${activeFilter === 'stale' ? 'stat-card-active' : ''}`}
                    onClick={() => toggleFilter('stale')}
                  >
                    <div className="stat-value">{stats.stale}</div>
                    <div className="stat-label">Stale</div>
                  </div>
                  <div className="stat-card" onClick={() => setActiveFilter(null)} style={{ cursor: 'pointer' }}>
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">All lanes</div>
                  </div>
                  {activeFilter && (
                    <button className="btn" onClick={() => setActiveFilter(null)}>
                      ✕ Clear filter
                    </button>
                  )}
                </div>
              </div>

              <div className="section-header-row">
                <h2 className="section-heading">Today</h2>
                <div className="no-print">
                  <button className="btn" onClick={() => downloadCSV(filteredTodayLanes, `today-lanes-${new Date().toISOString().slice(0, 10)}.csv`)}>
                    Export today (CSV)
                  </button>
                  <button className="btn" onClick={() => window.print()}>
                    Print daily sheet
                  </button>
                </div>
              </div>
              <LaneTable
                lanes={filteredTodayLanes}
                globalSearch={search}
                onQuickEdit={(lane, field, value) => setEditing({ lane, field, value })}
                onOpenDetail={(lane) => setDetailLane(lane)}
              />

              <div className="all-lanes-section">
                <div className="section-header-row" style={{ marginTop: 28 }}>
                  <h2 className="section-heading">All lanes</h2>
                  <div className="no-print">
                    <button className="btn" onClick={() => downloadCSV(filteredAllLanes, 'all-lanes.csv')}>
                      Export all (CSV)
                    </button>
                  </div>
                </div>
                <LaneTable
                  lanes={filteredAllLanes}
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
