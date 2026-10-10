import React, { useState, useEffect } from 'react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionId, setSessionId] = useState(localStorage.getItem('bank_session_id') || '');
  
  // Login Form State
  const [loginId, setLoginId] = useState('C101');
  const [pin, setPin] = useState('1234');
  const [authError, setAuthError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  
  // Customer State
  const [account, setAccount] = useState(null);
  const [myTransactions, setMyTransactions] = useState([]);
  
  // Transfer Stepper State (Steps 1..4)
  const [transferStep, setTransferStep] = useState(1);
  const [beneficiaryId, setBeneficiaryId] = useState('A102');
  const [amount, setAmount] = useState('1500');
  const [currentTxn, setCurrentTxn] = useState(null);
  const [authorisePin, setAuthorisePin] = useState('');
  const [transferError, setTransferError] = useState('');
  
  // Admin State
  const [adminTransactions, setAdminTransactions] = useState([]);
  const [adminAudit, setAdminAudit] = useState([]);
  const [adminStatusAction, setAdminStatusAction] = useState({});
  const [adminActionError, setAdminActionError] = useState('');
  
  // Detail Modal
  const [selectedTxnDetails, setSelectedTxnDetails] = useState(null);
  
  // Toast notifications
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Helper for API calls
  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) headers['x-session-id'] = sessionId;

    try {
      const response = await fetch(endpoint, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.error?.message || 'An unexpected error occurred.';
        const err = new Error(errorMsg);
        err.code = data.error?.code;
        err.status = response.status;
        throw err;
      }
      return data.data;
    } catch (err) {
      throw err;
    }
  };

  // Check login status on mount
  useEffect(() => {
    if (sessionId) {
      apiCall('/api/auth/me')
        .then(data => {
          setCurrentUser(data.user);
        })
        .catch(() => {
          setSessionId('');
          localStorage.removeItem('bank_session_id');
        });
    }
  }, [sessionId]);

  // Fetch account and transactions when user changes
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'CUSTOMER') {
        loadCustomerData();
      } else if (currentUser.role === 'ADMIN') {
        loadAdminData();
      }
    }
  }, [currentUser]);

  const loadCustomerData = async () => {
    try {
      const accData = await apiCall('/api/accounts/mine');
      setAccount(accData.primaryAccount);
      const txData = await apiCall('/api/transfers/mine');
      setMyTransactions(txData.transactions);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadAdminData = async () => {
    try {
      const txData = await apiCall('/api/admin/transactions');
      setAdminTransactions(txData.transactions);
      const auditData = await apiCall('/api/admin/audit');
      setAdminAudit(auditData.history);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    setIsLocked(false);
    try {
      const data = await apiCall('/api/auth/login', 'POST', { loginId, pin });
      setSessionId(data.sessionId);
      localStorage.setItem('bank_session_id', data.sessionId);
      setCurrentUser(data.user);
      showToast(`Welcome back, ${data.user.name}!`, 'success');
    } catch (err) {
      setAuthError(err.message);
      if (err.code === 'SESSION_LOCKED' || err.status === 423) {
        setIsLocked(true);
      }
      showToast(err.message, 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await apiCall('/api/auth/logout', 'POST');
    } catch (e) {
      // ignore
    }
    setSessionId('');
    localStorage.removeItem('bank_session_id');
    setCurrentUser(null);
    setCurrentTxn(null);
    setTransferStep(1);
    showToast('Logged out successfully.', 'info');
  };

  // Step 1: Initiate
  const handleInitiate = async (e) => {
    e.preventDefault();
    setTransferError('');
    const amtNum = Number(amount);

    if (isNaN(amtNum) || !Number.isInteger(amtNum) || amtNum < 100 || amtNum > 20000) {
      setTransferError('Amount must be a whole rupee value between Rs.100 and Rs.20,000.');
      return;
    }

    try {
      const idempKey = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const res = await apiCall('/api/transfers/initiate', 'POST', {
        beneficiaryAccountId: beneficiaryId,
        amount: amtNum,
        idempotencyKey: idempKey
      });

      setCurrentTxn(res.transaction);
      setTransferStep(2); // Move to review step
      showToast('Transfer initiated. Please review details.', 'info');
    } catch (err) {
      setTransferError(err.message);
      showToast(err.message, 'error');
    }
  };

  // Step 3: Authorise with PIN
  const handleAuthorise = async (e) => {
    e.preventDefault();
    setTransferError('');
    if (!/^\d{4}$/.test(authorisePin)) {
      setTransferError('PIN must be exactly 4 digits.');
      return;
    }

    try {
      const res = await apiCall(`/api/transfers/${currentTxn.reference}/authorise`, 'POST', {
        pin: authorisePin
      });
      setCurrentTxn(res.transaction);
      setTransferStep(4); // Move to complete step
      setAuthorisePin('');
      showToast('Transfer authorised successfully.', 'success');
    } catch (err) {
      setTransferError(err.message);
      showToast(err.message, 'error');
    }
  };

  // Step 4: Complete
  const handleComplete = async () => {
    setTransferError('');
    try {
      const res = await apiCall(`/api/transfers/${currentTxn.reference}/complete`, 'POST');
      setCurrentTxn(res.transaction);
      setTransferStep(5); // Receipt view
      loadCustomerData();
      showToast(`Transfer completed! Reference: ${res.transaction.reference}`, 'success');
    } catch (err) {
      setTransferError(err.message);
      showToast(err.message, 'error');
      loadCustomerData();
    }
  };

  // Customer: Reverse
  const handleReverse = async (reference) => {
    try {
      const res = await apiCall(`/api/transfers/${reference}/reverse`, 'POST');
      showToast(`Transaction ${reference} reversed successfully!`, 'success');
      loadCustomerData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // View Details
  const handleViewDetails = async (reference) => {
    try {
      const data = await apiCall(`/api/transfers/${reference}`);
      setSelectedTxnDetails(data);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Admin status transition action
  const handleAdminStatusChange = async (reference) => {
    setAdminActionError('');
    const targetStatus = adminStatusAction[reference] || 'REVERSED';
    try {
      await apiCall(`/api/admin/transactions/${reference}/status`, 'POST', { targetStatus });
      showToast(`Updated ${reference} to ${targetStatus}!`, 'success');
      loadAdminData();
    } catch (err) {
      setAdminActionError(`Error updating ${reference}: [${err.code || 'ERR'}] ${err.message}`);
      showToast(err.message, 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          padding: '1rem 1.5rem',
          borderRadius: '0.75rem',
          zIndex: 9999,
          background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#3b82f6',
          color: 'white',
          fontWeight: '600',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span>{toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✅' : 'ℹ️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* App Header */}
      <header style={{
        background: 'rgba(17, 24, 39, 0.9)',
        borderBottom: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '0.625rem',
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.25rem',
              color: 'white'
            }}>
              ₹
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.025em', color: 'white' }}>
                SE SAT II Bank
              </h1>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Industry Use Case 11: Fund Transfer System
              </p>
            </div>
          </div>

          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{currentUser.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {currentUser.role} • <span style={{ color: '#10b981' }}>{currentUser.loginId}</span>
                </div>
              </div>
              <button id="logout-button" onClick={handleLogout} className="btn btn-secondary">
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="container" style={{ flex: 1, padding: '2rem 1.5rem' }}>
        {!currentUser ? (
          /* ======================================================== */
          /* LOGIN SCREEN                                             */
          /* ======================================================== */
          <div style={{ maxWidth: '460px', margin: '2rem auto' }}>
            <div className="card">
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>System Authentication</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  Log in with synthetic demo credentials (BR5 enforcement)
                </p>
              </div>

              {/* Demo Quick-Select Buttons */}
              <div style={{ marginBottom: '1.25rem', background: 'var(--bg-surface-elevated)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  QUICK FILL DEMO CREDENTIALS:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                    onClick={() => { setLoginId('C101'); setPin('1234'); }}
                  >
                    C101 (Customer 1, Rs.25k)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                    onClick={() => { setLoginId('C102'); setPin('5678'); }}
                  >
                    C102 (Customer 2, Rs.8k)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                    onClick={() => { setLoginId('ADMIN01'); setPin('9999'); }}
                  >
                    ADMIN01 (Administrator)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem', color: '#f87171' }}
                    onClick={() => { setLoginId('C103'); setPin('0000'); }}
                  >
                    C103 (Inactive Customer)
                  </button>
                </div>
              </div>

              {authError && (
                <div id="login-error-alert" style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  background: isLocked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                  border: isLocked ? '1px solid #ef4444' : '1px solid #f59e0b',
                  color: isLocked ? '#f87171' : '#fbbf24',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem'
                }}>
                  {authError}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label htmlFor="login-id-input" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Customer / Login ID
                  </label>
                  <input
                    id="login-id-input"
                    type="text"
                    className="input-field"
                    placeholder="e.g. C101, C102, ADMIN01"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label htmlFor="login-pin-input" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    4-Digit Security PIN
                  </label>
                  <input
                    id="login-pin-input"
                    type="password"
                    maxLength={4}
                    className="input-field"
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                </div>

                <button
                  id="login-submit-button"
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.75rem' }}
                  disabled={isLocked}
                >
                  {isLocked ? 'Account Session Locked' : 'Sign In Securely'}
                </button>
              </form>
            </div>
          </div>
        ) : currentUser.role === 'CUSTOMER' ? (
          /* ======================================================== */
          /* CUSTOMER DASHBOARD                                       */
          /* ======================================================== */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Account Balance Card */}
            {account && (
              <div className="card" style={{
                background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.7) 0%, rgba(17, 24, 39, 0.9) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#93c5fd', fontWeight: 600 }}>Primary Savings Account</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'white', marginTop: '0.25rem' }}>
                    Account #{account.id} • <span className="badge badge-SUCCESS">{account.status}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Balance</div>
                  <div id="customer-balance-display" style={{ fontSize: '2.25rem', fontWeight: 800, color: '#38bdf8' }}>
                    ₹{account.balance.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            )}

            {/* Stepper Transfer Panel */}
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>
                New Fund Transfer
              </h2>

              {/* Progress Indicator */}
              <div className="stepper-progress">
                <div className={`step-item ${transferStep >= 1 ? (transferStep > 1 ? 'completed' : 'active') : ''}`}>
                  <div className="step-circle">{transferStep > 1 ? '✓' : '1'}</div>
                  <div className="step-label">Details</div>
                </div>
                <div style={{ flex: 1, height: '2px', background: transferStep > 1 ? 'var(--accent-emerald)' : 'var(--border-subtle)' }} />
                <div className={`step-item ${transferStep >= 2 ? (transferStep > 2 ? 'completed' : 'active') : ''}`}>
                  <div className="step-circle">{transferStep > 2 ? '✓' : '2'}</div>
                  <div className="step-label">Review</div>
                </div>
                <div style={{ flex: 1, height: '2px', background: transferStep > 2 ? 'var(--accent-emerald)' : 'var(--border-subtle)' }} />
                <div className={`step-item ${transferStep >= 3 ? (transferStep > 3 ? 'completed' : 'active') : ''}`}>
                  <div className="step-circle">{transferStep > 3 ? '✓' : '3'}</div>
                  <div className="step-label">Authorise</div>
                </div>
                <div style={{ flex: 1, height: '2px', background: transferStep > 3 ? 'var(--accent-emerald)' : 'var(--border-subtle)' }} />
                <div className={`step-item ${transferStep >= 4 ? (transferStep >= 5 ? 'completed' : 'active') : ''}`}>
                  <div className="step-circle">{transferStep >= 5 ? '✓' : '4'}</div>
                  <div className="step-label">Receipt</div>
                </div>
              </div>

              {transferError && (
                <div id="transfer-error-alert" style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  color: '#f87171',
                  fontSize: '0.875rem',
                  marginBottom: '1.25rem'
                }}>
                  {transferError}
                </div>
              )}

              {/* Step 1: Details */}
              {transferStep === 1 && (
                <form onSubmit={handleInitiate} style={{ maxWidth: '540px' }}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label htmlFor="transfer-beneficiary-input" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Beneficiary Account ID
                    </label>
                    <input
                      id="transfer-beneficiary-input"
                      type="text"
                      className="input-field"
                      placeholder="e.g. A102"
                      value={beneficiaryId}
                      onChange={(e) => setBeneficiaryId(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => setBeneficiaryId('A102')}
                      >
                        Pick A102 (Active - Sample Customer 2)
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#f87171' }}
                        onClick={() => setBeneficiaryId('A103')}
                      >
                        Pick A103 (Inactive - Blocked Holder)
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="transfer-amount-input" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Transfer Amount (Rupees ₹)
                    </label>
                    <input
                      id="transfer-amount-input"
                      type="number"
                      step="1"
                      className="input-field"
                      placeholder="Whole rupees: 100 - 20000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {['500', '999', '1000', '1500', '20000'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => setAmount(amt)}
                        >
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button id="transfer-step1-next-button" type="submit" className="btn btn-primary">
                    Proceed to Review →
                  </button>
                </form>
              )}

              {/* Step 2: Review Transfer */}
              {transferStep === 2 && currentTxn && (
                <div style={{ maxWidth: '540px' }}>
                  <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Beneficiary Account:</span>
                      <span style={{ fontWeight: 600 }}>{currentTxn.beneficiary_account_id} ({currentTxn.beneficiary_name_snapshot})</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Transfer Amount:</span>
                      <span style={{ fontWeight: 600 }}>₹{currentTxn.amount.toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Service Charge (BR4):</span>
                      <span id="review-charge-display" style={{ fontWeight: 600, color: currentTxn.charge > 0 ? '#fbbf24' : '#34d399' }}>
                        ₹{currentTxn.charge} {currentTxn.amount < 1000 ? '(Amount < ₹1000: ₹10 charge)' : '(Amount ≥ ₹1000: Free)'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', fontSize: '1.125rem' }}>
                      <span style={{ fontWeight: 700 }}>Total Debit from Source:</span>
                      <span id="review-total-debit-display" style={{ fontWeight: 800, color: '#38bdf8' }}>₹{currentTxn.total_debit.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button id="transfer-step2-back-button" onClick={() => setTransferStep(1)} className="btn btn-secondary">
                      ← Back
                    </button>
                    <button id="transfer-step2-next-button" onClick={() => setTransferStep(3)} className="btn btn-primary">
                      Proceed to Authorise →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Authorise with PIN */}
              {transferStep === 3 && currentTxn && (
                <form onSubmit={handleAuthorise} style={{ maxWidth: '400px' }}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label htmlFor="authorise-pin-input" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Enter 4-Digit PIN to Authorise ₹{currentTxn.total_debit}
                    </label>
                    <input
                      id="authorise-pin-input"
                      type="password"
                      maxLength={4}
                      className="input-field"
                      placeholder="••••"
                      value={authorisePin}
                      onChange={(e) => setAuthorisePin(e.target.value)}
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      (Demo PIN for C101 is 1234)
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button type="button" onClick={() => setTransferStep(2)} className="btn btn-secondary">
                      ← Back
                    </button>
                    <button id="transfer-authorise-button" type="submit" className="btn btn-primary">
                      Authorise Transfer
                    </button>
                  </div>
                </form>
              )}

              {/* Step 4: Final Confirmation / Commit */}
              {transferStep === 4 && currentTxn && (
                <div style={{ maxWidth: '500px' }}>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ fontWeight: 700, color: '#34d399', marginBottom: '0.5rem' }}>
                      Authorization Verified (BR5)
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Transaction is AUTHORISED. Ready for atomic commit (BR7) with final balance re-validation.
                    </p>
                  </div>

                  <button id="transfer-complete-button" onClick={handleComplete} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
                    Execute Transfer Now
                  </button>
                </div>
              )}

              {/* Step 5: Success Receipt */}
              {transferStep === 5 && currentTxn && (
                <div style={{ maxWidth: '540px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '1rem', padding: '1.75rem' }}>
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399' }}>Transfer Completed Successfully</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Atomic debit and credit completed in one transaction.</p>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Transaction Reference:</span>
                      <span id="receipt-reference" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                        {currentTxn.reference}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Beneficiary:</span>
                      <span style={{ fontWeight: 600 }}>{currentTxn.beneficiary_name_snapshot} ({currentTxn.beneficiary_account_id})</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Transfer Amount:</span>
                      <span style={{ fontWeight: 600 }}>₹{currentTxn.amount.toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Service Charge:</span>
                      <span style={{ fontWeight: 600 }}>₹{currentTxn.charge}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontWeight: 700 }}>Total Debited:</span>
                      <span style={{ fontWeight: 800, color: '#34d399' }}>₹{currentTxn.total_debit.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <button
                    id="receipt-new-transfer-button"
                    onClick={() => {
                      setCurrentTxn(null);
                      setTransferStep(1);
                    }}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                  >
                    Start Another Transfer
                  </button>
                </div>
              )}
            </div>

            {/* My Transactions Table */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>My Transfer History</h3>
                <button onClick={loadCustomerData} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}>
                  Refresh Table
                </button>
              </div>

              {myTransactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No transactions initiated yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Beneficiary</th>
                        <th>Amount</th>
                        <th>Charge</th>
                        <th>Total Debit</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTransactions.map((tx) => (
                        <tr key={tx.reference}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tx.reference}</td>
                          <td>{tx.beneficiary_name_snapshot} ({tx.beneficiary_account_id})</td>
                          <td>₹{tx.amount.toLocaleString('en-IN')}</td>
                          <td>₹{tx.charge}</td>
                          <td style={{ fontWeight: 700 }}>₹{tx.total_debit.toLocaleString('en-IN')}</td>
                          <td>
                            <span className={`badge badge-${tx.status}`}>{tx.status}</span>
                          </td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                id={`view-txn-${tx.reference}`}
                                onClick={() => handleViewDetails(tx.reference)}
                                className="btn btn-secondary"
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                              >
                                Details
                              </button>
                              {tx.status === 'SUCCESS' && (
                                <button
                                  id={`reverse-txn-${tx.reference}`}
                                  onClick={() => handleReverse(tx.reference)}
                                  className="btn btn-danger"
                                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                >
                                  Reverse
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* ADMINISTRATOR DASHBOARD                                  */
          /* ======================================================== */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {adminActionError && (
              <div id="admin-action-error-alert" style={{
                padding: '1rem',
                borderRadius: '0.5rem',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#f87171',
                fontWeight: 600
              }}>
                {adminActionError}
              </div>
            )}

            {/* All Transactions */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>System-Wide Transactions</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Admin review & status transition enforcement (BR8)
                  </p>
                </div>
                <button onClick={loadAdminData} className="btn btn-secondary" style={{ fontSize: '0.75rem' }}>
                  Refresh
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Owner</th>
                      <th>Beneficiary</th>
                      <th>Amount</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Action Control (BR8 Validation)</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminTransactions.map((tx) => (
                      <tr key={tx.reference}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tx.reference}</td>
                        <td>{tx.owner_user_id} ({tx.source_account_id})</td>
                        <td>{tx.beneficiary_name_snapshot} ({tx.beneficiary_account_id})</td>
                        <td>₹{tx.amount}</td>
                        <td>₹{tx.total_debit}</td>
                        <td>
                          <span className={`badge badge-${tx.status}`}>{tx.status}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <select
                              id={`admin-target-status-select-${tx.reference}`}
                              className="input-field"
                              style={{ width: '130px', padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                              value={adminStatusAction[tx.reference] || 'REVERSED'}
                              onChange={(e) => setAdminStatusAction({ ...adminStatusAction, [tx.reference]: e.target.value })}
                            >
                              <option value="REVERSED">REVERSED</option>
                              <option value="SUCCESS">SUCCESS (Illegal)</option>
                              <option value="INITIATED">INITIATED (Illegal)</option>
                            </select>
                            <button
                              id={`admin-apply-status-button-${tx.reference}`}
                              onClick={() => handleAdminStatusChange(tx.reference)}
                              className="btn btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            onClick={() => handleViewDetails(tx.reference)}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          >
                            Audit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audit History Log */}
            <div className="card">
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Complete Audit Trail (transaction_history)
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event ID</th>
                      <th>Reference ID</th>
                      <th>Actor</th>
                      <th>Transition</th>
                      <th>Timestamp</th>
                      <th>Audit Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAudit.map((h) => (
                      <tr key={h.id}>
                        <td style={{ color: 'var(--text-muted)' }}>#{h.id}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{h.reference_id}</td>
                        <td><span className="badge badge-AUTHORISED">{h.actor_id}</span></td>
                        <td>
                          <span style={{ color: 'var(--text-muted)' }}>{h.old_status || 'START'}</span>
                          {' → '}
                          <span className={`badge badge-${h.new_status}`}>{h.new_status}</span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(h.event_at).toLocaleString()}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{h.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Detail Modal */}
        {selectedTxnDetails && (
          <div className="modal-overlay" onClick={() => setSelectedTxnDetails(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  Transaction Snapshot & Audit: {selectedTxnDetails.transaction.reference}
                </h3>
                <button onClick={() => setSelectedTxnDetails(null)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>
                  ✕
                </button>
              </div>

              <div style={{ padding: '1.5rem' }}>
                <div style={{ marginBottom: '1.5rem', background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    IMMUTABLE MASTER DATA SNAPSHOT (BR3):
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div><strong>Amount:</strong> ₹{selectedTxnDetails.transaction.amount}</div>
                    <div><strong>Service Charge:</strong> ₹{selectedTxnDetails.transaction.charge}</div>
                    <div><strong>Total Debit:</strong> ₹{selectedTxnDetails.transaction.total_debit}</div>
                    <div><strong>Beneficiary:</strong> {selectedTxnDetails.transaction.beneficiary_name_snapshot} ({selectedTxnDetails.transaction.beneficiary_account_id})</div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <strong>Charge Rule Snapshot:</strong>{' '}
                      <code style={{ fontSize: '0.75rem', background: '#111827', padding: '0.2rem 0.4rem', borderRadius: '0.25rem' }}>
                        {selectedTxnDetails.transaction.charge_rule_snapshot}
                      </code>
                    </div>
                    {selectedTxnDetails.transaction.failure_reason && (
                      <div style={{ gridColumn: 'span 2', color: '#f87171' }}>
                        <strong>Failure Reason:</strong> {selectedTxnDetails.transaction.failure_reason}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>Lifecycle Audit History:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedTxnDetails.history.map((h) => (
                    <div key={h.id} style={{ padding: '0.75rem', background: 'var(--bg-surface-elevated)', borderRadius: '0.5rem', fontSize: '0.8rem', borderLeft: '3px solid #3b82f6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600 }}>{h.old_status || 'NEW'} → {h.new_status}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{new Date(h.event_at).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>By: {h.actor_id} • {h.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Software Engineering SAT II – Industry Use Case 11: Bank Fund Transfer System • Sri Eshwar College of Engineering
      </footer>
    </div>
  );
}
