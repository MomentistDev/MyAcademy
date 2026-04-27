-- GoTrue maps several auth.users varchar columns to non-nullable Go strings.
-- Rows inserted without these columns (e.g. older seed data) leave NULL and
-- break password grant: "converting NULL to string is unsupported".
update auth.users set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, '')
where
  confirmation_token is null
  or recovery_token is null
  or email_change_token_new is null
  or email_change is null;
