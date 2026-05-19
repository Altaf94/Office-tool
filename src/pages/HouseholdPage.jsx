import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearTokens,
  fetchRegistrations,
  fetchFormIdByCNIC,
  fetchHouseholdInfo,
  approveMember,
} from '../lib/didarApi'

const STATUS_MAP = { 1: 'Draft', 2: 'Submitted', 3: 'Approved', 4: 'Rejected' }

function formatDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  if (isNaN(d)) return str
  return d.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })
}

function StatusBadge({ status }) {
  const s = (status || '').toLowerCase()
  const styles = {
    approved:  { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
    submitted: { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
    draft:     { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
    rejected:  { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
    pending:   { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  }
  const style = styles[s] || styles.draft
  return (
    <span style={{
      ...style,
      padding: '2px 10px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: '600',
      display: 'inline-block',
    }}>{status || '—'}</span>
  )
}

export default function HouseholdPage() {
  const navigate = useNavigate()
  const [familyId, setFamilyId] = useState('')
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [rows, setRows] = useState(null)
  const [registrations, setRegistrations] = useState([])
  const [householdInfo, setHouseholdInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [approvingKey, setApprovingKey] = useState(null)
  const [viewerUrl, setViewerUrl] = useState(null) // string | null
  const [imgFailed, setImgFailed] = useState(false)

  function openAttachment(url) {
    setImgFailed(false)
    setViewerUrl(url)
  }

  function closeViewer() {
    setViewerUrl(null)
    setImgFailed(false)
  }

  const setOk = (text) => { setMessage(text); setMessageIsError(false) }
  const setErr = (text) => { setMessage(text); setMessageIsError(true) }

  const handleSearch = useCallback(async () => {
    const input = familyId.trim()
    if (!input) { setErr('Enter household ID or CNIC.'); return }
    setLoading(true)
    setRows(null)
    setRegistrations([])
    setHouseholdInfo(null)
    setOk('Loading…')
    try {
      let formId = input
      const isCNIC = /^\d+$/.test(input) || /^\d{13}[A-Za-z]/.test(input)
      if (isCNIC) {
        setOk('Fetching FormID from CNIC…')
        formId = await fetchFormIdByCNIC(input)
        setOk(`Found FormID: ${formId}. Loading data…`)
      }
      const householdData = await fetchHouseholdInfo(formId)
      setHouseholdInfo(householdData)
      const familyMembers = householdData?.FamilyMembers || []
      const displayedMembers = isCNIC
        ? familyMembers.filter((m) => (m.IdNumber || m.CNIC || '').toLowerCase() === input.toLowerCase())
        : familyMembers
      setRows(displayedMembers)
      setOk('Loading registration status…')
      const regs = await fetchRegistrations(formId)
      setRegistrations(regs)
      if (!displayedMembers.length) setOk('No family members found for this CNIC.')
      else setOk(`Found ${displayedMembers.length} family member(s).`)
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [familyId, navigate])

  function logout() { clearTokens(); navigate('/login', { replace: true }) }

  async function handleApprove(famId, memberId) {
    if (!famId || memberId == null || memberId === '') { setErr('Missing FamilyId or FamilyMemberId for this row.'); return }
    const key = `${memberId}`
    setApprovingKey(key)
    setOk('Approving…')
    try {
      await approveMember(famId, memberId)
      setOk('Approved. Refreshing…')
      await handleSearch()
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setApprovingKey(null)
    }
  }

  function onKeyDown(e) { if (e.key === 'Enter') handleSearch() }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #0d9668, #0a7)',
        color: '#fff',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '60px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{ fontWeight: '700', fontSize: '1rem', letterSpacing: '0.01em' }}>Intent Verification Portal</span>
            <span style={{ fontWeight: '600', fontSize: '0.85rem', letterSpacing: '0.01em', marginTop: '2px' }}>For local Council use only</span>
          </div>

        </div>
        <button
          type="button"
          onClick={logout}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >Log out</button>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '28px 20px' }}>

        {/* Warning banner */}
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderLeft: '4px solid #f59e0b',
          borderRadius: '7px',
          padding: '10px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13.5px',
          color: '#92400e',
          fontWeight: '600',
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Please verify all documents before approving
        </div>

        {/* Search card */}
        <div style={{
          background: '#fff',
          borderRadius: '10px',
          boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <label htmlFor="family_id" style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            Household ID (Form ID) or CNIC
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              id="family_id"
              type="text"
              placeholder="e.g. HU9999-25202570 or 4210161098009"
              autoComplete="off"
              value={familyId}
              onChange={(e) => setFamilyId(e.target.value)}
              onKeyDown={onKeyDown}
              style={{
                flex: 1,
                minWidth: '220px',
                padding: '10px 14px',
                fontSize: '14px',
                border: '1px solid #d1d5db',
                borderRadius: '7px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={loading}
              style={{
                padding: '10px 28px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#fff',
                background: loading ? '#6ee7b7' : '#0d9668',
                border: 'none',
                borderRadius: '7px',
                cursor: loading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {message ? (
            <div style={{
              marginTop: '12px',
              padding: '9px 14px',
              borderRadius: '6px',
              fontSize: '13.5px',
              background: messageIsError ? '#fff5f5' : '#f0fdf4',
              border: `1px solid ${messageIsError ? '#fca5a5' : '#86efac'}`,
              color: messageIsError ? '#b91c1c' : '#166534',
            }}>{message}</div>
          ) : null}
        </div>

        {/* Household Info card */}
        {householdInfo ? (
          <div style={{
            background: '#fff',
            borderRadius: '10px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: '700', color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0d9668" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              Household Info
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Form ID', value: householdInfo.FormId },
                { label: 'Jamat Khana', value: householdInfo.JamatKhanaId },
                { label: 'Household CNIC', value: householdInfo.HouseHoldCNIC },
                { label: 'Registration Form Status', value: STATUS_MAP[householdInfo.FormStatus] ?? householdInfo.FormStatus, badge: true },
                { label: 'Created', value: formatDate(householdInfo.CreatedAt) },
                { label: 'Updated', value: formatDate(householdInfo.UpdatedAt) },
              ].map(({ label, value, badge }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: '7px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>{label}</div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#111' }}>
                    {badge ? <StatusBadge status={value || '—'} /> : (value || '—')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Family Members card */}
        {rows && rows.length > 0 ? (
          <div style={{
            background: '#fff',
            borderRadius: '10px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
            padding: '24px',
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: '700', color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0d9668" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
              Family Members
              <span style={{ marginLeft: '4px', background: '#d1fae5', color: '#065f46', borderRadius: '999px', fontSize: '11px', fontWeight: '700', padding: '1px 9px' }}>{rows.length}</span>
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Name', 'ID Number', 'Intent', 'Attachment 1', 'Attachment 2', 'Affiliation Type', 'Affiliation Name', 'Affiliation CNIC', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const id = row.Id ?? row.id
                    const idNumber = row.IdNumber || row.CNIC || ''
                    const fullName = row.FullName || ''
                    const reg = registrations.find((r) => String(r.FamilyMemberId ?? r.familyMemberId) === String(id))
                    const hasRegistration = Boolean(reg)
                    const status = hasRegistration ? (reg?.ApprovalStatus || reg?.approval_status || 'Pending') : '-'
                    const approved = status.toLowerCase() === 'approved'
                    const busy = approvingKey === String(id)
                    const attachment1 = reg?.Attachment1Key || ''
                    const attachment2 = reg?.Attachment2Key || ''
                    const affiliationType = reg?.AffiliationType || '—'
                    const affiliationName = reg?.AffiliationName || '—'
                    const affiliationCNIC = reg?.AffiliationCNIC || '—'

                    return (
                      <tr key={id} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '11px 12px', fontWeight: '600', color: '#111' }}>{fullName}</td>
                        <td style={{ padding: '11px 12px', fontFamily: 'monospace', fontSize: '13px', color: '#374151' }}>{idNumber}</td>
                        <td style={{ padding: '11px 12px' }}><StatusBadge status={status} /></td>
                        <td style={{ padding: '11px 12px' }}>
                          {attachment1 ? (
                            <button type="button" onClick={() => void openAttachment(attachment1)} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                              borderRadius: '5px', padding: '3px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              View
                            </button>
                          ) : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 12px' }}>
                          {attachment2 ? (
                            <button type="button" onClick={() => void openAttachment(attachment2)} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                              borderRadius: '5px', padding: '3px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              View
                            </button>
                          ) : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 12px', color: '#374151' }}>{affiliationType}</td>
                        <td style={{ padding: '11px 12px', color: '#374151' }}>{affiliationName}</td>
                        <td style={{ padding: '11px 12px', fontFamily: 'monospace', fontSize: '13px', color: '#374151' }}>{affiliationCNIC}</td>
                        <td style={{ padding: '11px 12px' }}>
                          {hasRegistration && !approved && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleApprove(householdInfo?.FormId, id)}
                              style={{
                                background: busy ? '#6ee7b7' : '#0d9668',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: busy ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {busy ? '…' : 'Approve'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </main>

      {/* Attachment viewer modal */}
      {viewerUrl && (
        <div
          onClick={closeViewer}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '10px', boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
              maxWidth: '90vw', maxHeight: '90vh', width: '860px',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
            }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: '#111' }}>Attachment Preview</span>
              <button
                type="button"
                onClick={closeViewer}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#6b7280', fontSize: '20px', lineHeight: 1, padding: '0 4px',
                }}
                aria-label="Close"
              >✕</button>
            </div>

            {/* Modal body — embed URL directly; img ignores Content-Disposition */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', padding: '16px' }}>
              {!imgFailed ? (
                <img
                  src={viewerUrl}
                  alt="Attachment"
                  onError={() => setImgFailed(true)}
                  style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '6px', objectFit: 'contain' }}
                />
              ) : (
                <iframe
                  src={viewerUrl}
                  title="Attachment"
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '6px' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
