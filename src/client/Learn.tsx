import { useMemo, useState } from 'react'
import type { Chart, ProgressState } from '../shared/types'
import { buildLessons } from './lessons'

export function Learn({
  chart,
  chartId,
  progress,
  onProgress,
}: {
  chart: Chart
  chartId: string
  progress: ProgressState
  onProgress: (progress: ProgressState) => void
}) {
  const lessons = useMemo(() => buildLessons(chart), [chart])
  // Progress belongs to the chart that earned it: every question quotes it.
  const keyFor = (lessonId: string) => `${chartId}/${lessonId}`
  const [activeId, setActiveId] = useState(lessons[0]!.id)
  const active = lessons.find((lesson) => lesson.id === activeId) ?? lessons[0]!
  const saved = progress.lessons[keyFor(active.id)]
  const [index, setIndex] = useState(saved?.step ?? 0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  function openLesson(id: string) {
    setActiveId(id)
    setIndex(progress.lessons[keyFor(id)]?.step ?? 0)
    setAnswers({})
  }

  function record(step: number, done: boolean) {
    onProgress({
      lessons: { ...progress.lessons, [keyFor(active.id)]: { step, done } },
    })
  }

  function advance() {
    if (index + 1 >= active.steps.length) {
      record(active.steps.length - 1, true)
      return
    }
    setIndex(index + 1)
    record(index + 1, false)
  }

  function restart() {
    setIndex(0)
    setAnswers({})
    record(0, false)
  }

  const step = active.steps[index]
  const answerKey = `${active.id}:${index}`
  const picked = answers[answerKey]
  const finished = Boolean(saved?.done)
  // Only ever forwards, and never into a locked lesson.
  const activeIndex = lessons.findIndex((lesson) => lesson.id === active.id)
  const nextLesson = lessons.slice(activeIndex + 1).find((lesson) => !lesson.locked)

  return (
    <div className="learn">
      <div className="lesson-tabs" role="tablist" aria-label="Lessons">
        {lessons.map((lesson, order) => {
          const state = progress.lessons[keyFor(lesson.id)]
          return (
            <button
              key={lesson.id}
              role="tab"
              aria-selected={lesson.id === active.id}
              className={`lesson-tab${lesson.id === active.id ? ' is-active' : ''}`}
              onClick={() => openLesson(lesson.id)}
            >
              <span className="lesson-index">{order + 1}</span>
              <span>
                <strong>{lesson.title}</strong>
                <small>
                  {lesson.locked ? 'Needs a birth time' : state?.done ? 'Complete' : 'Not started'}
                </small>
              </span>
            </button>
          )
        })}
      </div>

      <article className="lesson-body">
        <header className="lesson-head">
          <h3>{active.title}</h3>
          <p>{active.subtitle}</p>
          {!active.locked && (
            <div className="lesson-progress">
              <span>
                Step {Math.min(index + 1, active.steps.length)} of {active.steps.length}
              </span>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${((index + 1) / active.steps.length) * 100}%` }} />
              </div>
            </div>
          )}
        </header>

        {active.locked ? (
          <div className="lesson-locked">
            {active.locked.split('\n\n').map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
        ) : finished ? (
          <div className="lesson-done">
            <p>
              You finished this lesson. The next one is worth doing now, while the rule is fresh.
            </p>
            <div className="lesson-actions">
              <button className="quiet" onClick={restart}>
                Go over it again
              </button>
              {nextLesson && (
                <button onClick={() => openLesson(nextLesson.id)}>Next lesson</button>
              )}
            </div>
          </div>
        ) : step?.kind === 'teach' ? (
          <div className="step">
            <h4>{step.title}</h4>
            {step.body.split('\n\n').map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
            <div className="lesson-actions">
              <button onClick={advance}>
                {index + 1 === active.steps.length ? 'Finish lesson' : 'Continue'}
              </button>
            </div>
          </div>
        ) : step?.kind === 'ask' ? (
          <div className="step">
            <h4>{step.prompt}</h4>
            <div className={`options${step.options.length > 6 ? ' wide' : ''}`}>
              {step.options.map((option) => {
                const isPicked = picked === option
                const isAnswer = option === step.answer
                const revealed = Boolean(picked)
                const state = revealed
                  ? isAnswer
                    ? ' is-right'
                    : isPicked
                      ? ' is-wrong'
                      : ''
                  : ''
                return (
                  <button
                    key={option}
                    className={`option${state}`}
                    disabled={revealed}
                    onClick={() => setAnswers({ ...answers, [answerKey]: option })}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
            {picked && (
              <div className="reveal">
                <p className="verdict">
                  {picked === step.answer ? 'Right.' : `Not quite — the answer is ${step.answer}.`}
                </p>
                <p>{step.explain}</p>
                <div className="lesson-actions">
                  <button onClick={advance}>
                    {index + 1 === active.steps.length ? 'Finish lesson' : 'Continue'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </article>
    </div>
  )
}
