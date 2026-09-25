# Provenance — vendored engine

`engine/` is a verbatim copy of the **built core** of
`SuperInstance/quilt` at the `quilt-playtest` working clone
(branch `main`, base commit `c694291`) **including the eleven
SuperInstance play-test patches** (watch wiring, propagate cycle
guard, eager mode, contains sugar path, ai-cell schema passthrough,
and friends — 36/36 core tests green on the source tree).

Nothing in `engine/` is modified by quilt-learn. The patch set lives
upstream in the play-test archive:

    https://github.com/SuperInstance/quilt-playtest

Vendored on 2026-09-26 by the quilt-learn voyage (fleet doctrine:
every vendored artifact ships its receipt).
