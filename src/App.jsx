import { useRef, useState } from 'react'
import './App.css'

// Public, unauthenticated iTunes Search API. No Spotify credentials or user accounts.
// Only track/artist names and official store URLs are used; no audio or cover artwork.
const SEARCH_API = 'https://itunes.apple.com/search'
const MOODS = ['Happy', 'Sad', 'Calm', 'Energetic', 'Romantic']
const QUESTIONS = [
  'How are you feeling today?',
  'Name one artist you like...',
  'Name another artist you like...',
  'Tell us one more artist...',
]

// These are *title keywords*, NOT verified emotional tags or audio analysis.
const MOOD_WORDS = {
  happy: ['happy', 'smile', 'sun', 'joy', 'dance', 'good', 'celebrate', 'party', 'love', 'bright'],
  sad: ['sad', 'cry', 'tears', 'alone', 'lonely', 'miss', 'broken', 'hurt', 'goodbye', 'blue'],
  calm: ['calm', 'quiet', 'peace', 'slow', 'breathe', 'dream', 'sleep', 'soft', 'gentle', 'rest'],
  energetic: ['dance', 'run', 'fire', 'power', 'party', 'move', 'jump', 'alive', 'wild', 'energy'],
  romantic: ['love', 'heart', 'kiss', 'baby', 'forever', 'darling', 'romance', 'together', 'mine'],
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalized = (value) => value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function matchesArtist(requested, actual) {
  const expected = normalized(requested)
  const found = normalized(actual)
  // Some API artist strings contain featured acts; don't accept partial-name matches.
  return found === expected || found.startsWith(`${expected} feat `) || found.startsWith(`${expected} featuring `)
}

async function getTracks(artist, signal) {
  const url = new URL(SEARCH_API)
  url.searchParams.set('term', artist)
  url.searchParams.set('entity', 'song')
  url.searchParams.set('attribute', 'artistTerm')
  url.searchParams.set('limit', '100')
  url.searchParams.set('country', 'US')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url.toString(), { signal })
      if (!response.ok) {
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
          await wait(1200 * (attempt + 1))
          continue
        }
        throw new Error(`Music search temporarily failed (HTTP ${response.status}). Please try again later.`)
      }
      const data = await response.json()
      if (!Array.isArray(data.results)) throw new Error('Music search returned an unexpected response.')
      return data.results.filter((track) =>
        track.kind === 'song' &&
        typeof track.trackName === 'string' &&
        typeof track.artistName === 'string' &&
        matchesArtist(artist, track.artistName) &&
        typeof track.trackViewUrl === 'string' &&
        track.trackViewUrl.startsWith('https://')
      )
    } catch (error) {
      if (signal.aborted) throw error
      if (error instanceof TypeError) {
        throw new Error('Could not reach the music service. Check your connection or browser privacy settings, then try again.')
      }
      throw error
    }
  }
  return []
}

function rankTracks(tracks, mood) {
  const words = MOOD_WORDS[normalized(mood)] || []
  const unique = new Map()
  tracks.forEach((track) => {
    const key = `${normalized(track.artistName)}:${normalized(track.trackName)}`
    if (!unique.has(key)) unique.set(key, track)
  })
  return [...unique.values()].map((track) => {
    const titleWords = normalized(track.trackName).split(' ')
    const score = words.reduce((total, word) => total + (titleWords.includes(word) ? 1 : 0), 0)
    return { id: track.trackId, title: track.trackName, artist: track.artistName,
      url: track.trackViewUrl, score }
  }).sort((a, b) => b.score - a.score || a.artist.localeCompare(b.artist)).slice(0, 18)
}

function App() {
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [mood, setMood] = useState('')
  const [artists, setArtists] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recommendations, setRecommendations] = useState([])
  const [missingArtists, setMissingArtists] = useState([])
  const requestController = useRef(null)

  const finished = step === 4
  const collectedData = [...(mood ? [mood] : []), ...artists]
  const matched = recommendations.filter((song) => song.score > 0)
  const discoveries = recommendations.filter((song) => song.score === 0)

  async function findSongs(chosenArtists, chosenMood) {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setLoading(true)
    setError('')
    setRecommendations([])
    setMissingArtists([])
    try {
      const gathered = []
      const notFound = []
      for (const [index, artist] of chosenArtists.entries()) {
        if (index) await wait(400) // Respect public API request limits.
        if (controller.signal.aborted) return
        const found = await getTracks(artist, controller.signal)
        if (found.length) gathered.push(...found)
        else notFound.push(artist)
      }
      if (controller.signal.aborted) return
      setMissingArtists(notFound)
      setRecommendations(rankTracks(gathered, chosenMood))
      if (!gathered.length) {
        setError('No tracks were found for those names. Check the spelling and try different artists.')
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason.message || 'Unable to load recommendations.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    const value = input.trim().replace(/\s+/g, ' ')
    if (!value) {
      setError(step === 0 ? 'Please choose or enter a mood.' : 'Please enter an artist name.')
      return
    }
    if (step === 0) {
      setMood(value)
    } else {
      if (artists.some((artist) => normalized(artist) === normalized(value))) {
        setError('You already chose that artist. Enter a different artist.')
        return
      }
      const nextArtists = [...artists, value]
      setArtists(nextArtists)
      if (step === 3) void findSongs(nextArtists, mood)
    }
    setInput('')
    setError('')
    setStep((previous) => previous + 1)
  }

  function handleReset() {
    requestController.current?.abort()
    setStep(0)
    setInput('')
    setMood('')
    setArtists([])
    setError('')
    setLoading(false)
    setRecommendations([])
    setMissingArtists([])
  }

  return (
    <div className="app">
      <section className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <p className="eyebrow">Mood-based music discovery</p>
          <h1>Musically Moody</h1>
          <p className="hero-subtext">Discover music recommendations based on your mood and favorite artists.</p>
          {!finished ? (
            <>
              <p aria-live="polite">Step {step + 1} of 4 — {step === 0 ? 'Your mood' : `Artist ${step} of 3`}</p>
              <form onSubmit={handleSubmit} autoComplete="off" className="search-form">
                <div className="search-bar">
                  <input
                    type="search"
                    name="music-discovery-query"
                    className="search-input"
                    aria-label={step === 0 ? 'Your mood' : `Favorite artist ${step}`}
                    placeholder={QUESTIONS[step]}
                    value={input}
                    onChange={(event) => { setInput(event.target.value); if (error) setError('') }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={100}
                  />
                  <button type="submit" className="search-button">{step === 3 ? 'FIND SONGS' : 'NEXT'}</button>
                </div>
              </form>
              {error && <p role="alert" className="form-error">{error}</p>}
              {step === 0 && (
                <div className="mood-buttons" aria-label="Suggested moods">
                  {MOODS.map((suggestion) => (
                    <button type="button" key={suggestion}
                      onClick={() => { setInput(suggestion); setError('') }}
                      aria-pressed={input.toLowerCase() === suggestion.toLowerCase()}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div aria-live="polite">
              <h2>Your Music Discoveries</h2>
              <p>{loading ? 'Searching the public iTunes music catalog…' : 'Browse songs from your selected artists below.'}</p>
              <button type="button" className="search-button" onClick={handleReset}>START OVER</button>
            </div>
          )}
        </div>
      </section>

      {finished && (
        <section className="results-section" aria-live="polite" aria-busy={loading}>
          <div className="section-heading">
            <h2>Songs for {mood}</h2>
            <p>Real music metadata from the public iTunes Search API. Mood hints use song-title words only, not verified emotional analysis.</p>
          </div>
          {loading && <p className="results-status" role="status">Looking up your artists. This may take a few seconds…</p>}
          {error && <p className="results-status form-error" role="alert">{error} <button type="button" onClick={() => findSongs(artists, mood)}>Try again</button></p>}
          {missingArtists.length > 0 && !loading && (
            <p className="results-status">No exact-name catalog tracks found for: {missingArtists.join(', ')}. You can start over and try different names.</p>
          )}
          {!loading && recommendations.length > 0 && (
            <>
              {matched.length > 0 && <h3 className="results-subheading">Possible mood matches (title-keyword hints)</h3>}
              {matched.length > 0 && <div className="song-grid">{matched.map((song) => <SongCard key={`${song.artist}-${song.title}`} song={song} hint />)}</div>}
              <h3 className="results-subheading">More songs by your artists</h3>
              {discoveries.length > 0 ? <div className="song-grid">{discoveries.map((song) => <SongCard key={`${song.artist}-${song.title}`} song={song} />)}</div> : <p className="results-status">All the returned songs are shown above.</p>}
            </>
          )}
        </section>
      )}

      <section className="info-section">
        <div className="section-heading"><h2>How It Works</h2><p>Musically Moody combines your mood and artist preferences to help you discover music.</p></div>
        <div className="cards">
          <div className="card"><h3>1. Choose a Mood</h3><p>Start by entering how you feel, or click one of the mood buttons.</p></div>
          <div className="card"><h3>2. Add Artists You Like</h3><p>Tell us three different artists you enjoy.</p></div>
          <div className="card"><h3>3. Explore Songs</h3><p>Discover tracks from the public music catalog, with clearly labeled mood hints.</p></div>
        </div>
      </section>
      <section className="preview-section">
        <div className="section-heading"><h2>Your Inputs</h2><p>Your mood and favorite artists as you enter them.</p></div>
        <div className="preview-box" aria-live="polite">
          {collectedData.length > 0 ? (
            <div className="tag-list">{collectedData.map((item, index) => <span key={`${index}-${item}`} className="tag">{index === 0 ? 'Mood: ' : `Artist ${index}: `}{item}</span>)}</div>
          ) : <p className="empty-text">No inputs yet. Start by typing your mood above.</p>}
        </div>
      </section>
      <section className="about-section">
        <div className="section-heading"><h2>About the Project</h2><p>Musically Moody is a React website for music discovery. Track names and official store links come from Apple's public iTunes Search API. No copyrighted audio, artwork, or lyrics are hosted. Mood hints are simple keyword estimates and may be inaccurate.</p></div>
      </section>
    </div>
  )
}

function SongCard({ song, hint = false }) {
  return (
    <article className="song-card">
      <span aria-hidden="true" className="song-icon">♫</span>
      <div className="song-details">
        <h4>{song.title}</h4>
        <p>{song.artist}</p>
        {hint && <span className="song-hint">Title suggests selected mood</span>}
      </div>
      <a href={song.url} target="_blank" rel="noopener noreferrer" aria-label={`Find ${song.title} by ${song.artist} in the iTunes Store`}>View in iTunes ↗</a>
    </article>
  )
}

export default App
