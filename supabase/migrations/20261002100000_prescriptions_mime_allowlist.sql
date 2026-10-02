-- Only the three formats CPMS uploads may enter the prescriptions bucket.
--
-- allowed_mime_types was NULL, so a scanner could store an HTML or SVG file
-- (any Content-Type, straight through the Storage API) and attach it to a
-- record under a harmless name like "Lab report.pdf". The preview rendered it
-- from a blob: URL — same origin as CPMS — in the session of whoever opened
-- it. The client now refuses to preview anything whose bytes are not PDF,
-- JPEG or PNG (src/lib/cpms/document-type.ts); this stops such files being
-- stored at all.
--
-- image/jpg is not a registered type, but some Android browsers report it and
-- the upload screens accept it, so refusing it would break those devices.
--
-- On 2026-10-02 the bucket held only image/jpeg and application/pdf objects,
-- so nothing already stored falls outside this list. Existing objects are not
-- re-checked by Storage either way. Safe to run twice.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
where id = 'prescriptions';
