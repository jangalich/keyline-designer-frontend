/**
 * DetailPanel.jsx  —  REGION F, the top right.
 *
 * RESERVED, AND DELIBERATELY EMPTY.
 *
 * This branch builds the container and the one thing a container has to get
 * right -- how it opens and how it closes -- and stops there. What goes inside
 * it is the next branch's: the selected feature's own readout, the caution
 * lines against it, the per-zone rejections, and the selection sync between a
 * tab and a map feature that decides WHICH feature it is showing. None of that
 * can be written before the selection it reads exists, and a panel filled with
 * a guess at it now would be a second thing to migrate rather than a seam to
 * fill.
 *
 * WHY THE CONTAINER SHIPS EMPTY RATHER THAN NOT AT ALL. The five regions are
 * one layout, and a region added later moves the other four -- the rail's
 * height, the strip's width, and where Leaflet's own controls can sit are all
 * measured against this one being here. Shipping the box now means the next
 * branch fills it instead of re-laying the shell out around it.
 *
 * IT IS CLOSED UNTIL ASKED FOR. There is nothing to show yet, and an empty
 * panel occupying the top right by default would be the shell advertising a
 * feature it does not have.
 */

import { useState } from 'react'

export default function DetailPanel({ machine }) {
  const [open, setOpen] = useState(false)
  const { stepId } = machine

  return (
    <aside className="chrome-detail" data-testid={`detail-${stepId}`} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="chrome-detail__toggle"
        aria-expanded={open}
        aria-controls={`detail-body-${stepId}`}
        data-testid={`detail-toggle-${stepId}`}
        onClick={() => setOpen((was) => !was)}
      >
        Details
      </button>

      <div
        id={`detail-body-${stepId}`}
        className="chrome-detail__body"
        data-testid={`detail-body-${stepId}`}
        hidden={!open}
      >
        <p className="chrome-detail__reserved">
          Nothing is selected. Selecting a zone will show its measurements here.
        </p>
      </div>
    </aside>
  )
}
