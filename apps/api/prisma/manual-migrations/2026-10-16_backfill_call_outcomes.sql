-- OPTIONAL, run after 2026-10-16_call_reasons.sql: fill LeadActivity.call_outcome for
-- calls logged BEFORE the column existed, from the "[<outcome label>]" their note starts
-- with. Exact label matches only; call_reason is left empty (older reasons were free text
-- and guessing them would be wrong). Only touches rows where call_outcome is still NULL,
-- so it is safe to run twice. The app already reads the label from the note, so skipping
-- this changes nothing on screen (the '_' in two patterns stands for the em dash, one character); it just makes the report counts exact for old calls.

-- Check (read-only): how many old calls would be filled.
SELECT COUNT(*) AS to_fill FROM `LeadActivity`
WHERE activity_type = 'CALL_LOGGED' AND call_outcome IS NULL AND notes LIKE '[%]%';

UPDATE `LeadActivity` SET call_outcome = CASE
  WHEN notes LIKE '[Connected _ interested]%'     THEN 'CONNECTED_INTERESTED'
  WHEN notes LIKE '[Connected _ not interested]%' THEN 'CONNECTED_NOT_INTERESTED'
  WHEN notes LIKE '[Asked to call back]%'   THEN 'CALL_BACK'
  WHEN notes LIKE '[No answer]%'            THEN 'NO_ANSWER'
  WHEN notes LIKE '[Busy / switched off]%'  THEN 'BUSY_OR_SWITCHED_OFF'
  WHEN notes LIKE '[Wrong number]%'         THEN 'WRONG_NUMBER'
  ELSE NULL END
WHERE activity_type = 'CALL_LOGGED' AND call_outcome IS NULL AND notes LIKE '[%]%';

-- Verify (read-only): calls still without an outcome (old free-text notes), and the split.
SELECT call_outcome, COUNT(*) AS n FROM `LeadActivity`
WHERE activity_type = 'CALL_LOGGED' GROUP BY call_outcome;
