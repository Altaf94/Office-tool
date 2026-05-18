import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearTokens,
  fetchRegistrations,
  fetchFormIdByCNIC,
  fetchHouseholdInfo,
  approveMember,
} from '../lib/didarApi'

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

  const setOk = (text) => {
    setMessage(text)
    setMessageIsError(false)
  }
  const setErr = (text) => {
    setMessage(text)
    setMessageIsError(true)
  }

  const handleSearch = useCallback(async () => {
    const input = familyId.trim()
    if (!input) {
      setErr('Enter household ID or CNIC.')
      return
    }
    setLoading(true)
    setRows(null)
    setRegistrations([])
    setHouseholdInfo(null)
    setOk('Loading…')
    try {
      let formId = input
      // Check if input is CNIC (numeric only, typically 13 digits)
      const isCNIC = /^\d+$/.test(input)
      if (isCNIC) {
        setOk('Fetching FormID from CNIC…')
        formId = await fetchFormIdByCNIC(input)
        setOk(`Found FormID: ${formId}. Loading data…`)
      }
      // Fetch household info which includes family members
      const householdData = await fetchHouseholdInfo(formId)
      setHouseholdInfo(householdData)
      
      // Extract family members from household data
      const familyMembers = householdData?.FamilyMembers || []
      setRows(familyMembers)
      
      // Fetch registrations to get approval status
      setOk('Loading registration status…')
      const regs = await fetchRegistrations(formId)
      setRegistrations(regs)
      
      if (!familyMembers.length) setOk('No family members found for this household.')
      else setOk(`Found ${familyMembers.length} family member(s).`)
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') {
        navigate('/login', { replace: true })
        return
      }
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [familyId, navigate])

  function logout() {
    clearTokens()
    navigate('/login', { replace: true })
  }

  async function handleApprove(famId, memberId) {
    if (!famId || memberId == null || memberId === '') {
      setErr('Missing FamilyId or FamilyMemberId for this row.')
      return
    }

    const key = `${memberId}`
    setApprovingKey(key)
    setOk('Approving…')
    try {
      await approveMember(famId, memberId)
      setOk('Approved. Refreshing…')
      await handleSearch()
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') {
        navigate('/login', { replace: true })
        return
      }
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setApprovingKey(null)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="layout">
      <p className="topbar">
        <button type="button" className="linkish" onClick={logout}>
          Log out
        </button>
      </p>
      <h1>Didar household utility</h1>

      <label htmlFor="family_id">Household ID (Form ID) or CNIC</label>
      <input
        id="family_id"
        type="text"
        placeholder="e.g. HU9999-25202570 or 4210161098009"
        autoComplete="off"
        value={familyId}
        onChange={(e) => setFamilyId(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="actions">
        <button type="button" className="btn-primary" onClick={() => void handleSearch()} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {message ? <div className={messageIsError ? 'err' : 'ok'}>{message}</div> : null}

      {householdInfo ? (
        <>
          <h2>Household Info</h2>
          <table className="tbl" style={{ marginBottom: '2rem' }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 'bold' }}>Form ID</td>
                <td>{householdInfo.FormId || ''}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>Jamat Khana</td>
                <td>{householdInfo.JamatKhanaId || ''}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>Household CNIC</td>
                <td>{householdInfo.HouseHoldCNIC || ''}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>Form Status</td>
                <td>{householdInfo.FormStatus ?? ''}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>Created</td>
                <td>{householdInfo.CreatedAt || ''}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>Updated</td>
                <td>{householdInfo.UpdatedAt || ''}</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}

      {rows && rows.length > 0 ? (
        <>
          <h2>Family Members</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID Number</th>
                <th>Intent</th>
                <th>Attachment 1</th>
                <th>Attachment 2</th>
                <th>Affiliation Type</th>
                <th>Affiliation Name</th>
                <th>Affiliation CNIC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = row.Id ?? row.id
                const idNumber = row.IdNumber || row.CNIC || ''
                const fullName = row.FullName || ''
                // Find registration status from event-registrations API
                const reg = registrations.find((r) => String(r.FamilyMemberId ?? r.familyMemberId) === String(id))
                const hasRegistration = Boolean(reg)
                const status = hasRegistration ? (reg?.ApprovalStatus || reg?.approval_status || 'Pending') : '-'
                const approved = status.toLowerCase() === 'approved'
                const busy = approvingKey === String(id)
                
                // Extract additional fields from registration
                const attachment1 = reg?.Attachment1Key || ''
                const attachment2 = reg?.Attachment2Key || ''
                const affiliationType = reg?.AffiliationType || '-'
                const affiliationName = reg?.AffiliationName || '-'
                const affiliationCNIC = reg?.AffiliationCNIC || '-'
                
                return (
                  <tr key={id}>
                    <td>{fullName}</td>
                    <td>{idNumber}</td>
                    <td>{status}</td>
                    <td>
                      {attachment1 ? (
                        <a href={attachment1} target="_blank" rel="noopener noreferrer">View</a>
                      ) : '-'}
                    </td>
                    <td>
                      {attachment2 ? (
                        <a href={attachment2} target="_blank" rel="noopener noreferrer">View</a>
                      ) : '-'}
                    </td>
                    <td>{affiliationType}</td>
                    <td>{affiliationName}</td>
                    <td>{affiliationCNIC}</td>
                    <td className="row-actions">
                      {hasRegistration && !approved && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleApprove(householdInfo?.FormId, id)}
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
        </>
      ) : null}
    </div>
  )
}
