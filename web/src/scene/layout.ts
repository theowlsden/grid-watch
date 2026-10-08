// Layout breakpoints shared by the scene and components. Keep in step with the media
// queries in app/globals.css (spec 4.1, 4.2 and 12.12).
// Wide desktop layout: wider than 1500 px and at least 1182 px tall.
export const WIDE_MQ = "(min-width: 1501px) and (min-height: 1182px)";
// Everything else in landscape: risk card left, island right; the site card replaces the risk card.
export const SIDE_CARD_MQ =
  "(max-width: 1500px) and (orientation: landscape) and (min-aspect-ratio: 5/4), (max-height: 1181px) and (orientation: landscape) and (min-aspect-ratio: 5/4)";
