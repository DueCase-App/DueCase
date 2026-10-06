-- DueCase: commento tracciabile sulla decisione di cambio turno.
-- Idempotente e compatibile con i record esistenti.

ALTER TABLE swap_requests
  ADD COLUMN IF NOT EXISTS response_note TEXT;

-- Mantiene il commento entro una dimensione ragionevole anche a livello DB.
ALTER TABLE swap_requests
  DROP CONSTRAINT IF EXISTS swap_requests_response_note_length_check;
ALTER TABLE swap_requests
  ADD CONSTRAINT swap_requests_response_note_length_check
  CHECK (response_note IS NULL OR char_length(response_note) <= 2000) NOT VALID;
