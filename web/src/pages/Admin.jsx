import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useGroups } from '../context/GroupContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { DataTable } from '../components/DataTable.jsx';
import { Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatDateTime } from '../utils/format.js';

function PasswordModal({ user, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.prediction(`/admin/users/${user.id}/password`, {
        method: 'PUT',
        body: { new_password: password },
      });
      toast.success(`Đã đổi mật khẩu cho ${user.display_name}`);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Đổi mật khẩu — ${user.display_name}`} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="field">
          <span>Mật khẩu mới</span>
          <input type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Cập nhật'}
        </button>
      </form>
    </Modal>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api.prediction(`/admin/users/${user.id}`, { method: 'DELETE' });
      toast.success(`Đã xóa tài khoản ${user.display_name}`);
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Xóa tài khoản — ${user.display_name}`} onClose={onClose}>
      <p style={{ marginBottom: 16 }}>
        Bạn có chắc muốn xóa tài khoản <strong>{user.display_name}</strong> ({user.username})?
        Hành động này không thể hoàn tác.
      </p>
      <div className="inline-form" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Hủy</button>
        <button className="btn btn-danger" onClick={confirm} disabled={busy}>
          {busy ? 'Đang xóa…' : 'Xóa tài khoản'}
        </button>
      </div>
    </Modal>
  );
}

function CreateGroupModal({ onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.prediction('/admin/groups', {
        method: 'POST',
        body: { name: name.trim(), bet_type: 'EUROPEAN' },
      });
      toast.success(`Đã tạo group "${name}"`);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Thêm group mới" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="field">
          <span>Tên group</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang tạo…' : 'Tạo group'}
        </button>
      </form>
    </Modal>
  );
}

function RoundsManager() {
  const toast = useToast();
  const rounds = useFetch(() => api.bff('/rounds'), []);
  const fixtures = useFetch(() => api.fixture('/fixtures'), []);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState({});
  const [markMatchId, setMarkMatchId] = useState('');
  const [markRoundId, setMarkRoundId] = useState('');
  const [marking, setMarking] = useState(false);

  async function saveMultiplier(round) {
    const val = parseInt(edits[round.id], 10);
    if (!Number.isFinite(val) || val < 1) { toast.warn('Hệ số phải là số nguyên ≥ 1'); return; }
    setBusy((b) => ({ ...b, [round.id]: true }));
    try {
      await api.bff(`/admin/rounds/${round.id}/multiplier`, {
        method: 'PUT',
        body: { multiplier: val },
      });
      toast.success(`Đã cập nhật hệ số vòng "${round.name}"`);
      rounds.reload();
      setEdits((e) => { const c = { ...e }; delete c[round.id]; return c; });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy((b) => ({ ...b, [round.id]: false }));
    }
  }

  async function markRound() {
    if (!markMatchId || !markRoundId) { toast.warn('Chọn trận và vòng đấu'); return; }
    setMarking(true);
    try {
      const res = await api.bff(`/admin/matches/${markMatchId}/round`, {
        method: 'PUT',
        body: { round_id: parseInt(markRoundId, 10), set_subsequent: true },
      });
      toast.success(`Đã gán ${res.matches_updated} trận sang vòng "${res.round_name}"`);
      setMarkMatchId('');
      setMarkRoundId('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMarking(false);
    }
  }

  const roundList = rounds.data || [];
  const matchList = (fixtures.data || []).filter((m) => m.status !== 'FINAL');

  return (
    <div className="panel">
      <div className="panel-head"><h3>Hệ số vòng đấu</h3></div>
      <p className="hint">
        Người thua một trận ở vòng đó cộng số điểm bằng hệ số. (1 điểm = 10,000 ₫, admin tự tính tiền bên ngoài.)
      </p>

      {rounds.loading ? (
        <div className="loading">Đang tải vòng đấu…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Vòng đấu</th>
              <th style={{ textAlign: 'center', padding: '6px 8px' }}>Hệ số hiện tại</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Sửa hệ số</th>
            </tr>
          </thead>
          <tbody>
            {roundList.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px' }}><strong>{r.name}</strong></td>
                <td style={{ textAlign: 'center', padding: '8px' }}>
                  <span className="badge">{r.multiplier} điểm</span>
                </td>
                <td style={{ padding: '8px' }}>
                  <div className="inline-form" style={{ justifyContent: 'flex-end' }}>
                    <input
                      type="number" min="1" style={{ width: 70 }}
                      value={edits[r.id] ?? r.multiplier}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => saveMultiplier(r)}
                      disabled={busy[r.id] || String(edits[r.id] ?? r.multiplier) === String(r.multiplier)}
                    >
                      {busy[r.id] ? '…' : 'Lưu'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="panel-head" style={{ marginTop: 8 }}><h4>Đánh dấu vòng mới từ trận này</h4></div>
      <p className="hint">Tất cả trận từ trận chọn trở đi sẽ được gán vào vòng mới.</p>
      <div className="inline-form" style={{ flexWrap: 'wrap', gap: 8 }}>
        <select value={markMatchId} onChange={(e) => setMarkMatchId(e.target.value)}
          style={{ flex: 2, minWidth: 200 }}>
          <option value="">— Chọn trận bắt đầu —</option>
          {matchList.map((m) => (
            <option key={m.id} value={m.id}>
              {m.home_team} vs {m.away_team} · {formatDateTime(m.kickoff_at)}
            </option>
          ))}
        </select>
        <select value={markRoundId} onChange={(e) => setMarkRoundId(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}>
          <option value="">— Vòng đấu —</option>
          {roundList.map((r) => (
            <option key={r.id} value={r.id}>{r.name} (×{r.multiplier})</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={markRound}
          disabled={marking || !markMatchId || !markRoundId}>
          {marking ? 'Đang cập nhật…' : 'Áp dụng'}
        </button>
      </div>
    </div>
  );
}

function ResultsManager() {
  const toast = useToast();
  const fixtures = useFetch(() => api.fixture('/fixtures'), [], { refreshInterval: 60000 });
  const [scores, setScores] = useState({});    // { [matchId]: { home: '', away: '' } }
  const [busy, setBusy] = useState({});         // { [matchId]: bool }
  const [syncing, setSyncing] = useState(false);

  const unsettled = (fixtures.data || []).filter(
    (m) => m.status !== 'FINAL' && m.status !== 'SETTLED',
  );

  async function syncFixtures() {
    setSyncing(true);
    try {
      const res = await api.bff('/admin/sync', { method: 'POST' });
      toast.success(
        `Sync xong: ${res?.fixtures_created ?? 0} trận mới, ${res?.odds_refreshed ?? 0} tỷ lệ cập nhật`,
      );
      fixtures.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function enterResult(matchId) {
    const s = scores[matchId] || {};
    const home = parseInt(s.home, 10);
    const away = parseInt(s.away, 10);
    if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
      toast.warn('Nhập tỉ số hợp lệ (số nguyên ≥ 0)');
      return;
    }
    setBusy((b) => ({ ...b, [matchId]: true }));
    try {
      await api.bff(`/admin/matches/${matchId}/result`, {
        method: 'POST',
        body: { home_score: home, away_score: away },
      });
      toast.success(`Đã lưu kết quả ${home}–${away}`);
      setScores((prev) => { const c = { ...prev }; delete c[matchId]; return c; });
      fixtures.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy((b) => ({ ...b, [matchId]: false }));
    }
  }

  function setScore(matchId, side, value) {
    setScores((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] || {}), [side]: value },
    }));
  }

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Kết quả trận đấu</h3>
        <button
          className="btn btn-secondary btn-sm"
          onClick={syncFixtures}
          disabled={syncing}
        >
          {syncing ? 'Đang sync…' : '↻ Sync Fixtures & Odds'}
        </button>
      </div>
      <p className="hint">Nhập tỉ số cho các trận chưa có kết quả. Hệ thống sẽ tự động tính điểm thua.</p>

      {fixtures.loading ? (
        <div className="loading">Đang tải trận đấu…</div>
      ) : unsettled.length === 0 ? (
        <div className="hint" style={{ padding: '12px 0' }}>Tất cả trận đã có kết quả.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Trận</th>
              <th style={{ textAlign: 'center', padding: '6px 8px' }}>Kick-off</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', width: 200 }}>Tỉ số</th>
              <th style={{ padding: '6px 8px', width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {unsettled.map((m) => {
              const s = scores[m.id] || {};
              return (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}>
                    <strong>{m.home_team}</strong>
                    <span style={{ margin: '0 6px', color: 'var(--muted)' }}>vs</span>
                    <strong>{m.away_team}</strong>
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px', color: 'var(--muted)', fontSize: '0.85em' }}>
                    {formatDateTime(m.kickoff_at)}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div className="inline-form" style={{ justifyContent: 'center', gap: 6 }}>
                      <input
                        type="number" min="0" style={{ width: 54, textAlign: 'center' }}
                        placeholder="Nhà"
                        value={s.home ?? ''}
                        onChange={(e) => setScore(m.id, 'home', e.target.value)}
                      />
                      <span style={{ fontWeight: 700 }}>–</span>
                      <input
                        type="number" min="0" style={{ width: 54, textAlign: 'center' }}
                        placeholder="Khách"
                        value={s.away ?? ''}
                        onChange={(e) => setScore(m.id, 'away', e.target.value)}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => enterResult(m.id)}
                      disabled={busy[m.id] || s.home === undefined || s.away === undefined}
                    >
                      {busy[m.id] ? '…' : 'Lưu'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FixtureTestPanel() {
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [topX, setTopX] = useState(7);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  const fixtures = useFetch(
    () => api.fixture('/fixtures'),
    [],
    { refreshInterval: autoRefresh ? 60000 : undefined },
  );

  const filtered = useMemo(() => {
    const all = fixtures.data || [];
    const startDate = startInput ? new Date(startInput) : null;
    const endDate = endInput ? new Date(endInput) : null;
    return all
      .filter((m) => {
        const kick = new Date(m.kickoff_at);
        if (startDate && kick < startDate) return false;
        if (endDate && kick > endDate) return false;
        return true;
      })
      .slice(0, topX);
  }, [fixtures.data, startInput, endInput, topX]);

  const total = (fixtures.data || []).length;

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Kiểm tra Fixtures (Test Panel)</h3>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowExplain((v) => !v)}
        >
          {showExplain ? 'Ẩn giải thích ▴' : 'Xem cách hoạt động ▾'}
        </button>
      </div>

      {showExplain && (
        <div style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--line)',
          borderLeft: '3px solid var(--brand)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 16px',
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>useFetch hoạt động như thế nào?</p>
          <p style={{ marginBottom: 8 }}>
            <strong>A — Mount lần đầu:</strong> Hook gọi loader ngay khi component mount, đặt{' '}
            <code>loading: true</code>, chờ promise, rồi lưu data và tắt spinner. Gọi{' '}
            <code>useFetch(() =&gt; api.fixture('/fixtures'), [])</code> nghĩa là chạy GET{' '}
            <code>/fixtures</code> một lần ngay khi panel xuất hiện.
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong>B — deps array:</strong> <code>deps = []</code> → loader chỉ chạy 1 lần lúc mount.
            Nếu truyền biến vào deps (ví dụ <code>[groupId]</code>), hook tự fetch lại mỗi khi biến đó thay đổi
            — giống <code>useEffect</code>.
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong>C — Auto-refresh (setInterval):</strong> Nếu truyền{' '}
            <code>{'{ refreshInterval: 60000 }'}</code>, hook dùng <code>setInterval</code> gọi fetch ngầm
            mỗi 60 giây. Lỗi trong lần refresh ngầm bị bỏ qua. Loading spinner <em>không</em> hiện trong
            các lần refresh ngầm. Bật checkbox bên dưới để thấy điều này hoạt động trực tiếp.
          </p>
          <p>
            <strong>D — reload():</strong> Hook trả về hàm <code>reload()</code>. Gọi nó từ button để
            fetch thủ công — lần này <em>có</em> hiện spinner. Nút "↻ Tải lại" bên dưới dùng cách này.
          </p>
        </div>
      )}

      <div className="inline-form" style={{ alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Auto-refresh mỗi 60 giây
        </label>
        {autoRefresh && (
          <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
            ● Đang tự động tải lại
          </span>
        )}
        <button className="btn btn-secondary btn-sm" onClick={fixtures.reload} disabled={fixtures.loading}>
          {fixtures.loading ? 'Đang tải…' : '↻ Tải lại'}
        </button>
        {total > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>{total} trận tổng</span>
        )}
      </div>

      <div className="inline-form" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span>Từ (giờ VN, UTC+7)</span>
          <input
            type="datetime-local"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span>Đến (giờ VN, UTC+7)</span>
          <input
            type="datetime-local"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
          />
        </label>
        <label className="field" style={{ minWidth: 110, maxWidth: 140 }}>
          <span>Top X trận</span>
          <input
            type="number" min="1" max="100"
            value={topX}
            onChange={(e) => setTopX(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </label>
      </div>

      {fixtures.loading ? (
        <div className="loading">Đang tải fixtures…</div>
      ) : fixtures.error ? (
        <div className="loading">Lỗi: {fixtures.error.message}</div>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 8 }}>
            Hiển thị <strong>{filtered.length}</strong> / {total} trận
            {(startInput || endInput) && ' (đã lọc theo khoảng thời gian)'}
          </p>
          {filtered.length === 0 ? (
            <div className="hint" style={{ padding: '10px 0' }}>
              Không có trận nào trong khoảng thời gian này.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', width: 32 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Trận</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px' }}>Kick-off (giờ VN)</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px' }}>Trạng thái</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px' }}>Vòng</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', color: 'var(--text-mute)', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ padding: '8px' }}>
                      <strong>{m.home_team}</strong>
                      <span style={{ margin: '0 6px', color: 'var(--muted)' }}>vs</span>
                      <strong>{m.away_team}</strong>
                      {m.group_code && (
                        <span className="badge" style={{ marginLeft: 8, fontSize: 11 }}>
                          {m.group_code}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px', fontSize: '0.85em', color: 'var(--text-dim)' }}>
                      {formatDateTime(m.kickoff_at)}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>
                      <span className="badge">{m.status}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px', fontSize: '0.85em', color: 'var(--text-dim)' }}>
                      ×{m.round_multiplier}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export function Admin() {
  const navigate = useNavigate();
  const { groups, refresh: refreshGroups } = useGroups();
  const users = useFetch(() => api.prediction('/admin/users'), []);
  const [pwUser, setPwUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [creating, setCreating] = useState(false);

  const userColumns = [
    { key: 'display_name', label: 'Tên hiển thị', sortable: true, render: (u) => <strong>{u.display_name}</strong> },
    { key: 'username', label: 'Đăng nhập', sortable: true, render: (u) => <span className="mono">{u.username}</span> },
    {
      key: 'is_admin', label: 'Vai trò',
      render: (u) => u.is_admin
        ? <span className="badge admin">Admin</span>
        : <span className="hint">Người chơi</span>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (u) => (
        <div className="inline-form" style={{ justifyContent: 'flex-end', gap: 6 }}>
          <button className="btn btn-secondary btn-sm"
            onClick={(e) => { e.stopPropagation(); setPwUser(u); }}>
            Đổi mật khẩu
          </button>
          {!u.is_admin && (
            <button className="btn btn-danger btn-sm"
              onClick={(e) => { e.stopPropagation(); setDeleteUser(u); }}>
              Xóa
            </button>
          )}
        </div>
      ),
    },
  ];

  const groupColumns = [
    { key: 'name', label: 'Group', sortable: true, render: (g) => <strong>{g.name}</strong> },
    { key: 'id', label: 'Mã', render: (g) => <span className="mono">{g.id}</span> },
  ];

  return (
    <div>
      <div className="section-title">Người dùng</div>
      {users.loading
        ? <div className="loading">Đang tải người dùng…</div>
        : users.error
          ? <div className="loading">Không tải được: {users.error.message}</div>
          : <DataTable columns={userColumns} rows={users.data} />
      }

      <div className="row-between" style={{ margin: '28px 0 14px' }}>
        <div className="section-title" style={{ margin: 0 }}>Group</div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          + Thêm group
        </button>
      </div>
      <DataTable
        columns={groupColumns}
        rows={groups}
        onRowClick={(g) => navigate(`/admin/groups/${g.id}`)}
        empty="Chưa có group nào"
      />

      <div className="section-title" style={{ marginTop: 28 }}>Vòng đấu & Hệ số điểm</div>
      <RoundsManager />

      <div className="section-title" style={{ marginTop: 28 }}>Kết quả trận đấu</div>
      <ResultsManager />

      <div className="section-title" style={{ marginTop: 28 }}>Kiểm tra Fixtures (Test Panel)</div>
      <FixtureTestPanel />

      {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} />}
      {deleteUser && (
        <DeleteUserModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={users.reload}
        />
      )}
      {creating && <CreateGroupModal onClose={() => setCreating(false)} onCreated={refreshGroups} />}
    </div>
  );
}
