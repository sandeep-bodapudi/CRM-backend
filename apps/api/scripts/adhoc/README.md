# Ad-hoc scripts (moved here 2026-10-17, SEC-7)

One-off debugging and fix-up scripts that used to sit loose in `apps/api/`.
They are kept for reference only: none is part of the build (`tsconfig.json`
compiles `src/` only) or of any npm script, and several talk to a database
directly. Read a script fully and check which database `.env` points at before
running anything here. Untracked scratch files live in the ignored `apps/api/.ops/`.
