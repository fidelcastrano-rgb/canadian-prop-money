'use client';

import { useState, useEffect } from 'react';
import { 
  Package, Search, ShieldAlert, CheckCircle, RefreshCw, Trash2, 
  Mail, Settings, DollarSign, Filter, ChevronDown, Check, X, AlertTriangle, Info,
  Send, History, Shield, Lock
} from 'lucide-react';

interface Customer {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
}

interface StatusHistory {
  id: string;
  status: string;
  created_at: string;
}

interface Order {
  id: string;
  order_number: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  customer: Customer;
  items: OrderItem[];
  history: StatusHistory[];
  email_logs: any[];
  payment_instructions?: string | null;
  email_history?: string | null;
  email_sent_at?: string | null;
  last_email_subject?: string | null;
  payment_deadline?: string | null;
}

interface PaymentMethod {
  id: string;
  name: string;
  enabled: number;
  instructions: string;
}

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Payment methods edit panel
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [editingInstructions, setEditingInstructions] = useState('');

  // Floating notifications
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Individual order payment instructions editing state
  const [editingOrdersInstructions, setEditingOrdersInstructions] = useState<{ [orderId: string]: string }>({});
  const [editingSubjects, setEditingSubjects] = useState<{ [orderId: string]: string }>({});
  const [editingPaymentMethods, setEditingPaymentMethods] = useState<{ [orderId: string]: string }>({});
  const [editingPaymentDeadlines, setEditingPaymentDeadlines] = useState<{ [orderId: string]: string }>({});

  // Reload trigger
  const [refreshCount, setRefreshCount] = useState(0);

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      const savedToken = sessionStorage.getItem('cpm_admin_passcode');
      if (!savedToken) return false;
    }
    return null;
  });
  const [typedCode, setTypedCode] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Validate admin token
  useEffect(() => {
    const savedToken = sessionStorage.getItem('cpm_admin_passcode');
    if (savedToken) {
      const checkToken = async () => {
        try {
          const res = await fetch('/api/admin/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: savedToken })
          });
          if (res.ok) {
            setIsAuthenticated(true);
          } else {
            sessionStorage.removeItem('cpm_admin_passcode');
            setIsAuthenticated(false);
          }
        } catch {
          setIsAuthenticated(false);
        }
      };
      checkToken();
    } else {
      setTimeout(() => {
        setIsAuthenticated(false);
      }, 0);
    }
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckingAuth(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typedCode })
      });
      if (res.ok) {
        sessionStorage.setItem('cpm_admin_passcode', typedCode);
        setIsAuthenticated(true);
      } else {
        const d = await res.json();
        setLoginError(d.message || 'Invalid passcode credential.');
      }
    } catch {
      setLoginError('Authentication service unreachable.');
    } finally {
      setCheckingAuth(false);
    }
  };

  // Load orders and payment methods
  useEffect(() => {
    if (isAuthenticated !== true) return;
    async function fetchAdminData() {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (searchQuery) queryParams.set('search', searchQuery);
        if (statusFilter && statusFilter !== 'all') queryParams.set('status', statusFilter);

        const [oRes, pRes] = await Promise.all([
          fetch(`/api/admin/orders?${queryParams.toString()}`),
          fetch('/api/payment-methods')
        ]);

        if (oRes.ok) {
          const oData = await oRes.json();
          setOrders(oData);
        }
        if (pRes.ok) {
          const pData = await pRes.json();
          setPaymentMethods(pData);
        }
      } catch (err) {
        console.error('Failed to query admin datasets:', err);
        setErrorMsg('Database query error. Connection dropped.');
      } finally {
        setLoading(false);
        setLoadingMethods(false);
      }
    }
    fetchAdminData();
  }, [searchQuery, statusFilter, refreshCount, isAuthenticated]);

  const triggerNotify = (text: string, isError = false) => {
    if (isError) {
      setErrorMsg(text);
      setTimeout(() => setErrorMsg(''), 5000);
    } else {
      setSuccessMsg(text);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  };

  // 1. Action: update order status
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          orderId,
          status: newStatus
        })
      });

      if (res.ok) {
        const responseData = await res.json();
        triggerNotify(responseData.message || `Order status updated to ${newStatus}`);
        setRefreshCount(prev => prev + 1);
      } else {
        triggerNotify('Failed to update order status', true);
      }
    } catch (err) {
      console.error(err);
      triggerNotify('Network error updated billing status', true);
    }
  };

  // 2. Action: resend customer confirmation email
  const handleResendEmail = async (orderId: string) => {
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend_email',
          orderId
        })
      });

      if (res.ok) {
        const responseData = await res.json();
        triggerNotify(responseData.message || 'Email successfully queued is dispatching.');
        setRefreshCount(prev => prev + 1);
      } else {
        triggerNotify('Resend email failed.', true);
      }
    } catch (err) {
      console.error(err);
      triggerNotify('Network error re-sending dispatch email', true);
    }
  };

  // Action: Save all customized parameters inside D1 database on request
  const handleSaveAllValues = async (orderId: string, instructions: string, paymentMethod: string, paymentDeadline: string) => {
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_all_payment_fields',
          orderId,
          paymentInstructions: instructions,
          paymentMethod,
          paymentDeadline
        })
      });

      if (res.ok) {
        triggerNotify('All customized transaction settings saved in D1 ledger.');
        setRefreshCount(prev => prev + 1);
      } else {
        triggerNotify('Failed to save customized parameters.', true);
      }
    } catch (err) {
      console.error(err);
      triggerNotify('Network error saving customized variables.', true);
    }
  };

  // Action: Send or Resend payment instructions email via Resend
  const handleSendPaymentInstructions = async (
    orderId: string, 
    instructions: string, 
    subject: string, 
    paymentMethod: string, 
    paymentDeadline: string
  ) => {
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_payment_instructions',
          orderId,
          paymentInstructions: instructions,
          subject,
          paymentMethod,
          paymentDeadline
        })
      });

      if (res.ok) {
        const data = await res.json();
        triggerNotify(data.message || 'Payment instructions emailed.');
        setRefreshCount(prev => prev + 1);
      } else {
        triggerNotify('Failed to dispatch payment instructions.', true);
      }
    } catch (err) {
      console.error(err);
      triggerNotify('Network error emailing payment instructions.', true);
    }
  };

  // 3. Action: Delete and purge order records
  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    if (!window.confirm(`⚠️ ARE YOU ABSOLUTELY SURE you want to delete order ${orderNumber}?\nThis action is irreversible and purges all items records and history logs from D1 database.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_order',
          orderId
        })
      });

      if (res.ok) {
        triggerNotify(`Order ${orderNumber} purged successfully.`);
        setRefreshCount(prev => prev + 1);
      } else {
        triggerNotify('Critical deletion error.', true);
      }
    } catch (err) {
      console.error(err);
      triggerNotify('Network error deleting order records', true);
    }
  };

  // 4. Action: Toggle payment method active/inactive
  const handleTogglePaymentMethod = async (method: PaymentMethod) => {
    try {
      const res = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: method.id,
          enabled: method.enabled === 1 ? 0 : 1,
          instructions: method.instructions
        })
      });

      if (res.ok) {
        triggerNotify(`Toggled payment method ${method.name}`);
        setRefreshCount(prev => prev + 1);
      } else {
        triggerNotify('Failed to toggle active payments', true);
      }
    } catch (err) {
      console.error(err);
      triggerNotify('Network error toggling payments', true);
    }
  };

  // 5. Action: Update payment instructions text
  const handleEditInstructionsSubmit = async (methodId: string) => {
    try {
      const res = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: methodId,
          enabled: 1, // Auto-enable if admin modifies instructions
          instructions: editingInstructions
        })
      });

      if (res.ok) {
        triggerNotify(`Instructions updated successfully.`);
        setEditingMethodId(null);
        setRefreshCount(prev => prev + 1);
      } else {
        triggerNotify('Failed to save configuration details.', true);
      }
    } catch (err) {
      console.error(err);
      triggerNotify('Network error saving configurations.', true);
    }
  };

  // Statistics calculation
  const totalRevenue = orders.reduce((sum, o) => o.status !== 'Cancelled' ? sum + o.total : sum, 0);
  const activeEnquiries = orders.filter(o => o.status === 'Pending').length;
  const dispatchCompleted = orders.filter(o => o.status === 'Completed').length;
  const avgOrderValue = orders.length > 0 ? totalRevenue / orders.filter(o => o.status !== 'Cancelled').length : 0;

  // 1. Loader screen during initial auth validation
  if (isAuthenticated === null) {
    return (
      <div className="bg-[#070708] min-h-screen text-white flex flex-col justify-center items-center font-sans">
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 rounded-full border-t-2 border-primary border-r-2 animate-spin mx-auto" />
          <p className="text-[10px] uppercase font-mono tracking-widest text-gray-500 font-bold">Verifying admin cryptkey...</p>
        </div>
      </div>
    );
  }

  // 2. Cinematic Admin Credentials verification screen
  if (isAuthenticated === false) {
    return (
      <div className="bg-[#070708] min-h-screen text-white flex flex-col justify-center items-center px-4 sm:px-6 font-sans relative overflow-hidden">
        {/* Decorative background grid subtle overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f23_1px,transparent_1px),linear-gradient(to_bottom,#1f1f23_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />
        
        <div className="max-w-md w-full relative z-10 space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex p-4 rounded-full bg-primary/5 border border-primary/20 text-primary shadow-[0_0_15px_rgba(234,179,8,0.05)] mx-auto">
              <Lock className="w-8 h-8 text-primary animate-pulse" />
            </div>
            
            <div className="space-y-1">
              <h1 className="text-2xl font-light text-white tracking-widest uppercase">
                SYSTEM <span className="text-primary font-bold">CONTROL</span> PORTAL
              </h1>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Canadian Prop Money Dispatch Ledger Vault
              </p>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="bg-[#0f0f12] border border-white/5 p-6 sm:p-8 rounded-2xl shadow-2xl space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono text-gray-400 font-bold tracking-wider">
                ACCESS PASSCODE CREDENTIAL
              </label>
              <input
                type="password"
                placeholder="••••••••••••••"
                value={typedCode}
                onChange={(e) => setTypedCode(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white font-mono text-center tracking-widest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                autoFocus
              />
            </div>

            {loginError && (
              <div className="bg-red-950/20 border border-red-500/20 text-red-200 p-3.5 rounded-xl text-[11px] font-mono uppercase text-center tracking-wide leading-relaxed">
                ⚠️ {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={checkingAuth || !typedCode}
              className="w-full py-3.5 bg-primary hover:bg-opacity-90 disabled:opacity-50 text-black text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-[0_4px_20px_rgba(234,179,8,0.15)] flex justify-center items-center gap-2"
            >
              {checkingAuth ? (
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                'VERIFY IDENTITY'
              )}
            </button>
          </form>

          <p className="text-[9px] text-gray-600 text-center uppercase tracking-wider font-mono">
            AUTHORIZED SECURE ENTRY ONLY. INTRUSION TRACKED & LOGGED.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#070708] min-h-screen text-white py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Alerts panel */}
        {successMsg && (
          <div className="fixed bottom-6 left-6 z-50 bg-emerald-950 border border-emerald-500/40 text-emerald-200 px-5 py-3 rounded-xl flex items-center gap-3 shadow-2xl animate-bounce">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-mono font-semibold uppercase">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="fixed bottom-6 left-6 z-50 bg-red-955 border border-red-500/40 text-red-100 px-5 py-3 rounded-xl flex items-center gap-3 shadow-2xl">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-xs font-mono font-semibold uppercase text-red-300">{errorMsg}</span>
          </div>
        )}

        {/* Console Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono font-bold tracking-wider rounded-full mb-3 uppercase">
              🛡️ Admin Security Access Active
            </div>
            <h1 className="text-4xl font-light text-white uppercase tracking-tight">Locker Dispatch Administration</h1>
            <p className="text-sm text-gray-400 font-light mt-1">Real-time orders processing database built on Cloudflare D1 tables ledger.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setRefreshCount(prev => prev + 1)}
              className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400 hover:text-white bg-white/5 border border-white/10 px-4 py-2.5 rounded hover:bg-white/10 transition-colors font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-primary ${loading ? 'animate-spin' : ''}`} /> Force Refresh
            </button>
            <button 
              onClick={() => {
                sessionStorage.removeItem('cpm_admin_passcode');
                setIsAuthenticated(false);
              }}
              className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#f87171] hover:text-[#fca5a5] bg-[#7f1d1d]/20 border border-[#f87171]/20 px-4 py-2.5 rounded hover:bg-[#7f1d1d]/30 transition-colors font-semibold shadow-[0_0_15px_rgba(239,68,68,0.05)]"
            >
              Exit Console
            </button>
          </div>
        </div>

        {/* METRICS DASHBOARD PANELS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="absolute top-2 right-2 p-1.5 bg-primary/10 rounded-lg text-primary">
              <DollarSign className="w-4 h-4" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">Total Sales (Excl. Cancelled)</span>
            <p className="text-3xl font-mono font-bold text-emerald-400">${totalRevenue.toFixed(2)}</p>
            <span className="text-[9px] text-gray-500 block">CAD Currency Valuation</span>
          </div>

          <div className="bg-white/5 border border-white/10 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="absolute top-2 right-2 p-1.5 bg-amber-400/10 rounded-lg text-amber-500">
              <Package className="w-4 h-4" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">Active Enquiries Queue</span>
            <p className="text-3xl font-mono font-bold text-amber-400">{activeEnquiries}</p>
            <span className="text-[9px] text-gray-500 block">Requires Payment Check</span>
          </div>

          <div className="bg-white/5 border border-white/10 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="absolute top-2 right-2 p-1.5 bg-green-500/10 rounded-lg text-green-500">
              <CheckCircle className="w-4 h-4" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">Dispatched Batches</span>
            <p className="text-3xl font-mono font-bold text-green-400">{dispatchCompleted}</p>
            <span className="text-[9px] text-gray-500 block">Courier handoff completed</span>
          </div>

          <div className="bg-white/5 border border-white/10 p-5 rounded-xl space-y-2 relative overflow-hidden">
            <div className="absolute top-2 right-2 p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
              <Info className="w-4 h-4" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">Average Transaction Size</span>
            <p className="text-3xl font-mono font-bold text-blue-400">${avgOrderValue.toFixed(2)}</p>
            <span className="text-[9px] text-gray-500 block">Valuation per active customer</span>
          </div>
        </div>

        {/* PAYMENT METHODS MANAGER PANEL */}
        <div className="bg-white/5 border border-white/10 p-6 sm:p-8 rounded-xl space-y-6 shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/10 pb-4">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-light uppercase tracking-tight text-white mb-0.5">Toggle Payment Methods &amp; Instructions</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {paymentMethods.map((method) => (
              <div key={method.id} className="bg-black/40 border border-white/5 p-5 rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <span className="block text-sm font-bold uppercase tracking-wider text-white">{method.name}</span>
                    <span className="text-[9px] text-gray-400 font-mono">Reference key: {method.id}</span>
                  </div>
                  
                  {/* Toggle button */}
                  <button
                    onClick={() => handleTogglePaymentMethod(method)}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
                      method.enabled === 1 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {method.enabled === 1 ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {/* Instructions Box */}
                {editingMethodId === method.id ? (
                  <div className="space-y-3 font-mono">
                    <textarea 
                      value={editingInstructions}
                      onChange={(e) => setEditingInstructions(e.target.value)}
                      className="w-full bg-black text-xs p-3 border border-primary text-white rounded font-mono focus:outline-none"
                      rows={3}
                    />
                    <div className="flex justify-end gap-2 text-[10px]">
                      <button 
                        onClick={() => setEditingMethodId(null)}
                        className="py-1 px-3 bg-transparent hover:bg-white/5 border border-white/15 uppercase tracking-wider rounded"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleEditInstructionsSubmit(method.id)}
                        className="py-1 px-3 bg-white text-black font-bold uppercase tracking-wider rounded"
                      >
                        Save Details
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="font-mono text-xs text-gray-400 bg-black/50 p-3 rounded border border-white/5 space-y-2">
                    <p className="leading-relaxed whitespace-pre-wrap">{method.instructions}</p>
                    <button 
                      onClick={() => {
                        setEditingMethodId(method.id);
                        setEditingInstructions(method.instructions);
                      }}
                      className="text-primary text-[10px] uppercase font-bold hover:underline block"
                    >
                      🖋️ Modify Instructions
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* SEARCH, FILTERS & MAIN LISTING */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-xl space-y-6 p-6 sm:p-8">
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders, clients, emails, phone..."
                className="w-full bg-black border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-primary text-white"
              />
            </div>

            {/* Filter Status */}
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-gray-500 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-black text-xs text-white border border-white/10 rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary uppercase font-bold"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Orders Main Grid/Table */}
          {loading ? (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <span className="font-mono text-xs uppercase tracking-widest">Running database queries...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20 bg-black/20 rounded-lg border border-white/5 border-dashed">
              <ShieldAlert className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-light">No records matched active search identifiers or filters.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => (
                <div 
                  key={order.id} 
                  className={`border rounded-xl bg-black/40 p-5 sm:p-6 space-y-4 hover:border-white/15 transition-all ${
                    order.status === 'Cancelled' ? 'border-red-500/10 opacity-60' : 'border-white/5'
                  }`}
                >
                  
                  {/* Top line detail */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/5 pb-4 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-mono font-bold text-white uppercase">{order.order_number}</span>
                        <span className="text-xs text-gray-500">placed on {new Date(order.created_at).toLocaleString()}</span>
                      </div>
                      
                      {/* Customer info */}
                      {order.customer && (
                        <p className="text-xs text-gray-400">
                          Client: <strong className="text-white">{order.customer.first_name} {order.customer.last_name}</strong> &bull; {order.customer.email} &bull; {order.customer.phone}
                        </p>
                      )}
                    </div>

                    {/* Interactive Status Changer */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-500 uppercase block font-bold">Status:</span>
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className={`text-xs font-bold uppercase rounded px-3 py-1.5 focus:outline-none transition ${
                          order.status === 'Pending' ? 'bg-amber-400/10 text-amber-500 border border-amber-400/20' :
                          order.status === 'Processing' ? 'bg-blue-400/10 text-blue-500 border border-blue-400/20' :
                          order.status === 'Shipped' ? 'bg-orange-400/10 text-orange-500 border border-orange-400/20' :
                          order.status === 'Completed' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                          'bg-red-500/10 text-red-500 border border-red-500/20'
                        }`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Processing">Processing</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  {/* Middle section: items list, financials & shipping detail */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 text-xs text-gray-300">
                    
                    {/* Item list */}
                    <div className="md:col-span-6 space-y-2">
                      <span className="block text-[9px] uppercase font-bold text-gray-500">Products Specs:</span>
                      <ul className="divide-y divide-white/5 font-mono">
                        {order.items?.map((it, idx) => (
                          <li key={idx} className="py-2 flex justify-between items-center bg-black/25 px-2 rounded mt-1">
                            <span>{it.product_name} <span className="text-gray-500">x{it.quantity}</span></span>
                            <span className="text-emerald-400 font-bold">${(it.price * it.quantity).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Shipping location */}
                    <div className="md:col-span-3 space-y-1">
                      <span className="block text-[9px] uppercase font-bold text-gray-500">Delivery Address:</span>
                      {order.customer ? (
                        <div className="text-xs text-gray-400 space-y-0.5">
                          <p className="text-white font-medium">{order.customer.address}</p>
                          <p>{order.customer.city}, {order.customer.province}</p>
                          <p className="font-mono text-[10px] text-gray-500">{order.customer.postal_code}, {order.customer.country}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-red-400">Profile missing</p>
                      )}
                    </div>

                    {/* Financial details summary */}
                    <div className="md:col-span-3 space-y-1 font-mono text-left sm:text-right">
                      <span className="block text-[9px] uppercase font-bold text-gray-500 text-left sm:text-right">Financial Ledger:</span>
                      <p className="text-gray-500">Subtotal: ${order.subtotal?.toFixed(2)}</p>
                      <p className="text-gray-500">Shipping: ${order.shipping?.toFixed(2)}</p>
                      <p className="text-emerald-400 text-sm font-bold pt-1 border-t border-white/5 mt-1">Total: ${order.total?.toFixed(2)} CAD</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider pt-0.5">Pay: <span className="text-white font-bold">{order.payment_method}</span></p>
                    </div>

                  </div>

                  {/* ADMIN WORKFLOW PANEL: Payment Instructions Editor & Email Logs History */}
                  <div className="mt-4 border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-12 gap-6 bg-white/[0.02] p-4 sm:p-5 rounded-xl border border-white/5">
                    
                    {/* Column Left: Textarea Editor & Parameters UI Form */}
                    <div className="md:col-span-7 space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-white/5">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider flex items-center gap-1.5 font-mono">
                          <Settings className="w-3.5 h-3.5 text-primary" /> PAYMENT INSTRUCTIONS CONTROL BOARD
                        </span>
                        {/* Auto-fill indicator */}
                        <button
                          type="button"
                          onClick={() => {
                            const currentMethodName = editingPaymentMethods[order.id] || order.payment_method;
                            const defaultVal = paymentMethods.find(pm => pm.id === currentMethodName || pm.name === currentMethodName || pm.id === order.payment_method || pm.name === order.payment_method)?.instructions || "";
                            setEditingOrdersInstructions(prev => ({
                              ...prev,
                              [order.id]: defaultVal
                            }));
                            triggerNotify('Reset instructions to method defaults.');
                          }}
                          className="text-[9px] uppercase font-mono font-bold text-primary hover:underline"
                        >
                          Reset to Method Defaults
                        </button>
                      </div>

                      {/* Overrides Selection Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Dynamic Payment Method Selector */}
                        <div className="space-y-1">
                          <label className="block text-[9px] uppercase font-mono text-gray-400 font-bold">Select/Override Method:</label>
                          <select
                            value={editingPaymentMethods[order.id] !== undefined ? editingPaymentMethods[order.id] : order.payment_method}
                            onChange={(e) => {
                              const selectedMethod = e.target.value;
                              setEditingPaymentMethods(prev => ({ ...prev, [order.id]: selectedMethod }));
                              
                              // Automatically auto-fill the instructions textarea with the chosen payment method's template defaults 
                              const pm = paymentMethods.find(p => p.name === selectedMethod || p.id === selectedMethod);
                              if (pm) {
                                setEditingOrdersInstructions(prev => ({ ...prev, [order.id]: pm.instructions }));
                              }
                            }}
                            className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-white uppercase font-bold font-mono focus:outline-none focus:border-primary cursor-pointer"
                          >
                            {paymentMethods.map((pm) => (
                              <option key={pm.id} value={pm.name}>
                                {pm.name} {pm.enabled === 0 ? "(INACTIVE)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Optional Payment Deadline Input */}
                        <div className="space-y-1">
                          <label className="block text-[9px] uppercase font-mono text-gray-400 font-bold">Optional Deadline:</label>
                          <input
                            type="text"
                            value={editingPaymentDeadlines[order.id] !== undefined ? editingPaymentDeadlines[order.id] : (order.payment_deadline || '')}
                            onChange={(e) => {
                              setEditingPaymentDeadlines(prev => ({ ...prev, [order.id]: e.target.value }));
                            }}
                            placeholder="e.g. Within 24 Hours, immediate, June 20"
                            className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-primary"
                          />
                        </div>
                      </div>

                      {/* Subject Choice UI Block */}
                      <div className="space-y-1">
                        <label className="block text-[9px] uppercase font-mono text-gray-400 font-bold">Customizable Subject Line:</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            onChange={(e) => {
                              const choice = e.target.value;
                              if (choice !== "custom") {
                                const formatted = choice.replace(/\[ORDER_NUMBER\]/g, order.order_number);
                                setEditingSubjects(prev => ({ ...prev, [order.id]: formatted }));
                              }
                            }}
                            className="bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-primary sm:max-w-[180px] w-full"
                          >
                            <option value={`Payment Required - Order #${order.order_number}`}>Default: Required</option>
                            <option value={`Payment Instructions For Order #${order.order_number}`}>Alternative 1: Details</option>
                            <option value={`Action Required: Payment For Order #${order.order_number}`}>Alternative 2: Action</option>
                            <option value="custom">-- Completely Custom --</option>
                          </select>

                          <input
                            type="text"
                            value={
                              editingSubjects[order.id] !== undefined
                                ? editingSubjects[order.id]
                                : `Payment Required - Order #${order.order_number}`
                            }
                            onChange={(e) => {
                              setEditingSubjects(prev => ({ ...prev, [order.id]: e.target.value }));
                            }}
                            placeholder="Type a completely custom email subject..."
                            className="flex-1 bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-primary"
                          />
                        </div>
                      </div>

                      {/* Textarea instruction details */}
                      <div className="space-y-1">
                        <label className="block text-[9px] uppercase font-mono text-gray-400 font-bold">Secure Payment Specifications Details:</label>
                        <textarea
                          value={
                            editingOrdersInstructions[order.id] !== undefined
                              ? editingOrdersInstructions[order.id]
                              : (order.payment_instructions || paymentMethods.find(pm => pm.id === order.payment_method || pm.name === order.payment_method)?.instructions || "")
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingOrdersInstructions(prev => ({
                              ...prev,
                              [order.id]: val
                            }));
                          }}
                          placeholder="Type address hashes, wallet codes, Bank Wire credentials precisely (breaks are preserved)..."
                          className="w-full bg-black/60 text-xs p-3 border border-white/10 text-white rounded-lg font-mono focus:outline-none focus:border-primary"
                          rows={4}
                        />
                      </div>

                      {/* Operation action dispatch line */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const currentInstructions = editingOrdersInstructions[order.id] !== undefined
                              ? editingOrdersInstructions[order.id]
                              : (order.payment_instructions || paymentMethods.find(pm => pm.id === order.payment_method || pm.name === order.payment_method)?.instructions || "");
                            
                            const currentMethod = editingPaymentMethods[order.id] !== undefined ? editingPaymentMethods[order.id] : order.payment_method;
                            const currentDeadline = editingPaymentDeadlines[order.id] !== undefined ? editingPaymentDeadlines[order.id] : (order.payment_deadline || '');
                            
                            handleSaveAllValues(order.id, currentInstructions, currentMethod, currentDeadline);
                          }}
                          className="py-1.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-bold uppercase tracking-wider rounded text-gray-300 hover:text-white flex items-center gap-1.5 transition"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Save Draft (D1 Only)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const currentInstructions = editingOrdersInstructions[order.id] !== undefined
                              ? editingOrdersInstructions[order.id]
                              : (order.payment_instructions || paymentMethods.find(pm => pm.id === order.payment_method || pm.name === order.payment_method)?.instructions || "");
                            
                            const currentSubject = editingSubjects[order.id] !== undefined
                              ? editingSubjects[order.id]
                              : `Payment Required - Order #${order.order_number}`;

                            const currentMethod = editingPaymentMethods[order.id] !== undefined ? editingPaymentMethods[order.id] : order.payment_method;
                            const currentDeadline = editingPaymentDeadlines[order.id] !== undefined ? editingPaymentDeadlines[order.id] : (order.payment_deadline || '');

                            handleSendPaymentInstructions(order.id, currentInstructions, currentSubject, currentMethod, currentDeadline);
                          }}
                          className="py-1.5 px-4 bg-primary text-black hover:bg-opacity-90 text-[9px] font-bold uppercase tracking-wider rounded flex items-center gap-1.5 transition shadow"
                        >
                          <Mail className="w-3.5 h-3.5" /> 
                          {order.email_sent_at ? "Resend Payment Details" : "Send Payment Details"}
                        </button>
                      </div>
                    </div>

                    {/* Column Right: Email History Logs */}
                    <div className="md:col-span-5 space-y-3">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider flex items-center gap-1.5 font-mono">
                        <History className="w-3.5 h-3.5 text-gray-400" /> EMAIL HISTORY LEDGER
                      </span>

                      <div className="bg-black/40 border border-white/5 rounded-lg p-3.5 space-y-3.5 overflow-hidden">
                        {/* Sent stats metadata */}
                        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono border-b border-white/5 pb-2">
                          <div>
                            <span className="text-gray-500 block uppercase font-bold">LAST DISPATCH AT:</span>
                            <span className="text-white truncate block max-w-full">{order.email_sent_at ? new Date(order.email_sent_at).toLocaleString() : "NEVER SENT"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block uppercase font-bold">LAST SUBJECT:</span>
                            <span className="text-white truncate block max-w-full" title={order.last_email_subject || ""}>
                              {order.last_email_subject || "N/A"}
                            </span>
                          </div>
                        </div>

                        {/* Logs list */}
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {(() => {
                            const parsedHistory: any[] = [];
                            try {
                              if (order.email_history) {
                                parsedHistory.push(...JSON.parse(order.email_history));
                              }
                            } catch (e) {}

                            // Also sync any other email logs
                            if (order.email_logs && order.email_logs.length > 0) {
                              order.email_logs.forEach((log: any) => {
                                const exists = parsedHistory.some((h: any) => h.subject.toLowerCase().includes(log.email_type.toLowerCase()) || h.created_at === log.created_at);
                                if (!exists) {
                                  parsedHistory.push({
                                    created_at: log.created_at,
                                    subject: log.email_type.replace(/_/g, ' ').toUpperCase(),
                                    recipient: log.recipient,
                                    status: log.status
                                  });
                                }
                              });
                            }

                            // Sort latest first
                            parsedHistory.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                            if (parsedHistory.length === 0) {
                              return <p className="text-[10px] text-gray-500 font-mono italic">No automated or manual emails logged for this transaction yet.</p>;
                            }

                            return parsedHistory.map((item: any, idx: number) => (
                              <div key={idx} className="flex flex-col text-[9px] font-mono bg-black/60 p-2 rounded border border-white/5 gap-1.5">
                                <div className="flex justify-between items-start gap-2">
                                  <div className="space-y-0.5 truncate flex-1">
                                    <span className="text-gray-400 block truncate font-bold uppercase">{item.subject}</span>
                                    <span className="text-gray-500 block truncate">to: {item.recipient}</span>
                                    {item.payment_method && (
                                      <span className="text-amber-500 block text-[8px] uppercase font-bold">Method: {item.payment_method}</span>
                                    )}
                                    {item.payment_instructions_version && (
                                      <span className="text-teal-400 block text-[8px] uppercase font-bold">Version: V{item.payment_instructions_version}</span>
                                    )}
                                    <span className="text-[8px] text-gray-600 block">{new Date(item.created_at).toLocaleString()}</span>
                                  </div>
                                  <span className={`px-1 rounded uppercase font-bold text-[8px] shrink-0 ${
                                    item.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    {item.status}
                                  </span>
                                </div>
                                
                                {item.payment_instructions && (
                                  <details className="mt-0.5 group border-t border-white/5 pt-1">
                                    <summary className="text-[8px] text-primary hover:underline cursor-pointer select-none outline-none list-none flex items-center justify-between">
                                      <span>[Click to Review Sent Instructions]</span>
                                      <span className="text-[7px] text-gray-500 group-open:hidden">▼</span>
                                      <span className="text-[7px] text-gray-500 hidden group-open:block">▲</span>
                                    </summary>
                                    <pre className="mt-1 bg-black/80 border border-white/5 p-1.5 rounded text-[8px] max-h-[100px] overflow-auto whitespace-pre-wrap font-mono text-gray-300">
                                      {item.payment_instructions}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Actions buttons and timeline summary */}
                  <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t border-white/5">
                    
                    {/* Resend status & Email status logs */}
                    <div className="text-[10px] text-gray-400 font-mono flex items-center gap-2">
                      <span className="text-gray-500 text-[9px] uppercase font-bold">Email Logs:</span>
                      {order.email_logs && order.email_logs.length > 0 ? (
                        <div className="flex gap-2.5 flex-wrap">
                          {order.email_logs.map((log: any, lIdx: number) => (
                            <span 
                              key={lIdx} 
                              className={`px-1.5 py-0.5 rounded text-[9px] ${
                                log.status === 'delivered' ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-400'
                              }`}
                              title={`Sent to: ${log.recipient}`}
                            >
                              {log.email_type.replace('_', ' ')}: {log.status}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-600">None logged</span>
                      )}
                    </div>

                    {/* Dynamic Action Buttons */}
                    <div className="flex items-center gap-2.5 justify-end">
                      <button 
                        onClick={() => handleResendEmail(order.id)}
                        className="py-1.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold uppercase tracking-wider rounded text-gray-300 hover:text-white flex items-center gap-1.5 transition"
                        title="Resend confirmation invoice email"
                      >
                        <Mail className="w-3.5 h-3.5" /> Re-trigger Email
                      </button>
                      <button 
                        onClick={() => handleDeleteOrder(order.id, order.order_number)}
                        className="py-1.5 px-3 bg-red-950/20 hover:bg-red-950/40 border border-red-500/10 text-[10px] font-bold uppercase tracking-wider rounded text-red-400 hover:text-red-300 flex items-center gap-1.5 transition"
                        title="Permanently remove order records"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Purge Order
                      </button>
                    </div>

                  </div>

                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
