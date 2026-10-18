import { useState } from 'react'
import './App.css'

const MOODS = ['Happy', 'Sad', 'Calm', 'Energetic', 'Romantic']
const QUESTIONS = [
  'How are you feeling today?',
  'Name one artist you like...',
  'Name another artist you like...',
  'Tell us one more artist...',
]

function App() {
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [mood, setMood] = useState('')
  const [artists, setArtists] = useState([])
  const [error, setError] = useState('')

  const finished = step === 4
  const collectedData = [...(mood ? [mood] : []), ...artists]

  function handleSubmit(event) {
    event.preventDefault()
    const value = input.trim().replace(/\s+/g, ' ')

    if (!value) {
      setError(step === 0 ? 'Please choose or enter a mood.' : 'Please enter an artist name.')
      return
    }

    if (step === 0) {
      // Mood input is user-supplied; MusicBrainz does not validate emotions.
      setMood(value)
    } else {
      if (artists.some((artist) => artist.toLowerCase() === value.toLowerCase())) {
        setError('You already chose that artist. Enter a different artist.')
        return
      }
      // API artist verification and actual recommendations are part of Phase 2.
      setArtists((previous) => [...previous, value])
    }

    setInput('')
    setError('')
    setStep((previous) => previous + 1)
  }

  function handleReset() {
    setStep(0)
    setInput('')
    setMood('')
    setArtists([])
    setError('')
  }

  return (
    <div className="app">
      <section className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <p className="eyebrow">Mood-based music discovery</p>
          <h1>Musically Moody</h1>
          <p className="hero-subtext">
            Discover music recommendations based on your mood and favorite artists.
          </p>

          {!finished ? (
            <>
              <p aria-live="polite">Step {step + 1} of 4 — {step === 0 ? 'Your mood' : `Artist ${step} of 3`}</p>
              <form onSubmit={handleSubmit} className="search-form">
                <div className="search-bar">
                  <input
                    type="text"
                    className="search-input"
                    aria-label={step === 0 ? 'Your mood' : `Favorite artist ${step}`}
                    placeholder={QUESTIONS[step]}
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value)
                      if (error) setError('')
                    }}
                    maxLength={100}
                  />
                  <button type="submit" className="search-button">
                    {step === 3 ? 'FINISH' : 'NEXT'}
                  </button>
                </div>
              </form>
              {error && <p role="alert" style={{ color: '#ffe3e3', fontWeight: 700 }}>{error}</p>}
              {step === 0 && (
                <div className="mood-buttons" aria-label="Suggested moods">
                  {MOODS.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => { setInput(suggestion); setError('') }}
                      aria-pressed={input.toLowerCase() === suggestion.toLowerCase()}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div aria-live="polite">
              <h2>You're all set!</h2>
              <p>Your mood and all three artists have been saved.</p>
              <p>Song recommendations will be added in the next development phase.</p>
              <button type="button" className="search-button" onClick={handleReset}>
                START OVER
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="info-section">
        <div className="section-heading">
          <h2>How It Works</h2>
          <p>
            Musically Moody combines your mood and artist preferences to create
            a more personalized music experience.
          </p>
        </div>
        <div className="cards">
          <div className="card">
            <h3>1. Choose a Mood</h3>
            <p>Start by entering how you feel, or click one of the mood buttons.</p>
          </div>
          <div className="card">
            <h3>2. Add Artists You Like</h3>
            <p>Tell us three different artists you enjoy.</p>
          </div>
          <div className="card">
            <h3>3. Get Music Recommendations</h3>
            <p>We'll use public music metadata to recommend tracks in the next phase.</p>
          </div>
        </div>
      </section>

      <section className="preview-section">
        <div className="section-heading">
          <h2>Your Inputs</h2>
          <p>Your mood and favorite artists as you enter them.</p>
        </div>
        <div className="preview-box" aria-live="polite">
          {collectedData.length > 0 ? (
            <div className="tag-list">
              {collectedData.map((item, index) => (
                <span key={`${index}-${item}`} className="tag">
                  {index === 0 ? 'Mood: ' : `Artist ${index}: `}{item}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty-text">No inputs yet. Start by typing your mood above.</p>
          )}
        </div>
      </section>

      <section className="about-section">
        <div className="section-heading">
          <h2>About the Project</h2>
          <p>
            Musically Moody is a React website for mood-based music discovery.
            In the next phase, it will use a public music metadata API to find recommendations.
            No audio or copyrighted lyrics are hosted here.
          </p>
        </div>
      </section>
    </div>
  )
}

export default App
