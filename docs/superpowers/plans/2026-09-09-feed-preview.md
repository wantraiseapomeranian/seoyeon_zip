# Feed comparison implementation plan

Single agent; DESIGN.md is authoritative. Build an Experience surface for reading the newest saved posts and opening originals. A (3 columns, 1200px, 24px gutters) and B (4 columns, 1440px, 16px gutters) share content, chronological DOM order, colors and typography. Both use two columns on mobile. The user selected A on 2026-09-09 for its spacious layout and image emphasis; implementation continues from A.

1. Create validation/feed.html, feed.css, feed.js with density comparison, media/category/source filters, URL state, refresh, chronological cards, media counts, loading/error/empty states and read-only collection status. Use /api/samples and /api/sources; expose the 48-post API window honestly. No new collection controls or backend changes.
2. Extend scripts/preview.mjs with explicit feed routes and local source snapshot; preserve validation root. Use current normalized owner-visible metadata locally, never commit sample data or download media.
3. Verify both variants at 360/390/768/1440px using Playwright, keyboard/filter/empty/error/link behavior and saved-data ordering. Inspect mobile and desktop screenshots together; one correction pass if needed.
4. Record actual results and reference limitations in docs/design-review.md. Serve locally for user selection; no mandatory deployment or final design choice before comparison.
