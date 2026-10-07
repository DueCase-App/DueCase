CREATE OR REPLACE FUNCTION duecase_file_signature_valid(file_data bytea, mime_type text)
RETURNS boolean
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN file_data IS NULL THEN TRUE
    WHEN mime_type = 'application/pdf' THEN
      octet_length(file_data) >= 5
      AND substring(file_data FROM 1 FOR 5) = decode('255044462d', 'hex')
    WHEN mime_type = 'image/jpeg' THEN
      octet_length(file_data) >= 3
      AND substring(file_data FROM 1 FOR 3) = decode('ffd8ff', 'hex')
    WHEN mime_type = 'image/png' THEN
      octet_length(file_data) >= 8
      AND substring(file_data FROM 1 FOR 8) = decode('89504e470d0a1a0a', 'hex')
    WHEN mime_type = 'image/webp' THEN
      octet_length(file_data) >= 12
      AND substring(file_data FROM 1 FOR 4) = convert_to('RIFF', 'UTF8')
      AND substring(file_data FROM 9 FOR 4) = convert_to('WEBP', 'UTF8')
    WHEN mime_type IN ('image/heic', 'image/heif') THEN
      octet_length(file_data) >= 12
      AND substring(file_data FROM 5 FOR 4) = convert_to('ftyp', 'UTF8')
      AND substring(file_data FROM 9 FOR 4) IN (
        convert_to('heic', 'UTF8'),
        convert_to('heix', 'UTF8'),
        convert_to('hevc', 'UTF8'),
        convert_to('hevx', 'UTF8'),
        convert_to('heif', 'UTF8'),
        convert_to('mif1', 'UTF8'),
        convert_to('msf1', 'UTF8')
      )
    ELSE FALSE
  END;
$$;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_signature_ck;
ALTER TABLE documents ADD CONSTRAINT documents_file_signature_ck
  CHECK (duecase_file_signature_valid(file_data, mime_type));

ALTER TABLE duecase_message_attachments DROP CONSTRAINT IF EXISTS message_attachments_file_signature_ck;
ALTER TABLE duecase_message_attachments ADD CONSTRAINT message_attachments_file_signature_ck
  CHECK (duecase_file_signature_valid(file_data, mime_type));

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_receipt_signature_ck;
ALTER TABLE expenses ADD CONSTRAINT expenses_receipt_signature_ck
  CHECK (duecase_file_signature_valid(receipt_data, receipt_mime_type));

ALTER TABLE expense_payments DROP CONSTRAINT IF EXISTS expense_payments_receipt_signature_ck;
ALTER TABLE expense_payments ADD CONSTRAINT expense_payments_receipt_signature_ck
  CHECK (duecase_file_signature_valid(receipt_data, receipt_mime_type));
