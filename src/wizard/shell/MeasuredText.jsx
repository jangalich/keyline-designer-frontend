/**
 * MeasuredText.jsx  —  prose with measured values in it, in the data face.
 *
 * A LINE OF TEXT IS A STRING, OR A LIST OF PARTS, and the difference between a
 * part that was WRITTEN and a part that was MEASURED is set rather than
 * described: `{ measure }` renders in the data face with tabular figures, a
 * bare string is prose. That is the whole of what the list form buys, and it
 * buys the thing this project loads three faces for -- a reader can tell at a
 * glance which half of "Selecting 83.3% of the parcel leaves little room" was
 * measured and which was written.
 *
 * WHY IT IS ITS OWN FILE. It was NoticeText, private to InstructionBar, and it
 * was right there. Then the reopen confirmation needed the same distinction
 * for the same reason -- "3 placed access points and the networks routed from
 * them" is a written sentence with a counted figure in it -- and the choice
 * was one renderer in two regions or two renderers that have to be kept
 * saying the same thing. The second is how a shell ends up with one face in
 * one card and another face in the next.
 *
 * THE FACE IS `.measure`'s, WHICH IS THE PANEL COLUMN'S. It is declared once
 * in App.css and every figure this shell prints goes through it.
 */

export default function MeasuredText({ text }) {
  if (!Array.isArray(text)) return text
  return (
    <>
      {text.map((part, index) =>
        typeof part === 'string' ? (
          <span key={index}>{part}</span>
        ) : (
          <span key={index} className="measure">
            {part.measure}
          </span>
        )
      )}
    </>
  )
}
