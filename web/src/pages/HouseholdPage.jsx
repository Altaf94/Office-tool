import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearTokens,
  fetchRegistrations,
  approveMember,
} from '../lib/didarApi'

export default function HouseholdPage() {
  const navigate = useNavigate()
  const [familyId, setFamilyId] = useState('')
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [rows, setRows] = useState(null)
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
    const fam = familyId.trim()
    if (!fam) {
      setErr('Enter household ID.')
      return
    }
    setLoading(true)
    setRows(null)
    setOk('Loading…')
    try {
      const list = await fetchRegistrations(fam)
      setRows(list)
      if (!list.length) setOk('No registrations for this household.')
      else setOk(`${list.length} registration(s).`)
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

      <label htmlFor="family_id">Household ID (Form ID)</label>
      <input
        id="family_id"
        type="text"
        placeholder="e.g. JK001-39366661"
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

      {rows && rows.length > 0 ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Registration Id</th>
              <th>Family member Id</th>
              <th>Family member</th>
              <th>CNIC</th>
              <th>Decision status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row.Id ?? row.id
              const memId = row.FamilyMemberId ?? row.familyMemberId ?? ''
              const stat = row.ApprovalStatus || row.approval_status || ''
              const famRow = row.FamilyId || row.familyId || ''
              const approved = String(stat).toLowerCase() === 'approved'
              const busy = approvingKey === String(memId)
              return (
                <tr key={`${id}-${memId}`}>
                  <td>{id}</td>
                  <td>{memId}</td>
                  <td>{row.FullName || ''}</td>
                  <td>{row.CNIC || ''}</td>
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
      ) : null}
    </div>
  )
}
