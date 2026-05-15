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
      // Fetch both household info and registrations
      const [householdData, list] = await Promise.all([
        fetchHouseholdInfo(formId),
        fetchRegistrations(formId)
      ])
      setHouseholdInfo(householdData)
      
      // Use family members from household data if available, otherwise use registrations
      const familyMembers = householdData?.FamilyMembers || []
      setRows(familyMembers.length > 0 ? familyMembers : list)
      
      if (familyMembers.length === 0 && list.length === 0) {
        setOk('No family members found for this household.')
      } else {
        const count = familyMembers.length || list.length
        setOk(`${count} family member(s).`)
      }
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

      {(householdInfo?.FamilyMembers?.length > 0 || (rows && rows.length > 0)) ? (
        <>
          <h2>Family Members</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>CNIC</th>
                <th>Intent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {/* Show family members from household info first */}
              {householdInfo?.FamilyMembers?.map((member) => {
                const id = member.Id ?? member.id
                const cnic = member.IdNumber || ''
                const formId = householdInfo.FormId || ''
                // Try to find matching approval data from event-registrations
                const approvalData = rows?.find(r => 
                  (r.CNIC === cnic || r.IdNumber === cnic) && 
                  (r.FamilyId === formId || r.FormId === formId)
                )
                const stat = approvalData?.ApprovalStatus || approvalData?.approval_status || ''
                const memId = approvalData?.FamilyMemberId ?? approvalData?.familyMemberId ?? id
                const approved = String(stat).toLowerCase() === 'approved'
                const busy = approvingKey === String(memId)
                const hasApprovalData = Boolean(approvalData)
                
                return (
                  <tr key={`household-${id}-${cnic}`}>
                    <td>{member.FullName || ''}</td>
                    <td>{cnic}</td>
                    <td>{stat || '-'}</td>
                    <td className="row-actions">
                      {hasApprovalData ? (
                        <button
                          type="button"
                          disabled={approved || busy}
                          onClick={() => void handleApprove(formId, memId)}
                        >
                          {busy ? '…' : 'Approve'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
              {/* Show additional members from event-registrations that aren't in household info */}
              {rows?.filter(row => {
                const rowCnic = row.CNIC || row.IdNumber || ''
                return !householdInfo?.FamilyMembers?.some(m => m.IdNumber === rowCnic)
              }).map((row) => {
                const id = row.Id ?? row.id
                const memId = row.FamilyMemberId ?? row.familyMemberId ?? id
                const stat = row.ApprovalStatus || row.approval_status || ''
                const famRow = row.FamilyId || row.familyId || row.FormId || ''
                const cnic = row.CNIC || row.IdNumber || ''
                const approved = String(stat).toLowerCase() === 'approved'
                const busy = approvingKey === String(memId)
                
                return (
                  <tr key={`registration-${id}-${memId}`}>
                    <td>{row.FullName || ''}</td>
                    <td>{cnic}</td>
                    <td>{stat}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        disabled={approved || busy}
                        onClick={() => void handleApprove(famRow, memId)}
                      >
                        {busy ? '…' : 'Approve'}
                      </button>
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
