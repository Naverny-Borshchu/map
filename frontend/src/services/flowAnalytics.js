import { track } from '../analytics';

/**
 * Step-by-step events for the three journeys: the bowl, rating and adding.
 *
 * In 90 days 26 people opened the rating and 11 sent one, 27 opened adding and
 * 4 finished, and nothing said WHERE the rest stopped: the flows reported their
 * start and their end and nothing between. Now every screen says it was shown
 * (`flow_step`) and a person who leaves before the end says on which screen
 * (`flow_exit`). Step names are stable and unique within a flow, so a PostHog
 * funnel can be built on them directly.
 *
 *   flow_step { flow, step, index, total, ...context }
 *   flow_exit { flow, step, index, via, ...context }
 *
 * flow  'bowl' | 'rate' | 'add'
 * via   'close' (the cross), 'away' (navigated elsewhere), 'pagehide'
 */

export const trackFlowStep = ({ flow, step, index, total, ...context }) => {
  track('flow_step', { flow, step, index, total, ...context });
};

export const trackFlowExit = ({ flow, step, index, via = 'close', ...context }) => {
  track('flow_exit', { flow, step, index, via, ...context });
};

// A screen that hands over to the next screen of the SAME flow on another
// route (the map pick → the address check → the quest) unmounts on the way.
// It marks the hand-over first, so the unmount is not counted as leaving. The
// mark is short-lived: one left behind must not swallow a real exit later.
const HANDOVER_MS = 3000;
const handingOver = new Map();

export const markFlowHandover = (flow) => {
  handingOver.set(flow, Date.now());
};

export const consumeFlowHandover = (flow) => {
  const at = handingOver.get(flow);
  handingOver.delete(flow);
  return at !== undefined && Date.now() - at < HANDOVER_MS;
};
