import { useState } from 'react'

// The backend API's address. Set VITE_API_URL at build/deploy time to
// point at the live backend; falls back to the local dev server.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

/**
 * AddressSearch
 *
 * A simple search box: type a full address, hit Enter, the map jumps
 * there. Uses the US Census Bureau's geocoder (via /api/geocode) — no
 * live suggestions dropdown.
 *
 * An earlier version added live-as-you-type suggestions using Photon
 * (OpenStreetMap-based), but Photon's coverage is thin for rural
 * addresses specifically — which is most of this tool's actual target
 * audience (farmland). Simpler and more reliable wins for now; live
 * suggestions may be worth revisiting later with a paid, more complete
 * service (e.g. Mapbox) during a polish pass.
 */
function AddressSearch({ onLocationSelected }) {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async (event) => {
    event.preventDefault()

    if (!query.trim()) return

    setIsSearching(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: query }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not find that address.')
      }

      onLocationSelected([data.latitude, data.longitude])
    } catch (err) {
      if (err instanceof TypeError) {
        setError('Could not reach the backend. Make sure api.py is running.')
      } else {
        setError(err.message)
      }
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <form className="search-row" onSubmit={handleSearch}>
      <input
        type="text"
        className="address-input"
        placeholder="Enter an address to center the map..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit" className="button button--secondary" disabled={isSearching}>
        {isSearching ? 'Searching...' : 'Go'}
      </button>
      {error && <p className="status-error">{error}</p>}
    </form>
  )
}

export default AddressSearch
