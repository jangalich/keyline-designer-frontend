/**
 * ScaleOfPermanence.jsx
 *
 * THE EIGHT FACTORS AS A LADDER, in "The Scale of Permanence" section: most
 * permanent at the top, most improvable at the bottom. Each rung is a number,
 * the factor's name and a one-line spine; a press on it opens the full
 * paragraph beneath.
 *
 * THE LADDER IS THE INDEX AND THE PARAGRAPHS ARE THE BODY. Eight paragraphs
 * of three or four sentences is a page of prose, and this section sits above
 * the tool -- someone should be able to scan the eight names in a few seconds
 * and read only what they care about.
 *
 * WHY A LADDER AND NOT THE USUAL DIAGONAL. The familiar chart puts permanence
 * on one axis and change-effort on the other, with eight coloured hexagons.
 * Eight colours read as clip art against a palette of tokens, and a diagonal
 * needs width it does not have at 390px. A tint column that darkens toward the
 * top carries the same gradient in one column, and stacks on a phone as it is.
 *
 * THE TINT IS THE HEADER ROW'S HEIGHT, NOT THE RUNG'S. It sits inside the
 * button, so an open rung's paragraph grows below it rather than stretching
 * it, and the column still reads as eight even steps with any number open.
 *
 * BEHAVIOUR. Rungs open independently, any number at a time. Climate starts
 * open: with every rung closed, someone may read eight one-liners and never
 * find out there is more. No rung links anywhere -- not to the report preview,
 * not to a report section.
 *
 * A CLOSED BODY STAYS IN THE DOCUMENT. It carries `hidden="until-found"`
 * rather than `display: none` from a stylesheet: the text is in the DOM for
 * anything that reads it, the browser's find-in-page can reach it, and a match
 * there opens the rung (`beforematch`). An engine without until-found reads
 * the attribute as plain `hidden`. React 18 renders `hidden` as a boolean, so
 * the prop gives the first paint a plain `hidden` and a layout effect raises it
 * to until-found before the browser paints.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/** The axis labels, above the top rung and below the bottom one. */
export const AXIS_TOP = 'harder to change'
export const AXIS_BOTTOM = 'easier to change'

/**
 * THE EIGHT RUNGS, MOST PERMANENT FIRST. `tint` is the --terrain column's
 * opacity on that rung, stepping down the ladder.
 */
export const RUNGS = Object.freeze([
  Object.freeze({
    id: 'climate',
    name: 'Climate',
    spine: 'Rainfall, temperature, wind and humidity are fixed.',
    body:
      'Rainfall, temperature, wind, and humidity are fixed; nothing done on the farm will ' +
      'change them. Decades of weather records show what to expect, from how much water the ' +
      'land must handle to when frost comes and where the wind blows from. Every decision ' +
      'below answers to it.',
    tint: 0.92,
  }),
  Object.freeze({
    id: 'landform',
    name: 'Landform',
    spine: 'The shape of the land decides where production is possible.',
    body:
      'The shape of the land decides where production is possible and which slopes face the ' +
      'sun for planting and solar. It shows how rain moves across the property, from ridges ' +
      'down into valleys.',
    tint: 0.79,
  }),
  Object.freeze({
    id: 'water',
    name: 'Water',
    spine: 'This is where the design really begins.',
    body:
      'The aim is to catch rain where it falls and spread it evenly across the land, rather ' +
      "than letting it rush off down the valleys. Water works are the most permanent things " +
      "you'll build, so everything after them is placed around them.",
    tint: 0.66,
  }),
  Object.freeze({
    id: 'access',
    name: 'Access',
    spine: 'Roads and lanes connect the places you travel between most.',
    body:
      "Roads and lanes connect the places you'll travel between most often. They belong on " +
      "ground that resists erosion and won't turn into a drain in a storm, such as along " +
      'ridgelines or just below a diversion channel.',
    tint: 0.54,
  }),
  Object.freeze({
    id: 'trees',
    name: 'Trees',
    spine: 'Trees can stand for a century, outliving most of what we build.',
    body:
      'Trees sit above buildings on the scale because they can stand for a century or more, ' +
      'outliving most of what we build. Orchards, windbreaks, riparian buffers, timber, and ' +
      'agroforestry all belong here. Many of them suit the marginal ground nothing else ' +
      'wants, where they slow erosion, build soil, and shade streams.',
    tint: 0.43,
  }),
  Object.freeze({
    id: 'buildings',
    name: 'Buildings',
    spine: 'A building is placed to make the most of the sun.',
    body:
      'A building is placed to make the most of the sun while weighing what could go wrong: ' +
      'exposure to the prevailing wind, a slope that erodes, ground that floods, and low ' +
      'spots where cold air settles. With water, access, and trees already settled, the good ' +
      'sites narrow down quickly.',
    tint: 0.33,
  }),
  Object.freeze({
    id: 'fencing',
    name: 'Fencing',
    spine: 'Fences keep livestock in and predators out.',
    body:
      'Fences keep livestock in and predators out, and they protect what the steps above ' +
      'have built: ponds, streams, tree crops, paddocks. Where it makes sense, they follow ' +
      "the lines the water work set out. They're also easy to change, with options from " +
      'permanent wire to mobile electric to virtual fencing.',
    tint: 0.23,
  }),
  Object.freeze({
    id: 'soil',
    name: 'Soil',
    spine: 'Soil comes last because it is the most improvable factor.',
    body:
      "Soil comes last because it's the most improvable factor of all. By managing the life, " +
      'air, and water in it, subsoil can be built into topsoil, and every decision above sets ' +
      'the conditions for that work. Poor soil today is a starting point, not a limit on the ' +
      'design.',
    tint: 0.13,
  }),
])

/** The rungs open when the section first renders. */
export const INITIALLY_OPEN = Object.freeze(['climate'])

export default function ScaleOfPermanence() {
  const [open, setOpen] = useState(() => new Set(INITIALLY_OPEN))
  const toggle = useCallback((id) => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const reveal = useCallback((id) => {
    setOpen((current) => (current.has(id) ? current : new Set(current).add(id)))
  }, [])

  return (
    <div className="permanence" data-testid="permanence">
      <p className="permanence__axis" aria-hidden="true">
        {AXIS_TOP}
      </p>
      <ol className="permanence__ladder" aria-label={`From ${AXIS_TOP} to ${AXIS_BOTTOM}`}>
        {RUNGS.map((rung, index) => (
          <Rung
            key={rung.id}
            rung={rung}
            number={index + 1}
            open={open.has(rung.id)}
            onToggle={toggle}
            onReveal={reveal}
          />
        ))}
      </ol>
      <p className="permanence__axis" aria-hidden="true">
        {AXIS_BOTTOM}
      </p>
    </div>
  )
}

function Rung({ rung, number, open, onToggle, onReveal }) {
  const bodyId = `${useId()}-body`
  const bodyRef = useRef(null)

  // See the docblock: the `hidden` prop is a boolean in React 18, so a closed
  // body's attribute is raised to until-found here, before paint. Opening is
  // the prop's own work -- React removes the attribute.
  useLayoutEffect(() => {
    if (!open) bodyRef.current?.setAttribute('hidden', 'until-found')
  }, [open])

  // Find-in-page matched text inside a closed body: the browser is about to
  // reveal it, so the rung's state follows.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return undefined
    const onMatch = () => onReveal(rung.id)
    body.addEventListener('beforematch', onMatch)
    return () => body.removeEventListener('beforematch', onMatch)
  }, [onReveal, rung.id])

  return (
    <li className="permanence__rung" data-testid={`rung-${rung.id}`}>
      <h3 className="permanence__heading">
        <button
          type="button"
          className="permanence__head"
          aria-expanded={open}
          aria-controls={bodyId}
          data-testid={`rung-toggle-${rung.id}`}
          onClick={() => onToggle(rung.id)}
        >
          <span
            className="permanence__tint"
            aria-hidden="true"
            data-testid={`rung-tint-${rung.id}`}
            style={{ opacity: rung.tint }}
          />
          <span className="permanence__number">{number}</span>
          <span className="permanence__label">
            <span className="permanence__name">{rung.name}</span>
            <span className="permanence__spine">{rung.spine}</span>
          </span>
        </button>
      </h3>
      <div
        className="permanence__body"
        id={bodyId}
        ref={bodyRef}
        hidden={!open}
        data-testid={`rung-body-${rung.id}`}
      >
        <p>{rung.body}</p>
      </div>
    </li>
  )
}
