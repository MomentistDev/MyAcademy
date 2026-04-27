-- Seed data for local development
-- Creates two organizations, demo users, memberships, and starter branches.

do $$
declare
  org_acme_id uuid := gen_random_uuid();
  org_beta_id uuid := gen_random_uuid();
  acme_admin_user uuid := gen_random_uuid();
  acme_trainer_user uuid := gen_random_uuid();
  acme_learner_user uuid := gen_random_uuid();
  beta_admin_user uuid := gen_random_uuid();
  acme_learner_membership_id uuid;
  acme_trainer_membership_id uuid;
  demo_course_id uuid := gen_random_uuid();
  demo_template_id uuid := gen_random_uuid();
  demo_stage_id uuid := gen_random_uuid();
  demo_item_video_id uuid := gen_random_uuid();
  demo_item_read_id uuid := gen_random_uuid();
  demo_item_doc_id uuid := gen_random_uuid();
  demo_instance_id uuid := gen_random_uuid();
  demo_quiz_id uuid := gen_random_uuid();
  demo_q1_id uuid := gen_random_uuid();
  demo_q2_id uuid := gen_random_uuid();
begin
  -- Organizations
  insert into public.organizations (id, name, slug, plan_tier, status)
  values
    (org_acme_id, 'Acme Holdings', 'acme-holdings', 'growth', 'active'),
    (org_beta_id, 'Beta Retail Group', 'beta-retail-group', 'free', 'trial')
  on conflict (slug) do nothing;

  -- Branches
  insert into public.branches (organization_id, name, code)
  values
    (org_acme_id, 'HQ', 'HQ'),
    (org_acme_id, 'South Branch', 'SB'),
    (org_beta_id, 'Main Branch', 'MB')
  on conflict (organization_id, code) do nothing;

  -- Auth users (for local demo only)
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (
      acme_admin_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@acme.test', crypt('Pass1234!', gen_salt('bf')), now(),
      '', '', '', '',
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'organization_id', org_acme_id::text,
        'role', 'org_admin'
      ),
      jsonb_build_object('full_name', 'Acme Admin'),
      now(), now()
    ),
    (
      acme_trainer_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'trainer@acme.test', crypt('Pass1234!', gen_salt('bf')), now(),
      '', '', '', '',
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'organization_id', org_acme_id::text,
        'role', 'trainer'
      ),
      jsonb_build_object('full_name', 'Acme Trainer'),
      now(), now()
    ),
    (
      acme_learner_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'learner@acme.test', crypt('Pass1234!', gen_salt('bf')), now(),
      '', '', '', '',
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'organization_id', org_acme_id::text,
        'role', 'learner'
      ),
      jsonb_build_object('full_name', 'Acme Learner'),
      now(), now()
    ),
    (
      beta_admin_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@beta.test', crypt('Pass1234!', gen_salt('bf')), now(),
      '', '', '', '',
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'organization_id', org_beta_id::text,
        'role', 'org_admin'
      ),
      jsonb_build_object('full_name', 'Beta Admin'),
      now(), now()
    )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  )
  values
    (gen_random_uuid(), acme_admin_user, jsonb_build_object('sub', acme_admin_user::text, 'email', 'admin@acme.test'), 'email', acme_admin_user::text, now(), now()),
    (gen_random_uuid(), acme_trainer_user, jsonb_build_object('sub', acme_trainer_user::text, 'email', 'trainer@acme.test'), 'email', acme_trainer_user::text, now(), now()),
    (gen_random_uuid(), acme_learner_user, jsonb_build_object('sub', acme_learner_user::text, 'email', 'learner@acme.test'), 'email', acme_learner_user::text, now(), now()),
    (gen_random_uuid(), beta_admin_user, jsonb_build_object('sub', beta_admin_user::text, 'email', 'admin@beta.test'), 'email', beta_admin_user::text, now(), now())
  on conflict (provider_id, provider) do nothing;

  -- Memberships
  insert into public.memberships (organization_id, user_id, role, employment_status, job_title, joined_at)
  values
    (org_acme_id, acme_admin_user, 'org_admin', 'active', 'HR Manager', now()),
    (org_acme_id, acme_trainer_user, 'trainer', 'active', 'Internal Trainer', now()),
    (org_acme_id, acme_learner_user, 'learner', 'active', 'Sales Executive', now()),
    (org_beta_id, beta_admin_user, 'org_admin', 'active', 'Operations Lead', now())
  on conflict (organization_id, user_id) do nothing;

  select id into acme_learner_membership_id
  from public.memberships
  where organization_id = org_acme_id and user_id = acme_learner_user
  limit 1;

  select id into acme_trainer_membership_id
  from public.memberships
  where organization_id = org_acme_id and user_id = acme_trainer_user
  limit 1;

  -- Demo published course + enrollment + onboarding instance for the Acme learner
  if acme_learner_membership_id is not null and acme_trainer_membership_id is not null then
    insert into public.courses (
      id, organization_id, created_by_membership_id, title, description, category, status, estimated_minutes
    )
    values (
      demo_course_id, org_acme_id, acme_trainer_membership_id,
      'Company orientation', 'Seed demo course for local UI.', 'onboarding', 'published', 25
    );

    insert into public.quizzes (
      id, organization_id, course_id, title, description, pass_mark_percent, status, created_by_membership_id
    )
    values (
      demo_quiz_id, org_acme_id, demo_course_id,
      'Orientation knowledge check', 'Two quick multiple-choice questions.', 50, 'published',
      acme_trainer_membership_id
    );

    insert into public.quiz_questions (
      id, organization_id, quiz_id, question_type, prompt, options_json, correct_answer_json, order_index
    )
    values
      (
        demo_q1_id, org_acme_id, demo_quiz_id, 'mcq',
        'What should you do on your first day?',
        '["Skip orientation", "Attend orientation", "Ignore emails"]'::jsonb,
        '{"correctIndex": 1}'::jsonb,
        1
      ),
      (
        demo_q2_id, org_acme_id, demo_quiz_id, 'mcq',
        'Who can assign onboarding?',
        '["Only HR", "Trainers and org admins", "Any learner"]'::jsonb,
        '{"correctIndex": 1}'::jsonb,
        2
      );

    insert into public.enrollments (
      organization_id, membership_id, assignment_type, course_id, assigned_by_membership_id, source, status
    )
    values (
      org_acme_id, acme_learner_membership_id, 'course', demo_course_id,
      acme_trainer_membership_id, 'manual', 'in_progress'
    );

    insert into public.onboarding_templates (
      id, organization_id, name, target_roles, status, created_by_membership_id
    )
    values (
      demo_template_id, org_acme_id, 'New hire onboarding', array['learner']::text[], 'published',
      acme_trainer_membership_id
    );

    insert into public.onboarding_stages (
      id, organization_id, onboarding_template_id, name, order_index, start_offset_days, end_offset_days
    )
    values (
      demo_stage_id, org_acme_id, demo_template_id, 'Week 1', 1, 0, 14
    );

    insert into public.onboarding_checklist_items (
      id, organization_id, onboarding_stage_id, item_type, title, required, course_id
    )
    values (
      demo_item_video_id, org_acme_id, demo_stage_id, 'watch_video', 'Watch orientation video', true, demo_course_id
    );

    insert into public.onboarding_checklist_items (
      id, organization_id, onboarding_stage_id, item_type, title, required
    )
    values (
      demo_item_read_id, org_acme_id, demo_stage_id, 'read_attachment', 'Read employee handbook', true
    );

    insert into public.onboarding_checklist_items (
      id, organization_id, onboarding_stage_id, item_type, title, required
    )
    values (
      demo_item_doc_id, org_acme_id, demo_stage_id, 'submit_document', 'Submit signed policy PDF', true
    );

    insert into public.onboarding_instances (
      id, organization_id, membership_id, onboarding_template_id, status, started_at, target_end_at, trigger_source
    )
    values (
      demo_instance_id, org_acme_id, acme_learner_membership_id, demo_template_id, 'in_progress',
      now(), now() + interval '14 days', 'manual'
    );

    insert into public.checklist_progress (
      organization_id, onboarding_instance_id, checklist_item_id, status, review_status
    )
    values
      (org_acme_id, demo_instance_id, demo_item_video_id, 'completed', 'not_required'),
      (org_acme_id, demo_instance_id, demo_item_read_id, 'not_started', 'not_required'),
      (org_acme_id, demo_instance_id, demo_item_doc_id, 'not_started', 'not_required');
  end if;
end $$;
