-- Removes the one unverified draft from the server seed. Existing rooms and rounds keep
-- their question snapshots, and this does not touch receipts or the coin wallet.
begin;
delete from school_private.educational_questions
where game=0 and id='u03_l06_q036'
  and data->'source'->>'document_id'='islamic_education_g11_s2_2025';
commit;
