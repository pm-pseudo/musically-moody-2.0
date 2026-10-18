import { useEffect, useRef, useState } from 'react'
import './App.css'

// Public iTunes Search API; no credentials, streaming, downloads, or user accounts.
const SEARCH_API = 'https://itunes.apple.com/search'
const MOODS = ['Happy', 'Sad', 'Calm', 'Energetic', 'Romantic', 'Hopeful', 'Nostalgic', 'Focused', 'Confident', 'Dreamy', 'Relaxed', 'Heartbroken']
const QUESTIONS = [
  'Choose the mood you want to hear…',
  'First favorite artist…',
  'Second favorite artist…',
  'Third favorite artist…',
]
// Genre associations are broad editorial estimates, NOT verified track mood or audio analysis.
const GENRE_HINTS = {
  Happy: ['dance', 'pop', 'disco', 'funk', 'reggae', 'ska', 'soul'],
  Sad: ['singer/songwriter', 'folk', 'blues', 'alternative', 'indie', 'acoustic'],
  Calm: ['ambient', 'new age', 'classical', 'instrumental', 'jazz', 'acoustic', 'easy listening'],
  Energetic: ['dance', 'electronic', 'hip-hop', 'rap', 'rock', 'metal', 'punk', 'house', 'techno'],
  Romantic: ['r&b', 'soul', 'jazz', 'slow jam', 'adult contemporary', 'singer/songwriter'],
  Hopeful: ['pop', 'soul', 'gospel', 'indie', 'folk'],
  Nostalgic: ['classic rock', 'oldies', 'soul', 'folk', 'pop'],
  Focused: ['ambient', 'instrumental', 'classical', 'electronic', 'jazz'],
  Confident: ['hip-hop', 'rap', 'dance', 'rock', 'pop'],
  Dreamy: ['dream pop', 'ambient', 'indie', 'alternative', 'electronic'],
  Relaxed: ['ambient', 'chill', 'acoustic', 'jazz', 'easy listening', 'new age'],
  Heartbroken: ['blues', 'singer/songwriter', 'folk', 'soul', 'alternative'],
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function normalize(value) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function sameArtist(wanted, actual) {
  const normalizedWanted = normalize(wanted)
  const normalizedActual = normalize(actual)

  return (
    normalizedActual === normalizedWanted ||
    normalizedActual.startsWith(`${normalizedWanted} feat `) ||
    normalizedActual.startsWith(`${normalizedWanted} featuring `) ||
    normalizedActual.startsWith(`${normalizedWanted} and `)
  )
}

function moodScore(track, mood) {
  const genre = (track.primaryGenreName || '').toLowerCase()
  return (GENRE_HINTS[mood] || []).reduce(
    (score, hint) => score + (genre.includes(hint) ? 1 : 0),
    0,
  )
}

async function getTracks(artist, signal) {
  const url = new URL(SEARCH_API)
  for (const [key, value] of Object.entries({
    term: artist,
    media: 'music',
    entity: 'song',
    attribute: 'artistTerm',
    limit: '100',
    country: 'US',
  })) {
    url.searchParams.set(key, value)
  }

  for (let retry = 0; retry < 3; retry += 1) {
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        if ([429, 500, 502, 503, 504].includes(response.status) && retry < 2) {
          await sleep(1000 * (retry + 1))
          continue
        }
        throw new Error(`Music catalog returned HTTP ${response.status}. Please try again.`)
      }

      const data = await response.json()
      if (!Array.isArray(data.results)) {
        throw new Error('The music catalog returned an unexpected response.')
      }

      return data.results.filter(
        (track) =>
          track.kind === 'song' &&
          typeof track.trackName === 'string' &&
          typeof track.artistName === 'string' &&
          sameArtist(artist, track.artistName) &&
          typeof track.trackViewUrl === 'string' &&
          /^https:\/\//.test(track.trackViewUrl),
      )
    } catch (error) {
      if (signal.aborted) {
        throw error
      }
      if (error instanceof TypeError) {
        throw new Error('Cannot reach the music catalog. Check your internet connection and try again.')
      }
      throw error
    }
  }

  return []
}

function chooseSongs(artistLists, mood) {
  const seen = new Set()

  const sortedLists = artistLists.map(({ artist, tracks }) => ({
    artist,
    tracks: tracks
      .filter((track) => {
        const key = `${normalize(track.artistName)}:${normalize(track.trackName)}`
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
      .map((track) => ({
        id: track.trackId,
        title: track.trackName,
        artist: track.artistName,
        genre: track.primaryGenreName || 'Genre not listed',
        itunes: track.trackViewUrl,
        score: moodScore(track, mood),
      }))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)),
  }))

  const result = []
  for (let index = 0; index < 8 && result.length < 18; index += 1) {
    for (const item of sortedLists) {
      if (item.tracks[index]) {
        result.push(item.tracks[index])
      }
      if (result.length >= 18) {
        break
      }
    }
  }

  return result
}

function spotifySearch(song) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`
}

export default function App() {
  const [page, setPage] = useState('home')
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [mood, setMood] = useState('')
  const [artists, setArtists] = useState([])
  const [results, setResults] = useState([])
  const [missing, setMissing] = useState([])
  const [error, setError] = useState('')
  const controllerRef = useRef(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  function goToTop() {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  function changePage(nextPage) {
    setPage(nextPage)
    setError('')
    goToTop()
  }


  function reset() {
    controllerRef.current?.abort()
    setStep(0)
    setInput('')
    setMood('')
    setArtists([])
    setResults([])
    setMissing([])
    changePage('search')
  }

  async function searchSongs(chosenArtists, chosenMood) {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setResults([])
    setMissing([])
    changePage('loading')

    try {
      const foundLists = []
      const absent = []

      for (const [index, artist] of chosenArtists.entries()) {
        if (index) {
          await sleep(450)
        }
        if (controller.signal.aborted) {
          return
        }
        const tracks = await getTracks(artist, controller.signal)
        if (tracks.length) {
          foundLists.push({ artist, tracks })
        } else {
          absent.push(artist)
        }
      }

      if (controller.signal.aborted) {
        return
      }

      setResults(chooseSongs(foundLists, chosenMood))
      setMissing(absent)
      changePage('results')
    } catch (caughtError) {
      if (!controller.signal.aborted) {
        changePage('results')
        setError(caughtError.message || 'Unable to load recommendations.')
      }
    }
  }

  function submit(event) {
    event.preventDefault()
    const value = input.trim().replace(/\s+/g, ' ')

    if (!value) {
      setError(step ? 'Please enter an artist.' : 'Please choose a mood.')
      return
    }

    if (step === 0) {
      if (!MOODS.some((moodOption) => normalize(moodOption) === normalize(value))) {
        setError('Please choose one of the available moods.')
        return
      }
      setMood(MOODS.find((moodOption) => normalize(moodOption) === normalize(value)))
    } else {
      if (artists.length >= 8) {
        setError('You can choose up to 8 artists for one mix. Select Find Songs to continue.')
        return
      }
      if (artists.some((artist) => normalize(artist) === normalize(value))) {
        setError('Choose different artists without duplicates.')
        return
      }
      const nextArtists = [...artists, value]
      setArtists(nextArtists)

    }

    setInput('')
    setError('')
    setStep((currentStep) => currentStep + 1)
  }

  function finishArtistSelection() {
    if (artists.length < 3) {
      setError('Please add at least three artists first.')
      return
    }
    void searchSongs(artists, mood)
  }

  return (
    <div className="app phase5">
      <header className="site-header">
        <button type="button" className="brand brand-button" onClick={() => changePage('home')}>
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-heart brand-heart-left">♥</span>
            <span className="brand-note">♫</span>
            <span className="brand-heart brand-heart-right">♥</span>
          </span>
          musically<span>moody</span>
        </button>


      </header>

      {page === 'home' && (
        <>
          <main className="hero-section home-hero">
            <div className="hero-overlay" />
            <div className="hero-content home-content">
              <p className="eyebrow">
                <span className="live-dot" /> MOOD-BASED MUSIC DISCOVERY
              </p>
              <h1>
                Music for every <span className="gradient-text">mood.</span>
              </h1>
              <p className="hero-subtext">
                Tell us how you feel, add three or more artists, and explore song suggestions that match the vibe you want.
              </p>
              <div className="hero-actions">
                <button type="button" className="search-button big-cta" onClick={() => changePage('search')}>
                  GET STARTED <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </main>

        </>
      )}

      {page === 'search' && (
        <main className="hero-section search-hero">
          <div className="hero-overlay" />
          <div className="hero-content">
            <p className="eyebrow">{step === 0 ? 'STEP 1 · YOUR MOOD' : `ARTIST ${artists.length + 1} · BUILD YOUR MIX`}</p>
            <h1 className="subpage-title">
              Set the <span className="gradient-text">mood.</span>
            </h1>
            <p className="hero-subtext">
              {step === 0 ? 'How do you want your music to feel?' : artists.length < 3 ? `Add artist ${artists.length + 1} of at least 3.` : 'Add another artist, or find your songs whenever you are ready.'}
            </p>

            <div className="step-block">
              <p className="step-label">
                <span>{step === 0 ? 'MOOD' : `${artists.length} ARTISTS ADDED`}</span>
                {step ? (artists.length < 3 ? 'Add at least three artists' : 'Ready to find your songs') : 'Your mood'}
              </p>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Question progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, step * 25 + 25)}
              >
                <span style={{ width: `${Math.min(100, step * 25 + 25)}%` }} />
              </div>
            </div>

            <form className="search-form" autoComplete="off" onSubmit={submit}>
              <div className="search-bar">
                <input
                  type="search"
                  name="music-artist-lookup"
                  aria-label={step ? `Favorite artist ${step}` : 'Your mood'}
                  className="search-input"
                  placeholder={QUESTIONS[step] || 'Another favorite artist…'}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value)
                    setError('')
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={100}
                />
                <button className="search-button" type="submit" disabled={artists.length >= 8}>
                  {step === 0 ? 'NEXT →' : 'ADD ARTIST +'}
                </button>
              </div>
            </form>

            {artists.length >= 3 && (
              <div className="center-action">
                <button type="button" className="search-button big-cta" onClick={finishArtistSelection}>
                  FIND SONGS →
                </button>
                <p className="artist-help">Add up to 8 artists, or continue with your current selection.</p>
              </div>
            )}

            {step === 0 && (
              <div className="mood-buttons" aria-label="Suggested moods">
                {MOODS.map((moodOption) => (
                  <button
                    key={moodOption}
                    type="button"
                    aria-pressed={normalize(input) === normalize(moodOption)}
                    onClick={() => {
                      setInput(moodOption)
                      setError('')
                    }}
                  >
                    {moodOption}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="tag-list selection-summary" aria-live="polite">
              {mood && <span className="tag">Mood: {mood}</span>}
              {artists.map((artist, index) => (
                <span key={`${index}-${artist}`} className="tag">
                  Artist {index + 1}: {artist}
                </span>
              ))}
            </div>

            <button type="button" className="plain-button" onClick={reset}>
              Start over
            </button>
          </div>
        </main>
      )}

      {page === 'loading' && (
        <main className="hero-section loading-screen" aria-busy="true">
          <div className="hero-content" role="status" aria-live="polite">
            <div className="loader-orb" aria-hidden="true">
              ♫
            </div>
            <p className="section-kicker">MAKING YOUR MIX</p>
            <h1 className="subpage-title">
              Gathering your <span className="gradient-text">songs…</span>
            </h1>
            <p className="hero-subtext">
              Searching for tracks by {artists.join(', ')}. Hang tight—this may take a few seconds.
            </p>
            <button type="button" className="plain-button" onClick={reset}>
              Cancel search
            </button>
          </div>
        </main>
      )}

      {page === 'results' && (
        <main className="results-section results-page">
          <div className="section-heading">
            <p className="section-kicker">YOUR SONG SUGGESTIONS</p>
            <h1 className="subpage-title">
              Your <span className="gradient-text">{mood.toLowerCase()}</span> mix.
            </h1>
            <p>Exploring songs by {artists.join(', ')}.</p>
            <p className="mood-disclosure">
              Mood suggestions use broad music genres—not song titles or audio analysis. They are approximate and might not reflect how each song feels to you.
            </p>
          </div>

          {error && (
            <div className="results-status form-error" role="alert">
              {error}
              <div className="center-action">
                <button type="button" className="search-button" onClick={() => searchSongs(artists, mood)}>
                  Try again
                </button>
              </div>
            </div>
          )}

          {!error && missing.length > 0 && (
            <p className="results-status">Couldn't find exact artist results for: {missing.join(', ')}.</p>
          )}

          {!error && results.length === 0 && (
            <p className="results-status">No tracks were found. Try different artists.</p>
          )}

          {results.length > 0 && (
            <>
              <div className="result-totals">
                <span>{results.length} track suggestions</span>
                <span>{results.filter((song) => song.score > 0).length} genre-based mood hints</span>
              </div>

              <div className="song-grid">
                {results.map((song) => (
                  <SongCard key={`${song.artist}-${song.title}`} song={song} />
                ))}
              </div>

              <div className="playlist-box">
                <p className="section-kicker">PLAYLIST OPTIONS</p>
                <h2>Take your mix with you.</h2>
                <p>
                  Automatic playlist creation is under construction. For now, use the song links above to open songs in iTunes or search for them on Spotify.
                </p>
                <div className="playlist-actions">
                  <button type="button" disabled title="Playlist creation coming soon">
                    Open playlist in Spotify · Coming soon
                  </button>
                  <button type="button" disabled title="Playlist creation coming soon">
                    Open playlist in iTunes · Coming soon
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="center-action">
            <button type="button" className="search-button" onClick={reset}>
              ↻ FIND ANOTHER MIX
            </button>
          </div>
        </main>
      )}

      <footer className="site-footer">
        <span className="footer-brand">
          <span className="footer-brand-mark" aria-hidden="true">
            ♫♥
          </span>{' '}
          Musically Moody
        </span>
        <span>This website is still under construction, so some features may not work yet. We hope you enjoy these song suggestions!</span>
        <span>We’re always working to improve this website. Please stay tuned for new and improved features!</span>
        <span>Song metadata: iTunes Search API · No audio hosted · Not affiliated with Spotify or Apple</span>
      </footer>
    </div>
  )
}

function SongCard({ song }) {
  return (
    <article className="song-card">
      <span aria-hidden="true" className="song-icon">
        ♫
      </span>
      <div className="song-details">
        <h2>{song.title}</h2>
        <p>{song.artist}</p>
        <span className="genre-tag">{song.genre}</span>
        {song.score > 0 && <span className="song-hint">Possible mood fit · genre hint</span>}
      </div>
      <div className="song-links">
        <a
          href={song.itunes}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${song.title} by ${song.artist} in iTunes`}
        >
          Open in iTunes ↗
        </a>
        <a
          href={spotifySearch(song)}
          target="_blank"
          rel="noopener noreferrer"
          title="Opens a Spotify search for this song"
          aria-label={`Open Spotify search for ${song.title} by ${song.artist}`}
        >
          Open in Spotify ↗
        </a>
      </div>
    </article>
  )
}
