// src/pages/Dashboard.jsx
import React from 'react';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { useNavigate } from 'react-router-dom';
import { Typography, Box, Button, Skeleton } from '@mui/material';
import PositionsGrid from '../components/PositionsGrid';
import SubscriptionsModal from '../components/SubscriptionsModal';

const REFRESH_TRADES_AFTER_MS = 30  * 1000;
const REFRESH_FULL_AFTER_MS   = 5   * 60 * 1000;

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const GridShimmer = () => (
  <Box sx={{ width: '100%', p: 2 }}>
    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={50} sx={{ flex: 1 }} />
      ))}
    </Box>
    {Array.from({ length: 10 }).map((_, rowIdx) => (
      <Box key={rowIdx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
        {Array.from({ length: 10 }).map((_, colIdx) => (
          <Skeleton key={colIdx} variant="text" height={30} sx={{ flex: 1 }} />
        ))}
      </Box>
    ))}
  </Box>
);

// ─── Socket status indicator ──────────────────────────────────────────────────
const SocketStatus = ({ isConnected }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    <Box sx={{
      width:        8,
      height:       8,
      borderRadius: '50%',
      backgroundColor: isConnected ? '#0e9f5a' : '#e0291b',
      animation: isConnected ? 'pulse 2s infinite' : 'none',
      '@keyframes pulse': {
        '0%':   { boxShadow: '0 0 0 0 rgba(14,159,90,0.5)' },
        '70%':  { boxShadow: '0 0 0 6px rgba(14,159,90,0)' },
        '100%': { boxShadow: '0 0 0 0 rgba(14,159,90,0)' },
      },
    }} />
    <Typography sx={{
      fontSize:   '12px',
      fontWeight: 700,
      color:      isConnected ? '#0e9f5a' : '#e0291b',
      letterSpacing: '0.3px',
    }}>
      {isConnected ? 'Live' : 'Disconnected'}
    </Typography>
  </Box>
);

// ─── User menu dropdown ───────────────────────────────────────────────────────
const UserMenu = ({ user, onLogout, onOpenColumns, onOpenGrouping, showAccountRows, onToggleAccountRows, onOpenSubscriptions }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    { icon: '▦', label: 'Columns',  action: () => { onOpenColumns();  setOpen(false); } },
    { icon: '⊜', label: 'Grouping', action: () => { onOpenGrouping(); setOpen(false); } },
    { icon: showAccountRows ? '☑' : '☐', label: 'Show account rows', action: () => { onToggleAccountRows(); setOpen(false); } },
    { icon: '◉', label: 'Live Subscriptions', action: () => { onOpenSubscriptions(); setOpen(false); } },
    { divider: true },
    { icon: '⎋', label: 'Logout',   action: () => { onLogout();       setOpen(false); }, danger: true },
];  

  return (
    <Box ref={ref} sx={{ position: 'relative' }}>
      <Box
        onClick={() => setOpen(p => !p)}
        sx={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '5px 12px', borderRadius: '999px',
          backgroundColor: open ? '#dde2ec' : '#e9edf5',
          border: '1px solid #dde2ec',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background 0.12s',
          '&:hover': { backgroundColor: '#dde2ec' },
        }}
      >
        <Box sx={{
          width: 24, height: 24, borderRadius: '50%',
          backgroundColor: '#0c5fd0', color: '#ffffff',
          fontSize: '12px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, textTransform: 'uppercase',
        }}>
          {(user || '?').charAt(0)}
        </Box>
        <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#0c0f17' }}>
          {user}
        </Typography>
        <Typography sx={{ fontSize: '10px', color: '#6b7280', ml: '2px' }}>▾</Typography>
      </Box>

      {open && (
        <Box sx={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: '7px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 200, minWidth: '160px', overflow: 'hidden',
        }}>
          {items.map((item, i) => item.divider ? (
            <Box key={i} sx={{ height: '1px', background: '#f3f4f6', my: '2px' }} />
          ) : (
            <Box
              key={item.label}
              onClick={item.action}
              sx={{
                display: 'flex', alignItems: 'center', gap: '9px',
                padding: '9px 16px', fontSize: '13px', fontWeight: 600,
                color: item.danger ? '#e0291b' : '#111827',
                cursor: 'pointer',
                '&:hover': { background: item.danger ? '#fff5f5' : '#f0f4ff' },
              }}
            >
              <span style={{ fontSize: '14px' }}>{item.icon}</span>
              {item.label}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ─── Header bar ───────────────────────────────────────────────────────────────
const HeaderBar = ({ user, onLogout, isSocketConnected, onOpenColumns, onOpenGrouping, showAccountRows, onToggleAccountRows, onOpenSubscriptions }) => (
  <Box sx={{
    px: 2, py: 1,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid #dde2ec', flexShrink: 0,
  }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '19px', color: '#0c0f17' }}>
        Positions
      </Typography>
      <SocketStatus isConnected={isSocketConnected} />
    </Box>
    <UserMenu
      user={user}
      onLogout={onLogout}
      onOpenColumns={onOpenColumns}
      onOpenGrouping={onOpenGrouping}
      showAccountRows={showAccountRows}
      onToggleAccountRows={onToggleAccountRows}
      onOpenSubscriptions={onOpenSubscriptions}
    />
  </Box>
);

// ─── Error state ──────────────────────────────────────────────────────────────
const ErrorState = ({ user, error, onLogout }) => (
  <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <HeaderBar user={user} onLogout={onLogout} isSocketConnected={false} />
    <Box sx={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 2, px: 2,
    }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#e0291b' }}>
        Failed to load data
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 420, textAlign: 'center', color: '#5a6478', fontSize: '13px' }}>
        {error}
      </Typography>
      <Button variant="contained" onClick={() => window.location.reload()}
        sx={{ textTransform: 'none', fontWeight: 700, backgroundColor: '#0c5fd0' }}>
        Retry
      </Button>
    </Box>
  </Box>
);

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout, token } = useAuthStore();
  const {
    fetchUserData,
    getExchangeList,
    getMappedUsers,
    getCustomerAccountMappings,
    getAllTrades,
    getClosePrices,
    getLTP,
    getMarginRisk,
    getOpenPrices,
    connectSocket,
    disconnectSocket,
    refreshTrades,
    handleSessionExpired,
    reset,
    // ── Margin actions ──
    fetchReferenceRate,
    fetchSpanMargin,
    fetchMarginFromUser,
    fetchGroupingConfig,
    fetchCustomColumns,
    fetchCommonSubscription,
    fetchShowAccountRows,
    setShowAccountRows,
    fetchSelectedSubscriptions,
  } = useDataStore();

  const pendingRequests    = useDataStore((state) => state.pendingRequests);
  const error              = useDataStore((state) => state.error);
  const positions          = useDataStore((state) => state.positions);
  const isSocketConnected  = useDataStore((state) => state.isSocketConnected);
  const sessionExpired     = useDataStore((state) => state.sessionExpired);
  const showAccountRows    = useDataStore((state) => state.showAccountRows);

  const isLoading = pendingRequests > 0;
  const navigate  = useNavigate();
  const port      = window.location.port;
  const hiddenAtRef = useRef(null);

  // ── Handle session expiry ───────────────────────────────────────────
  useEffect(() => {
    if (sessionExpired) {
      logout();
      reset();
      navigate('/login');
    }
  }, [sessionExpired]);

  // ── Full initial load ───────────────────────────────────────────────
  const loadAll = async () => {
    try {
      // Run fetchUserData first so CustomerGrouping profile can be loaded
      // before getCustomerAccountMappings potentially overwrites CustomerAccounts
      await fetchUserData(user, port);
      await fetchGroupingConfig(port);
      await fetchCustomColumns(port);
      await fetchShowAccountRows(port);
      await fetchSelectedSubscriptions(port);
      await fetchCommonSubscription();

      await Promise.all([
        getExchangeList(),
        getMappedUsers(),
        getCustomerAccountMappings(),
        getClosePrices(),
        fetchReferenceRate(),
        fetchMarginFromUser(),
      ]);

      // Phase 2: sequential — each depends on the previous
      await getMarginRisk();    // sets NiftySecurityId etc., needed by getOpenPrices
      await getOpenPrices();
      await getLTP();
      await getAllTrades();      // builds positions{} in the store

      // Phase 3: margin distribution — runs after positions exist so updateSpanMargin
      // has user entries to attach margin to. referenceRate and userMargin already
      // loaded in Phase 1, so the formula runs correctly on first call.
      await fetchSpanMargin();

      connectSocket();
    } catch (err) {
      if (err?.response?.status === 401) {
        logout();
        reset();
        navigate('/login');
        return;
      }
      useDataStore.setState({
        error: err.message || 'An unexpected error occurred. Please retry.',
      });
    }
  };

  // ── Initial load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !token) {
      navigate('/login');
      return;
    }

    loadAll();

    return () => {
      disconnectSocket();
      reset();
    };
  }, [user, token]);

  // ── Visibility change ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !token) return;

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        if (!hiddenAtRef.current) return;

        const awayMs = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;

        console.log(`User returned after ${Math.round(awayMs / 1000)}s away`);

        try {
          if (awayMs >= REFRESH_FULL_AFTER_MS) {
            console.log('Full refresh triggered');
            disconnectSocket();
            await loadAll();
          } else if (awayMs >= REFRESH_TRADES_AFTER_MS) {
            console.log('Trades refresh triggered');
            await refreshTrades(); // refreshTrades already calls fetchSpanMargin internally
          }
          // < 30s — socket has it covered via Type 5 messages
        } catch (err) {
          if (err?.response?.status === 401) {
            logout();
            reset();
            navigate('/login');
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, token]);

  const posGridRef = React.useRef(null);
  const [subscriptionsOpen, setSubscriptionsOpen] = React.useState(false);

  const handleLogout = () => {
    disconnectSocket();
    logout();
    reset();
    navigate('/login');
  };

  if (!user) return null;

  if (error && !isLoading) {
    return <ErrorState user={user} error={error} onLogout={handleLogout} />;
  }

  return (
    <Box sx={{ height: '95vh', display: 'flex', flexDirection: 'column' }}>
      <HeaderBar
        user={user}
        onLogout={handleLogout}
        isSocketConnected={isSocketConnected}
        onOpenColumns={() => posGridRef.current?.openColumns()}
        onOpenGrouping={() => posGridRef.current?.openGrouping()}
        showAccountRows={showAccountRows}
        onToggleAccountRows={() => setShowAccountRows(!showAccountRows, port)}
        onOpenSubscriptions={() => setSubscriptionsOpen(true)}
      />
      {subscriptionsOpen && (
        <SubscriptionsModal onClose={() => setSubscriptionsOpen(false)} />
      )}
      <Box sx={{ flex: 1, overflow: 'hidden', px: 2, pb: 2 }}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {Object.keys(positions).length > 0 && (
            <PositionsGrid positions={positions} ref={posGridRef} />
          )}
          {isLoading && Object.keys(positions).length === 0 && (
            <GridShimmer />
          )}
          {isLoading && Object.keys(positions).length > 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10, backdropFilter: 'blur(1px)',
            }}>
              <div style={{ fontSize: '14px', color: '#5a6478', fontWeight: 600 }}>
                Refreshing...
              </div>
            </div>
          )}
        </div>
      </Box>
    </Box>
  );
}