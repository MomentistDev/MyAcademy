-- Learners who already had a document approved before in_app_notifications existed get one inbox row each (idempotent).
insert into public.in_app_notifications (organization_id, user_id, kind, title, body, metadata_json)
select
  cp.organization_id,
  m.user_id,
  'onboarding.document_approved',
  'Document approved',
  'Your submission for "' || coalesce(oci.title, 'Document') || '" was approved (recorded earlier; added when notifications shipped).',
  jsonb_build_object(
    'checklist_progress_id', cp.id::text,
    'membership_id', oi.membership_id::text,
    'backfilled', true
  )
from public.checklist_progress cp
join public.onboarding_instances oi
  on oi.id = cp.onboarding_instance_id
  and oi.organization_id = cp.organization_id
join public.onboarding_checklist_items oci
  on oci.id = cp.checklist_item_id
  and oci.organization_id = cp.organization_id
join public.memberships m
  on m.id = oi.membership_id
  and m.organization_id = cp.organization_id
where oci.item_type = 'submit_document'
  and cp.review_status = 'approved'
  and cp.status in ('completed', 'waived')
  and not exists (
    select 1
    from public.in_app_notifications n
    where n.organization_id = cp.organization_id
      and n.user_id = m.user_id
      and n.kind = 'onboarding.document_approved'
      and coalesce(n.metadata_json ->> 'checklist_progress_id', '') = cp.id::text
  );
