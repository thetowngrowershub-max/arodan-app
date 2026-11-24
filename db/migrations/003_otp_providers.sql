-- Lets sign-in codes come from an external verification service (e.g. Message Central),
-- which generates the code itself and gives us a reference to check it against.
alter table auth.otp_codes add column if not exists provider text not null default 'local';
alter table auth.otp_codes add column if not exists provider_ref text;
alter table auth.otp_codes alter column code_hash drop not null;
