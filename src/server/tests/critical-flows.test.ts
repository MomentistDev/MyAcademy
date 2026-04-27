import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { app } from "../app";

interface AuthTokens {
  access_token: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  assert.ok(value && value.trim().length > 0, `${name} must be set for integration tests`);
  return value;
}

async function getAccessToken(baseUrl: string, apiKey: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
  const body = (await response.json()) as AuthTokens;
  assert.ok(body.access_token, `missing access token for ${email}`);
  return body.access_token;
}

describe("Critical API flows (integration)", () => {
  let server: Server;
  let appBaseUrl: string;
  let supabase: SupabaseClient;
  let supabaseUrl: string;
  let serviceRoleKey: string;
  let orgId: string;
  let adminMembershipId: string;
  let learnerMembershipId: string;
  let adminToken: string;
  let learnerToken: string;

  before(
    async () =>
      new Promise<void>((resolve, reject) => {
        supabaseUrl = requireEnv("SUPABASE_URL");
        serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
        supabase = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        server = app.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (!addr || typeof addr === "string") {
            reject(new Error("Could not bind ephemeral port"));
            return;
          }
          appBaseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
        server.on("error", reject);
      }),
  );

  before(async () => {
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "acme-holdings")
      .single();
    assert.ifError(orgErr);
    assert.ok(org?.id, "acme-holdings org missing");
    orgId = org.id as string;

    const { data: adminMembership, error: adminErr } = await supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", orgId)
      .eq("role", "org_admin")
      .limit(1)
      .single();
    assert.ifError(adminErr);
    assert.ok(adminMembership?.id, "org_admin membership missing");
    adminMembershipId = adminMembership.id as string;

    const { data: learnerMembership, error: learnerErr } = await supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", orgId)
      .eq("role", "learner")
      .limit(1)
      .single();
    assert.ifError(learnerErr);
    assert.ok(learnerMembership?.id, "learner membership missing");
    learnerMembershipId = learnerMembership.id as string;

    adminToken = await getAccessToken(supabaseUrl, serviceRoleKey, "admin@acme.test", "Pass1234!");
    learnerToken = await getAccessToken(supabaseUrl, serviceRoleKey, "learner@acme.test", "Pass1234!");
  });

  after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  test("onboarding assign -> learner progress -> learner complete", async () => {
    const suffix = randomUUID().slice(0, 8);

    const { data: template, error: templateErr } = await supabase
      .from("onboarding_templates")
      .insert({
        organization_id: orgId,
        name: `Critical Flow Template ${suffix}`,
        target_roles: ["learner"],
        status: "published",
        version: 1,
      })
      .select("id")
      .single();
    assert.ifError(templateErr);
    assert.ok(template?.id, "template create failed");
    const templateId = template.id as string;

    const { data: stage, error: stageErr } = await supabase
      .from("onboarding_stages")
      .insert({
        organization_id: orgId,
        onboarding_template_id: templateId,
        name: "Week 1",
        order_index: 1,
        start_offset_days: 0,
        end_offset_days: 1,
      })
      .select("id")
      .single();
    assert.ifError(stageErr);
    assert.ok(stage?.id, "stage create failed");

    const { error: itemErr } = await supabase.from("onboarding_checklist_items").insert({
      organization_id: orgId,
      onboarding_stage_id: stage.id as string,
      item_type: "read_attachment",
      title: `Read policy ${suffix}`,
      required: true,
      due_offset_days: 1,
      completion_rule_json: {},
    });
    assert.ifError(itemErr);

    const assignResponse = await fetch(`${appBaseUrl}/api/onboarding/assign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        membershipId: learnerMembershipId,
        onboardingTemplateId: templateId,
        triggerSource: "manual",
      }),
    });
    assert.equal(assignResponse.status, 202);

    const { data: instance, error: instanceErr } = await supabase
      .from("onboarding_instances")
      .select("id")
      .eq("organization_id", orgId)
      .eq("membership_id", learnerMembershipId)
      .eq("onboarding_template_id", templateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    assert.ifError(instanceErr);
    assert.ok(instance?.id, "onboarding instance not created");

    const { data: checklistProgress, error: progressErr } = await supabase
      .from("checklist_progress")
      .select("id")
      .eq("organization_id", orgId)
      .eq("onboarding_instance_id", instance.id as string)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    assert.ifError(progressErr);
    assert.ok(checklistProgress?.id, "checklist progress not created");

    const progressParams = new URLSearchParams({
      organizationId: orgId,
      membershipId: learnerMembershipId,
    });
    const progressResponse = await fetch(`${appBaseUrl}/api/onboarding/progress/me?${progressParams}`, {
      headers: { Authorization: `Bearer ${learnerToken}` },
    });
    assert.equal(progressResponse.status, 200);
    const progressBody = (await progressResponse.json()) as { summary?: { total?: number } };
    assert.ok((progressBody.summary?.total ?? 0) > 0, "expected onboarding progress rows");

    const completeResponse = await fetch(`${appBaseUrl}/api/onboarding/progress/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${learnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        membershipId: learnerMembershipId,
        checklistProgressId: checklistProgress.id,
      }),
    });
    assert.equal(completeResponse.status, 200);
    const completeBody = (await completeResponse.json()) as { completed?: boolean; onboardingStatus?: string };
    assert.equal(completeBody.completed, true);
    assert.equal(completeBody.onboardingStatus, "completed");
  });

  test("quiz start -> submit calculates score/result", async () => {
    const suffix = randomUUID().slice(0, 8);

    const createCourseResponse = await fetch(`${appBaseUrl}/api/courses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        title: `Critical Quiz Course ${suffix}`,
        description: "integration test course",
        category: "skill",
      }),
    });
    assert.equal(createCourseResponse.status, 201);
    const createCourseBody = (await createCourseResponse.json()) as { courseId: string };
    const courseId = createCourseBody.courseId;

    const publishCourseResponse = await fetch(`${appBaseUrl}/api/courses/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organizationId: orgId, courseId }),
    });
    assert.equal(publishCourseResponse.status, 200);

    const createQuizResponse = await fetch(`${appBaseUrl}/api/org/quizzes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        courseId,
        title: `Critical Quiz ${suffix}`,
        passMarkPercent: 50,
      }),
    });
    assert.equal(createQuizResponse.status, 201);
    const createQuizBody = (await createQuizResponse.json()) as { quizId: string };
    const quizId = createQuizBody.quizId;

    const addQuestion1Response = await fetch(`${appBaseUrl}/api/org/quizzes/mcq`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        quizId,
        prompt: "2 + 2 = ?",
        options: ["3", "4", "5"],
        correctIndex: 1,
      }),
    });
    assert.equal(addQuestion1Response.status, 201);
    const q1 = (await addQuestion1Response.json()) as { questionId: string };

    const addQuestion2Response = await fetch(`${appBaseUrl}/api/org/quizzes/mcq`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        quizId,
        prompt: "Capital of France?",
        options: ["Paris", "Berlin", "Madrid"],
        correctIndex: 0,
      }),
    });
    assert.equal(addQuestion2Response.status, 201);
    const q2 = (await addQuestion2Response.json()) as { questionId: string };

    const publishQuizResponse = await fetch(`${appBaseUrl}/api/org/quizzes/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organizationId: orgId, quizId }),
    });
    assert.equal(publishQuizResponse.status, 200);

    const assignCourseResponse = await fetch(`${appBaseUrl}/api/enrollments/assign-course`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        membershipId: learnerMembershipId,
        courseId,
      }),
    });
    assert.equal(assignCourseResponse.status, 201);

    const startAttemptResponse = await fetch(`${appBaseUrl}/api/learn/quiz-attempts/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${learnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        membershipId: learnerMembershipId,
        quizId,
      }),
    });
    assert.equal(startAttemptResponse.status, 201);
    const startAttemptBody = (await startAttemptResponse.json()) as {
      attemptId: string;
      questions: Array<{ id: string }>;
    };
    assert.equal(startAttemptBody.questions.length, 2);

    const submitAttemptResponse = await fetch(`${appBaseUrl}/api/learn/quiz-attempts/submit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${learnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        membershipId: learnerMembershipId,
        attemptId: startAttemptBody.attemptId,
        answers: [
          { questionId: q1.questionId, choiceIndex: 1 },
          { questionId: q2.questionId, choiceIndex: 0 },
        ],
      }),
    });
    assert.equal(submitAttemptResponse.status, 200);
    const submitAttemptBody = (await submitAttemptResponse.json()) as {
      scorePercent: number;
      result: "pass" | "fail";
      passMarkPercent: number;
    };
    assert.equal(submitAttemptBody.passMarkPercent, 50);
    assert.equal(submitAttemptBody.result, "pass");
    assert.ok(submitAttemptBody.scorePercent >= 100);
  });

  test("billing webhook updates org plan tier when signature checks are skipped", async () => {
    const previousSkip = process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY;
    process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY = "1";

    try {
      const response = await fetch(`${appBaseUrl}/api/billing/chip/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "purchase.paid",
          reference: `myacademy:${orgId}:growth`,
        }),
      });
      assert.equal(response.status, 200);

      const { data: orgAfter, error } = await supabase
        .from("organizations")
        .select("plan_tier")
        .eq("id", orgId)
        .single();
      assert.ifError(error);
      assert.equal(orgAfter?.plan_tier, "growth");
    } finally {
      if (previousSkip === undefined) {
        delete process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY;
      } else {
        process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY = previousSkip;
      }
    }
  });
});
