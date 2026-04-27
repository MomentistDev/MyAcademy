-- Optional trainer feedback shown to the learner after a rejected document (or other reviewed item).
alter table public.checklist_progress
  add column if not exists review_note text;

comment on column public.checklist_progress.review_note is 'Last trainer note from review (e.g. reject reason); cleared on approve or new learner submit.';
