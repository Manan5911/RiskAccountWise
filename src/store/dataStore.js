import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { io } from 'socket.io-client';
import { useAuthStore } from './authStore';
import {
  getUserProfile, getExchCtclAccList, getExchangeCurrency,
  getCurrencyPrice, getMappedUsers, getCustomerAccountMappings,
  getOpenPrices, getClosePrices, getMargins, getLTP, getAllTrades,
  getReferenceRate, getCurrentSpanMargin, getMarginFromUser, editUserProfile, getCommonSubscription,
} from '../api/auth';
import { environment } from '../environments/environment';

// ── Pure PnL calculation — outside the store ──────────────────────────────────
const calculatePnl = (trade, ltp, todayNum) => {
  const {
    SOD_BuyQty, SOD_SellQty, SOD_BuyPrice, SOD_SellPrice,
    BuyQty, SellQty, BuyPrice, SellPrice,
    Close_price, Open_price, Expiry, Lot_size,
  } = trade;

  const lotSize = Lot_size || 1;
  const closePrice = Close_price || ltp;
  const openPrice = Open_price || 0;

  const totalPosition = SOD_BuyQty + SOD_SellQty + BuyQty + SellQty;

  const intraPnl = lotSize * (
    SellPrice * SellQty -
    BuyPrice * BuyQty +
    (SellQty + BuyQty) * ltp
  );

  const Intradaypn_1 = SellQty * SellPrice - BuyQty * BuyPrice + totalPosition * closePrice;
  const CumulativePnl_1 = SOD_SellPrice * SOD_SellQty - SOD_BuyQty * SOD_BuyPrice;

  const expiryNum = parseInt(Expiry, 10);
  const cumPnl = expiryNum < todayNum
    ? 0
    : lotSize * (Intradaypn_1 + CumulativePnl_1);

  return { pnl: intraPnl, cumPnl };
};

// ── Pure MTM calculation — outside the store ──────────────────────────────────
const calculateMtm = (trade, ltp) => {
  const {
    SOD_BuyQty, SOD_SellQty,
    BuyQty, SellQty, BuyPrice, SellPrice,
    Open_price, SecurityExchange, Lot_size,
  } = trade;

  const lotSize = Lot_size || 1;
  // Match Angular: NSEFO uses 0 if no open price, others fall back to ltp
  const openPrice = Open_price
    ? Open_price
    : SecurityExchange === 'NSEFO' ? 0 : ltp;

  const totalPos = SOD_BuyQty + SOD_SellQty + BuyQty + SellQty;

  const IntradayPnl_1 = SellQty * SellPrice - BuyQty * BuyPrice + totalPos * ltp;
  const SOD_Pnl = (SOD_BuyQty + SOD_SellQty) * openPrice;

  return lotSize * (IntradayPnl_1 - SOD_Pnl);
};

// ── premiumBuy for a single trade — call options and put options both count ───
// Matches Angular: premiumBuyQty = SOD_BuyQty * SOD_BuyPrice + BuyQty * BuyPrice
const calcTradePremiumBuy = (trade) => {
  const { SOD_BuyQty, SOD_BuyPrice, BuyQty, BuyPrice, Symbol, SecurityExchange } = trade;
  // Angular only counts premiumBuy for NSEFO and BSEED exchanges
  if (SecurityExchange !== 'NSEFO' && SecurityExchange !== 'BSEED') return 0;
  const isCE = Symbol && (Symbol.includes('  C ') || Symbol.includes(' C W'));
  const isPE = Symbol && (Symbol.includes(' P ') || Symbol.includes(' P W'));
  if (!isCE && !isPE) return 0;
  return SOD_BuyQty * SOD_BuyPrice + BuyQty * BuyPrice;
};

export const useDataStore = create(devtools((set, get) => ({
  // ── State ───────────────────────────────────────────────────────────────────
  socket: null,
  isSocketConnected: false,
  hasConnectedOnce: false,
  sessionExpired: false,
  pendingRequests: 0,
  error: null,
  showColumns: [],
  grouping: [],
  exchangeList: [],
  currencyList: [],
  currencies: [],
  selectedCurrency: '',
  currencySymbol: '',
  conversionPriceList: [],
  OpenPrices: [],
  ClosePrices: [],
  MarginRisk: [],
  NiftySecurityId: null,
  BankNiftySecurityId: null,
  GiftNiftySecurityId: null,
  globalNiftyOpenPrice: null,
  globalBnfOpenPrice: null,
  giftNiftyOpenPrice: null,
  LTP_Data: [],
  globalNiftyLtp: null,
  globalBnfLtp: null,
  giftNiftyLtp: null,
  MappedUsers: [],
  CustomerAccounts: [],
  positions: {},
  securityToUsers: {},

  // ── Margin state ────────────────────────────────────────────────────────────
  SpanMap: [],          // [{ user, ctcl, exch, spanMargin, exposureMargin, totalMargin, maxMargin }]
  userMargin: [],       // [{ Name, Amount, UpdatedBy, UpdateTime }]
  referenceRate: 1,     // SGX/IFSC → INR conversion rate
  hasCustomerGrouping: false,
  customGrouping: [],
  customColumns: null,
  subscriptions: [],

  connectSocket: () => {
    const existingSocket = get().socket;
    if (existingSocket) return;

    const { user } = useAuthStore.getState();
    if (!user) {
      console.error('Cannot connect socket — missing user');
      return;
    }

    const socket = io(environment.NodeServiceUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    let disconnectRefreshTimer = null;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      set({ isSocketConnected: true });
      socket.emit('Authenticate', { user });

      if (disconnectRefreshTimer) {
        clearTimeout(disconnectRefreshTimer);
        disconnectRefreshTimer = null;
      }

      if (get().hasConnectedOnce) {
        console.log('Socket reconnected — refreshing trades to cover gap');
        get().refreshTrades();
      } else {
        set({ hasConnectedOnce: true });
      }
    });

    socket.on('authenticated', () => {
      console.log('Socket authenticated — listening for live trades');
    });

    socket.on('TradeData', (raw) => {
      try {
        const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const { Type, Data } = message;

        if (Type === 2) {
          if (!Data) return;
          get().calculatePositions([Data], 2);

        } else if (Type === 4) {
          // Data is a comma-delimited string: "SecurityId,Exchange,LTP,Bid,Ask,LtpTime"
          if (!Data || typeof Data !== 'string') return;
          const parts = Data.split(',');
          if (parts.length < 3) return;

          const [securityId, exchange, ltp, bid, ask, ...rest] = parts;
          const ltpTime = rest.join(','); // timestamp may contain commas

          const ltpUpdateMap = {
            [`${securityId}_${exchange}`]: {
              ltp: parseFloat(ltp),
              exchange,
              bid: parseFloat(bid),
              ask: parseFloat(ask),
              ltpTime,
            },
          };

          get().applyLtpUpdate(ltpUpdateMap);

        } else if (Type === 5) {
          // Span margin update — single object or array
          if (!Data) return;
          if (Array.isArray(Data) && Data.length > 1) {
            get().applySpanMarginBatch(Data);
          } else {
            const single = Array.isArray(Data) ? Data[0] : Data;
            get().applySpanMarginSingle(single);
          }
        }

      } catch (err) {
        console.error('Socket message error:', err);
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('Socket disconnected:', reason);
      set({ isSocketConnected: false });

      disconnectRefreshTimer = setTimeout(() => {
        disconnectRefreshTimer = null;
        if (!get().isSocketConnected) {
          console.log('Socket still disconnected after 2s — refreshing trades');
          get().refreshTrades();
        }
      }, 2000);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    set({ socket, isSocketConnected: false, hasConnectedOnce: false });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isSocketConnected: false, hasConnectedOnce: false });
    }
  },

  // ── Trades-only refresh — used by socket gap recovery + visibility change ──
  refreshTrades: async () => {
    try {
      await get().getLTP();
      await get().getMarginRisk();
      await get().getAllTrades();
      // Refresh margin data alongside trades so it stays in sync after a gap
      await get().fetchSpanMargin();
      await get().fetchMarginFromUser();
    } catch (err) {
      if (err?.response?.status === 401) {
        console.warn('Session expired — redirecting to login');
        get().handleSessionExpired();
      } else {
        console.error('Trades refresh failed:', err);
      }
    }
  },

  // ── Session expired handler ───────────────────────────────────────────────
  handleSessionExpired: () => {
    get().disconnectSocket();
    set({ sessionExpired: true });
  },

  // ── Data fetching ───────────────────────────────────────────────────────────
  fetchUserData: async (user, port) => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const profileData = await getUserProfile(user, port);
      let columns = [];
      let grouping = [];
      let customerGrouping = null;
      if (profileData && profileData.length > 0) {
        profileData.forEach((v) => {
          if (v.ProfileName === 'UserColumns') {
            columns = JSON.parse(v.ProfileValue || '[]');
          } else if (v.ProfileName === 'Grouping') {
            grouping = JSON.parse(v.ProfileValue || '[]');
          } else if (v.ProfileName === 'CustomerGrouping') {
            try {
              customerGrouping = JSON.parse(v.ProfileValue || 'null');
            } catch { customerGrouping = null; }
          }
        });
      }
      if (customerGrouping && Array.isArray(customerGrouping)) {
        set({ showColumns: columns, grouping, CustomerAccounts: customerGrouping, hasCustomerGrouping: true });
      } else {
        set({ showColumns: columns, grouping });
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  fetchCommonSubscription: async () => {
    try {
      const data = await getCommonSubscription();
      // console.log("Fetched common subscriptions:", data);
      set({ subscriptions: data });
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
    }
  },

  getExchangeList: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const data = await getExchCtclAccList();
      const result = Array.isArray(data)
        ? data
        : data['getExchCtclAccountMappingResult'];
      const exchangeList = result.map((item) => item.Exchange);
      set({ exchangeList });
      await get().getExchangeCurrency();
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getExchangeCurrency: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const res = await getExchangeCurrency();
      const value = JSON.parse(res['getExchangeCurrencyResult']);
      const { exchangeList, currencies } = get();
      const newCurrencyList = [];
      const newCurrencies = [...currencies];
      value.forEach((v) => {
        if (exchangeList.includes(v.Exchange)) {
          newCurrencyList.push(v);
          if (!newCurrencies.includes(v.Currency))
            newCurrencies.push(v.Currency);
        }
      });
      const { selectedCurrency } = get();
      const symbol = newCurrencyList.find((i) => i.Currency === selectedCurrency);
      set({
        currencyList: newCurrencyList,
        currencies: newCurrencies,
        ...(symbol ? { currencySymbol: symbol.Symbol } : {}),
      });
      await get().getCurrencyPrice();
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getCurrencyPrice: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const res = await getCurrencyPrice();
      const data = JSON.parse(res['GetCurrencyConversionPriceResult']);
      const { currencyList, currencies } = get();
      const conversionPriceList = [];
      data.forEach((item) => {
        const exchanges = currencyList
          .filter((obj) => obj.Currency === item.BaseCurrency)
          .map((obj) => obj.Exchange);
        if (exchanges.length > 0 && currencies.includes(item.TargetCurrency)) {
          conversionPriceList.push({ ...item, BaseExchanges: exchanges });
        }
      });
      set({ conversionPriceList });
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getMappedUsers: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const data = await getMappedUsers();
      const Result = data['GetMappedUsersResult'];
      if (Result) set({ MappedUsers: JSON.parse(Result) });
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getCustomerAccountMappings: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const data = await getCustomerAccountMappings();
      const result = JSON.parse(data['GetCustomerAccountMappingsResult']);
      if (!get().hasCustomerGrouping) {
        set({ CustomerAccounts: result });
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  attachCustomerInfo: () => {
    const { positions, CustomerAccounts } = get();
    if (!CustomerAccounts?.length) return;

    // TEMP DEBUG
    // console.log('=== CustomerAccounts DEBUG ===');
    // console.log('Total CustomerAccounts:', CustomerAccounts.length);
    // console.log('All Category1 values:', [...new Set(CustomerAccounts.map(ca => ca.Category1))]);
    // console.log('M01 search:', CustomerAccounts.filter(ca => JSON.stringify(ca).toLowerCase().includes('m01')));
    // console.log('MANS01 search:', CustomerAccounts.filter(ca => JSON.stringify(ca).toLowerCase().includes('mans01')));
    // console.log('==============================');

//     const unmatchedUsers = [];
// for (const user in positions) {
//   const pos = positions[user];
//   let found = false;
//   for (const tradeKey in pos.tradesMap) {
//     const account = pos.tradesMap[tradeKey].Account;
//     if (!account) continue;
//     const match = CustomerAccounts.find((ca) => ca.Account && ca.Account.includes(account));
//     if (match) { found = true; break; }
//   }
//   if (!found) unmatchedUsers.push({
//     user,
//     accounts: [...new Set(Object.values(pos.tradesMap).map(t => t.Account))]
//   });
// }
// console.log('Unmatched users:', unmatchedUsers);

// const cat1Values = [...new Set(CustomerAccounts.map(ca => ca.Category1))];
// console.log('Available Category1 groups:', cat1Values);

    const updated = { ...positions };

    for (const user in updated) {
      const pos = updated[user];

      // Log the first account from this user's trades
      const firstTradeKey = Object.keys(pos.tradesMap)[0];
      // if (firstTradeKey) {
      //   console.log(`User: ${user} | Trade account: "${pos.tradesMap[firstTradeKey].Account}"`);
      // }

      let customerInfo = { Category1: 'Unassigned', Category2: 'Unassigned' };

      for (const tradeKey in pos.tradesMap) {
        const account = pos.tradesMap[tradeKey].Account;
        if (!account) continue;

        const match = CustomerAccounts.find((ca) =>
          ca.Account && (
            ca.Account === account ||
            ca.Account.startsWith(account + ',') ||
            ca.Account.endsWith(',' + account) ||
            ca.Account.includes(',' + account + ',')
          )
        );

        // Log whether match was found for this account
        // console.log(`  → account "${account}" match:`, match || 'NOT FOUND');

        if (match) {
          customerInfo = {
            Category1: match.Category1 || 'Unassigned',
            Category2: match.Category2 || 'Unassigned',
          };
          break;
        }
      }

      updated[user] = { ...pos, ...customerInfo };
    }

    set({ positions: updated });
  },

  getAllTrades: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const response = await getAllTrades();
      const Result = response['GetCombinedTradeDataForMobileResult'];
      if (Result) {
        const Value = JSON.parse(Result);

        const previousDayTrades = Value.filter((i) => i.TradeType == 1);
        get().calculatePositions(previousDayTrades, 1);

        const currentDayTrades = Value.filter((i) => i.TradeType == 2);
        get().calculatePositions(currentDayTrades, 2);
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getClosePrices: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const response = await getClosePrices();
      const Result = response['GetClosePriceResult'];
      if (Result) set({ ClosePrices: JSON.parse(Result) });
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getLTP: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const response = await getLTP();
      const Result = response['GetLTPResult'];
      if (Result) {
        set({ LTP_Data: JSON.parse(Result) });
      } else {
        set({ error: 'No LTP data available' });
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getMarginRisk: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const response = await getMargins();
      const Result = response['GetMarginRiskResult'];
      if (Result) {
        const margin = JSON.parse(Result);
        const nifty = margin.find((i) => i.Contract === 'NIFTY' && i.Exchange === 'NSEFO');
        const bnf = margin.find((i) => i.Contract === 'BANKNIFTY' && i.Exchange === 'NSEFO');
        const gift = margin.find((i) => i.Contract === 'G-NIF' && i.Exchange === 'IFSC');

        const updates = { MarginRisk: margin };
        if (nifty) updates.NiftySecurityId = nifty.SecurityId;
        if (bnf) updates.BankNiftySecurityId = bnf.SecurityId;
        if (gift) updates.GiftNiftySecurityId = gift.SecurityId;

        const { LTP_Data } = get();
        if (Array.isArray(LTP_Data)) {
          const l1 = LTP_Data.find((i) => i.SecurityId === updates.NiftySecurityId);
          const l2 = LTP_Data.find((i) => i.SecurityId === updates.BankNiftySecurityId);
          const l3 = LTP_Data.find((i) => i.SecurityId === updates.GiftNiftySecurityId);
          if (l1) updates.globalNiftyLtp = l1.LTP;
          if (l2) updates.globalBnfLtp = l2.LTP;
          if (l3) updates.giftNiftyLtp = l3.LTP;
        }
        set(updates);
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  getOpenPrices: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const response = await getOpenPrices();
      const Result = response['GetOpenPriceResult'];
      if (Result) {
        const Value = JSON.parse(Result);
        const { NiftySecurityId, BankNiftySecurityId, GiftNiftySecurityId } = get();
        const updates = { OpenPrices: Value };
        const n = Value.find((o) => o.SecurityId == NiftySecurityId);
        const b = Value.find((o) => o.SecurityId == BankNiftySecurityId);
        const g = Value.find((o) => o.SecurityId === GiftNiftySecurityId);
        if (n) updates.globalNiftyOpenPrice = n.OpenPrice;
        if (b) updates.globalBnfOpenPrice = b.OpenPrice;
        if (g) updates.giftNiftyOpenPrice = g.OpenPrice;
        set(updates);
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  // ── Margin API calls ────────────────────────────────────────────────────────

  fetchReferenceRate: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const res = await getReferenceRate();
      // Angular: const Result = bodyValue["GetReferenceRateResult"]; — a plain number
      const Result = res['GetReferenceRateResult'];
      if (Result !== undefined && Result !== null) {
        set({ referenceRate: Number(Result) });
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  fetchSpanMargin: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const data = await getCurrentSpanMargin();
      // Angular: const result = JSON.parse(bodyValue["GetCurrentSpanMarginResult"]);
      const Result = data['GetCurrentSpanMarginResult'];
      if (Result) {
        const parsed = JSON.parse(Result);
        // Batch load — replaces entire SpanMap (matches getSpanMarginNew2)
        get().applySpanMarginBatch(parsed);
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  fetchMarginFromUser: async () => {
    set((state) => ({ pendingRequests: state.pendingRequests + 1, error: null }));
    try {
      const data = await getMarginFromUser();
      // Angular: const result = dataValue["GetAssignedMarginResult"];
      const Result = data['GetAssignedMarginResult'];
      if (Result) {
        const value = JSON.parse(Result);
        set({ userMargin: value });
        // Re-run margin distribution so MarginPer updates with new available amounts
        get().updateSpanMargin(get().SpanMap);
      }
    } catch (err) {
      set({ error: err.message });
    } finally {
      set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) }));
    }
  },

  fetchCustomGrouping: async (port) => {
    try {
      const loginUser = sessionStorage.getItem('UserName');
      const data = await getUserProfile(loginUser, port);
      const entry = data?.find(v => v.ProfileName === 'CustomGrouping');
      // console.log('fetchCustomGrouping entry:', entry);
      if (entry) {
        const parsed = JSON.parse(entry.ProfileValue || '[]');
        set({ customGrouping: parsed });
      }
    } catch (err) {
      console.error('Failed to fetch custom grouping:', err);
    }
  },

  saveCustomGrouping: async (groups, port) => {
    try {
      await editUserProfile(port, 'CustomGrouping', JSON.stringify(groups));
      set({ customGrouping: groups });
    } catch (err) {
      console.error('Failed to save custom grouping:', err);
    }
  },

  fetchCustomColumns: async (port) => {
    try {
      const loginUser = sessionStorage.getItem('UserName');
      const data = await getUserProfile(loginUser, port);
      const entry = data?.find(v => v.ProfileName === 'CustomColumns');
      if (entry) {
        const parsed = JSON.parse(entry.ProfileValue || 'null');
        set({ customColumns: parsed });
      } else {
        set({ customColumns: {} }); // no saved prefs yet
      }
    } catch (err) {
      console.error('Failed to fetch custom columns:', err);
      set({ customColumns: {} });
    }
  },

  saveCustomColumns: async (order, hidden, port) => {
    try {
      const payload = { order, hidden: Array.from(hidden) };
      await editUserProfile(port, 'CustomColumns', JSON.stringify(payload));
      set({ customColumns: payload });
    } catch (err) {
      console.error('Failed to save custom columns:', err);
    }
  },

  // ── applySpanMarginBatch — replaces entire SpanMap, matches getSpanMarginNew2 ─
  // Called on: initial load, reconnect refresh, Type 5 batch socket message
  applySpanMarginBatch: (dataArray) => {
    if (!Array.isArray(dataArray)) return;
    const newSpanMap = dataArray.map((el) => ({
      user: el['Username'],
      ctcl: el['ctcl'],
      exch: el['Exch'],
      spanMargin: el['Span'],
      exposureMargin: el['Exposure'],
      totalMargin: +el['TotalMargin'],
      maxMargin: el['Maxmargin'],
    }));
    set({ SpanMap: newSpanMap });
    get().updateSpanMargin(newSpanMap);
  },

  // ── applySpanMarginSingle — merges one entry into SpanMap, matches getSpanMarginNew ─
  // Called on: Type 5 single socket message
  applySpanMarginSingle: (data) => {
    if (!data) return;
    const userName = data['Username'];
    const ctcl = data['ctcl'];
    const exchange = data['Exch'];

    const { SpanMap } = get();
    const updatedSpanMap = [...SpanMap];

    const existingIdx = updatedSpanMap.findIndex(
      (entry) => entry.user === userName && entry.ctcl === ctcl && entry.exch === exchange
    );

    if (existingIdx !== -1) {
      updatedSpanMap[existingIdx] = {
        ...updatedSpanMap[existingIdx],
        spanMargin: data['Span'],
        exposureMargin: data['Exposure'],
        totalMargin: +data['TotalMargin'],
        maxMargin: data['Maxmargin'],
      };
    } else {
      updatedSpanMap.push({
        user: userName,
        ctcl: ctcl,
        exch: exchange,
        spanMargin: data['Span'],
        exposureMargin: data['Exposure'],
        totalMargin: +data['TotalMargin'],
        maxMargin: data['Maxmargin'],
      });
    }

    set({ SpanMap: updatedSpanMap });
    get().updateSpanMargin(updatedSpanMap);
  },

  // ── updateSpanMargin — distributes SpanMap entries into each position ────────
  // Mirrors Angular's updateSpanMargin exactly:
  //   NSEFO  → nseMarginAbs + nseMarginMax
  //   BSEED  → bseMarginAbs + bseMarginMax
  //   IFSC   → ifscMarginAbs
  //   totalMargin = ifscMarginAbs * referenceRate + nseMarginAbs + premiumBuy
  //   MarginPer   = (nseMarginAbs / availableMargin) * 100
  updateSpanMargin: (spanMap) => {
    const { positions, userMargin, referenceRate } = get();

    if (!spanMap || spanMap.length === 0) return;
    if (!positions || Object.keys(positions).length === 0) return;

    const updated = { ...positions };

    for (const user in updated) {
      const pos = updated[user];

      // Reset all margin fields before re-summing
      let nseMarginAbs = 0;
      let nseMarginMax = 0;
      let bseMarginAbs = 0;
      let bseMarginMax = 0;
      let ifscMarginAbs = 0;
      const userSpanEntries = [];

      for (const entry of spanMap) {
        if (entry.user !== user) continue;
        userSpanEntries.push(entry);

        if (entry.exch === 'NSEFO') {
          nseMarginAbs += entry.totalMargin;
          nseMarginMax += entry.maxMargin;
        } else if (entry.exch === 'BSEED') {
          bseMarginAbs += entry.totalMargin;
          bseMarginMax += entry.maxMargin;
        } else if (entry.exch === 'IFSC') {
          ifscMarginAbs += entry.totalMargin;
        }
      }

      // premiumBuy — sum across all trades in tradesMap
      // Matches Angular's calculateTotalValues() premBuy accumulation
      let premiumBuy = 0;
      for (const tradeKey in pos.tradesMap) {
        premiumBuy += calcTradePremiumBuy(pos.tradesMap[tradeKey]);
      }

      const totalMargin = ifscMarginAbs * referenceRate + nseMarginAbs + premiumBuy;

      // MarginPer: nseMarginAbs as % of available margin assigned to this user
      let MarginPer = 0;
      const userMarginEntry = userMargin.find((i) => i.Name === user);
      if (userMarginEntry && userMarginEntry.Amount > 0) {
        MarginPer = parseFloat(
          ((nseMarginAbs / userMarginEntry.Amount) * 100).toFixed(2)
        );
      }

      updated[user] = {
        ...pos,
        nseMarginAbs,
        nseMarginMax,
        bseMarginAbs,
        bseMarginMax,
        ifscMarginAbs,
        totalMargin,
        premiumBuy,
        MarginPer,
        spanEntries: userSpanEntries, // kept for future tooltip drill-down
      };
    }

    set({ positions: updated });
  },

  // ── applyLtpUpdate — throttled to max 10 renders/sec ─────────────────────────
  _pendingLtpMap: {},
  _ltpTimer: null,

  applyLtpUpdate: (ltpUpdateMap) => {
    const s = get();
    Object.assign(s._pendingLtpMap, ltpUpdateMap);
    if (s._ltpTimer) return;
    s._ltpTimer = setTimeout(() => {
      const s2 = get();
      const batch = { ...s2._pendingLtpMap };
      s2._pendingLtpMap = {};
      s2._ltpTimer = null;
      get()._applyLtpBatch(batch);
    }, 100);
  },

  _applyLtpBatch: (ltpUpdateMap) => {
    const { positions, securityToUsers } = get();

    const relevantSecurityIds = Object.keys(ltpUpdateMap).filter(
      (secId) => securityToUsers[secId] && securityToUsers[secId].size > 0
    );
    if (relevantSecurityIds.length === 0) return;

    const affectedUsers = new Set();
    relevantSecurityIds.forEach((secId) => {
      securityToUsers[secId].forEach((u) => affectedUsers.add(u));
    });

    const today = new Date();
    const todayNum =
      today.getFullYear() * 10000 +
      (today.getMonth() + 1) * 100 +
      today.getDate();

    const updatedPositions = { ...positions };
    let anyChange = false;

    for (const user of affectedUsers) {
      const pos = positions[user];
      if (!pos) continue;

      let userChanged = false;
      const newTradesMap = { ...pos.tradesMap };

      for (const tradeKey in pos.tradesMap) {
        const trade = pos.tradesMap[tradeKey];
        const secKey = `${trade.SecurityId}_${trade.SecurityExchange}`;
        const tick = ltpUpdateMap[secKey];
        if (!tick) continue;

        const newLtp = tick.ltp ?? tick.LTP ?? 0;
        if (newLtp === trade.Ltp) continue;

        const refreshed = { ...trade, Ltp: newLtp };
        const { pnl, cumPnl } = calculatePnl(refreshed, newLtp, todayNum);
        const mtm = calculateMtm(refreshed, newLtp);

        newTradesMap[tradeKey] = { ...refreshed, Pnl: pnl, cumPnl, MTM: mtm };
        userChanged = true;
      }

      if (userChanged) {
        updatedPositions[user] = { ...pos, tradesMap: newTradesMap };
        anyChange = true;
      }
    }

    // ── DIAGNOSTIC ─────────────────────────────────────────────────
    const diagUsers = Object.keys(updatedPositions).slice(0, 2);
    diagUsers.forEach(user => {
      if (updatedPositions[user] === positions[user]) return;
      const newTrades = Object.values(updatedPositions[user].tradesMap)
        .filter(t => t.NetPos !== 0)
        .slice(0, 2);
      // console.group(`[DIAG] After LTP socket update — user: ${user}`);
      newTrades.forEach(t => {
        const oldTrade = positions[user]?.tradesMap[
          Object.keys(positions[user].tradesMap).find(k =>
            positions[user].tradesMap[k].Symbol === t.Symbol
          )
        ];
        // console.log(`  Symbol:      ${t.Symbol}`);
        // console.log(`  LTP:         ${oldTrade?.Ltp} → ${t.Ltp}`);
        // console.log(`  Open_price:  ${t.Open_price}`);
        // console.log(`  SOD_BuyQty:  ${t.SOD_BuyQty}`);
        // console.log(`  SOD_SellQty: ${t.SOD_SellQty}`);
        // console.log(`  BuyQty:      ${t.BuyQty}`);
        // console.log(`  SellQty:     ${t.SellQty}`);
        // console.log(`  NetPos:      ${t.NetPos}`);
        // console.log(`  Pnl:         ${oldTrade?.Pnl} → ${t.Pnl}`);
        // console.log(`  cumPnl:      ${oldTrade?.cumPnl} → ${t.cumPnl}`);
        // console.log(`  MTM:         ${oldTrade?.MTM} → ${t.MTM}`);
      });
      console.groupEnd();
    });
    // ── END DIAGNOSTIC ─────────────────────────────────────────────

    if (anyChange) set({ positions: updatedPositions });
  },

  // ── calculatePositions ──────────────────────────────────────────────────────
  calculatePositions: (trades, type) => {
    const { MappedUsers, LTP_Data } = get();

    const getWeekKey = (symbol) => {
      const suffix = symbol.slice(-2);
      return /^W[1-5]$/.test(suffix) ? suffix.toLowerCase() : 'w';
    };

    const getBucketKey = (trade) => {
      const { SecurityType, Optiontype, Symbol, SecurityExchange } = trade;
      if (SecurityType === 'FUT') {
        if (SecurityExchange === 'IFSC') return 'stocks';
        if (Symbol === 'NIFTY') return 'niftyFut';
        if (Symbol === 'BANKNIFTY') return 'bnfFut';
        return 'stocks';
      }
      if (SecurityType === 'OPT') {
        const week = getWeekKey(Symbol);
        if (Optiontype === 'CE') return `c${week}`;
        if (Optiontype === 'PE') return `p${week}`;
      }
      return 'stocks';
    };

    const { CustomerAccounts } = get();

    const getAccountCustomer = (account) => {
      if (!account || !CustomerAccounts?.length) return null;
      return CustomerAccounts.find((ca) =>
        ca.Account && (
          ca.Account === account ||
          ca.Account.startsWith(account + ',') ||
          ca.Account.endsWith(',' + account) ||
          ca.Account.includes(',' + account + ',')
        )
      ) || null;
    };

    const createPosition = (user, account) => {
      const match = account ? getAccountCustomer(account) : null;
      return {
      user,
      Category1: match ? (match.Category1 || 'Unassigned') : 'Unassigned',
      Category2: match ? (match.Category2 || 'Unassigned') : 'Unassigned',
      tradesMap: {},
      niftyFut: 0, bnfFut: 0,
      cw: 0, cw1: 0, cw2: 0, cw3: 0, cw4: 0, cw5: 0,
      pw: 0, pw1: 0, pw2: 0, pw3: 0, pw4: 0, pw5: 0,
      totalC: 0, totalP: 0,
      stocks: 0,
      // Margin fields — populated by updateSpanMargin after trades load
      nseMarginAbs: 0,
      nseMarginMax: 0,
      bseMarginAbs: 0,
      bseMarginMax: 0,
      ifscMarginAbs: 0,
      totalMargin: 0,
      premiumBuy: 0,
      MarginPer: 0,
      spanEntries: [],
    }};

    const createTrade = (trade, ltp, tradeType) => {
      const buyQty = trade.TotalQtyBuy || 0;
      const sellQty = trade.TotalQtySell || 0;
      const buyPrice = trade.AvgBuyPrice || 0;
      const sellPrice = trade.AvgSellPrice || 0;

      const SOD_BuyQty = tradeType === 1 ? buyQty : 0;
      const SOD_SellQty = tradeType === 1 ? sellQty : 0;
      const SOD_BuyPrice = tradeType === 1 ? buyPrice : 0;
      const SOD_SellPrice = tradeType === 1 ? sellPrice : 0;
      const SOD_Qty = SOD_BuyQty + SOD_SellQty;
      const SOD_Price = SOD_Qty > 0 ? SOD_BuyPrice : SOD_Qty < 0 ? SOD_SellPrice : 0;

      const BuyQty = tradeType === 2 ? buyQty : 0;
      const SellQty = tradeType === 2 ? sellQty : 0;
      const BuyPrice = tradeType === 2 ? buyPrice : 0;
      const SellPrice = tradeType === 2 ? sellPrice : 0;
      const IntraQty = BuyQty + SellQty;
      const IntraPrice = IntraQty > 0 ? BuyPrice : IntraQty < 0 ? SellPrice : 0;

      return {
        Account: trade.Account,
        CTCLId: trade.CTCLId,
        BrokerAcc: trade.BrokerAcc,
        SecurityExchange: trade.SecurityExchange,
        Symbol: trade.Symbol,
        Expiry: trade.Expiry,
        SecurityId: trade.SecurityId,
        SecurityType: trade.SecurityType,
        Optiontype: trade.Optiontype,
        StrikePrice: trade.StrikePrice,
        Lot_size: trade.Lot_size,
        SOD_BuyQty, SOD_SellQty, SOD_BuyPrice, SOD_SellPrice,
        SOD_Qty, SOD_Price,
        BuyQty, SellQty, BuyPrice, SellPrice,
        IntraQty, IntraPrice,
        NetPos: SOD_Qty + IntraQty,
        Open_price: trade.Open_price || 0,
        Close_price: trade.Close_price || 0,
        Ltp: ltp,
        Pnl: 0, cumPnl: 0, MTM: 0,
      };
    };

    let positions;
    if (type === 1) {
      positions = {};
    } else {
      const existing = get().positions;
      positions = {};
      for (const user in existing) {
        positions[user] = {
          ...existing[user],
          tradesMap: { ...existing[user].tradesMap },
        };
      }
    }

    const ltpMap = {};
    LTP_Data.forEach((item) => {
      ltpMap[`${item.SecurityId}_${item.Exchange}`] = item.LTP ?? 0;
    });

    const today = new Date();
    const todayNum =
      today.getFullYear() * 10000 +
      (today.getMonth() + 1) * 100 +
      today.getDate();

    let normalizedTrades = trades;
    if (type === 2) {
      normalizedTrades = [];
      for (const trade of trades) {
        if (trade.MappedUsers && trade.MappedUsers.length > 1) {
          for (const mappedUser of trade.MappedUsers) {
            normalizedTrades.push({ ...trade, USER: mappedUser });
          }
        } else {
          normalizedTrades.push(trade);
        }
      }
    }

    // securityToUsers index — rebuilt fresh for type 1, extended for type 2
    const securityToUsers = type === 1 ? {} : { ...get().securityToUsers };

    for (const trade of normalizedTrades) {
      const user = trade.USER;
      if (!user || !MappedUsers.includes(user)) continue;

      if (type === 1) {
        const netQty = (trade.TotalQtyBuy || 0) + (trade.TotalQtySell || 0);
        if (netQty === 0) continue;
      }

     if (!positions[user]) positions[user] = createPosition(user, trade.Account);

      if (positions[user] &&
          positions[user].Category1 === 'Unassigned' &&
          trade.Account) {
        const match = getAccountCustomer(trade.Account);
        if (match) {
          positions[user].Category1 = match.Category1 || 'Unassigned';
          positions[user].Category2 = match.Category2 || 'Unassigned';
        }
      }

      const ltp = ltpMap[`${trade.SecurityId}_${trade.SecurityExchange}`] ?? 0;
      const tradeKey = `${trade.Account}_${trade.SecurityExchange}_${trade.SecurityId}`;
      // TEMP DIAG
      if (trade.SecurityExchange === 'IFSC' && trade.Symbol === 'NIFTY') {
        // console.log('[IFSC DIAG] raw trade.SecurityId:', trade.SecurityId, 'type:', typeof trade.SecurityId, 'ltp from ltpMap:', ltp);
        // console.log('[IFSC DIAG] ltpMap keys sample:', Object.keys(ltpMap).slice(0, 5));
        // console.log('[IFSC DIAG] ltpMap["1102"]:', ltpMap['1102'], 'ltpMap[1102]:', ltpMap[1102]);
      }
      const bucketKey = getBucketKey(trade);
      const existing = positions[user].tradesMap[tradeKey];

      let previousNetPos = 0;
      let newNetPos = 0;
      let finalTrade;

      if (existing) {
        previousNetPos = existing.NetPos;

        if (type === 1) {
          const SOD_BuyQty = existing.SOD_BuyQty + (trade.TotalQtyBuy || 0);
          const SOD_SellQty = existing.SOD_SellQty + (trade.TotalQtySell || 0);
          const SOD_BuyPrice = trade.AvgBuyPrice || existing.SOD_BuyPrice;
          const SOD_SellPrice = trade.AvgSellPrice || existing.SOD_SellPrice;
          const SOD_Qty = SOD_BuyQty + SOD_SellQty;
          const SOD_Price = SOD_Qty > 0 ? SOD_BuyPrice : SOD_Qty < 0 ? SOD_SellPrice : 0;

          finalTrade = {
            ...existing,
            SOD_BuyQty, SOD_SellQty, SOD_BuyPrice, SOD_SellPrice,
            SOD_Qty, SOD_Price,
            NetPos: SOD_Qty,
            Ltp: ltp,
          };
        } else {
          const BuyQty = trade.TotalQtyBuy || 0;
          const SellQty = trade.TotalQtySell || 0;
          const BuyPrice = trade.AvgBuyPrice || 0;
          const SellPrice = trade.AvgSellPrice || 0;
          const IntraQty = BuyQty + SellQty;
          const IntraPrice = IntraQty > 0 ? BuyPrice : IntraQty < 0 ? SellPrice : 0;

          finalTrade = {
            ...existing,
            BuyQty, SellQty, BuyPrice, SellPrice,
            IntraQty, IntraPrice,
            NetPos: existing.SOD_Qty + IntraQty,
            Ltp: ltp,
          };
        }
      } else {
        finalTrade = createTrade(trade, ltp, type);
      }

      const { pnl, cumPnl } = calculatePnl(finalTrade, ltp, todayNum);
      const mtm = calculateMtm(finalTrade, ltp);
      finalTrade = { ...finalTrade, Pnl: pnl, cumPnl, MTM: mtm };

      newNetPos = finalTrade.NetPos;
      positions[user].tradesMap[tradeKey] = finalTrade;
      positions[user][bucketKey] =
        (positions[user][bucketKey] || 0) - previousNetPos + newNetPos;

      const p = positions[user];
      p.totalC = (p.cw||0)+(p.cw1||0)+(p.cw2||0)+(p.cw3||0)+(p.cw4||0)+(p.cw5||0);
      p.totalP = (p.pw||0)+(p.pw1||0)+(p.pw2||0)+(p.pw3||0)+(p.pw4||0)+(p.pw5||0);

      // Register this user against this SecurityId for LTP relevance filtering
      const secKey = `${trade.SecurityId}_${trade.SecurityExchange}`;
      if (!securityToUsers[secKey]) securityToUsers[secKey] = new Set();
      securityToUsers[secKey].add(user);
    }

    set({ positions, securityToUsers });

    // ── DIAGNOSTIC ─────────────────────────────────────────────────
    if (type === 2) {
      const diagUsers = Object.keys(positions).slice(0, 2);
      diagUsers.forEach(user => {
        const trades = Object.values(positions[user].tradesMap)
          .filter(t => t.NetPos !== 0)
          .slice(0, 2);
        // console.group(`[DIAG] After calculatePositions — user: ${user}`);
        // trades.forEach(t => {
        //   console.log(`  Symbol:       ${t.Symbol}`);
        //   console.log(`  LTP:          ${t.Ltp}`);
        //   console.log(`  Open_price:   ${t.Open_price}`);
        //   console.log(`  Close_price:  ${t.Close_price}`);
        //   console.log(`  SOD_BuyQty:   ${t.SOD_BuyQty}`);
        //   console.log(`  SOD_SellQty:  ${t.SOD_SellQty}`);
        //   console.log(`  SOD_BuyPrice: ${t.SOD_BuyPrice}`);
        //   console.log(`  SOD_SellPrice:${t.SOD_SellPrice}`);
        //   console.log(`  BuyQty:       ${t.BuyQty}`);
        //   console.log(`  SellQty:      ${t.SellQty}`);
        //   console.log(`  BuyPrice:     ${t.BuyPrice}`);
        //   console.log(`  SellPrice:    ${t.SellPrice}`);
        //   console.log(`  NetPos:       ${t.NetPos}`);
        //   console.log(`  Pnl:          ${t.Pnl}`);
        //   console.log(`  cumPnl:       ${t.cumPnl}`);
        //   console.log(`  MTM:          ${t.MTM}`);
        // });
        console.groupEnd();
      });
    }
    // ── END DIAGNOSTIC ─────────────────────────────────────────────

    // If SpanMap already has data (e.g. refreshTrades ran margin before trades),
    // re-apply it so new positions get their margin fields populated immediately
    const { SpanMap } = get();
    if (SpanMap.length > 0) {
      get().updateSpanMargin(SpanMap);
    }
  },

  // ── Reset ───────────────────────────────────────────────────────────────────
  reset: () => {
    set({
      pendingRequests: 0,
      error: null,
      showColumns: [],
      grouping: [],
      exchangeList: [],
      currencyList: [],
      currencies: [],
      selectedCurrency: '',
      currencySymbol: '',
      conversionPriceList: [],
      MappedUsers: [],
      CustomerAccounts: [],
      positions: {},
      securityToUsers: {},
      SpanMap: [],
      userMargin: [],
      referenceRate: 1,
      isSocketConnected: false,
      hasConnectedOnce: false,
      sessionExpired: false,
      hasCustomerGrouping: false,
      customGrouping: [],
      customColumns: null,
    });
  },
})));

if (typeof window !== 'undefined') {
  window._dataStore = useDataStore;
}