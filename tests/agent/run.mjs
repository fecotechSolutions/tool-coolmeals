#!/usr/bin/env node
/**
 * Runner de los tests del agente de Kapso.
 *
 * Cada caso levanta una ejecución real del workflow de test (mismo prompt y mismas tools
 * que producción, pero contra la function mock) y corre asserts sobre lo que el lead vería.
 *
 *   node tests/agent/run.mjs                 # todos los casos
 *   node tests/agent/run.mjs --case gastro   # solo los que matcheen
 *   node tests/agent/run.mjs --no-sync       # no re-sincroniza el workflow de test
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertRoutingContract } from "./assert-routing-contract.mjs";
import { cases } from "./cases.mjs";
import { noEmptyMessages, noInternalNarration, promiseImpliesHandoff } from "./lib/assertions.mjs";
import { runConversation } from "./lib/conversation.mjs";
import { REPO_ROOT } from "./lib/kapso.mjs";
import { syncTestWorkflow } from "./sync-workflow.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const filter = value("case");
const concurrency = Number(value("concurrency") || 3);
const artifactsDir = path.join(REPO_ROOT, "tests/agent/.runs");

// Asserts que aplican a todos los casos.
const GLOBAL_ASSERTS = [noInternalNarration(), noEmptyMessages(), promiseImpliesHandoff()];

// Kapso reutiliza la conversación de WhatsApp por número, así que cada corrida usa
// un rango de números propio: si no, los asserts leen mensajes de corridas anteriores.
const RUN_PREFIX = String(Date.now()).slice(-6);

function phoneFor(index) {
  return `+549${RUN_PREFIX}${String(100 + index).slice(-3)}`;
}

async function runCase(testCase, index, workflowId) {
  const started = Date.now();
  try {
    const result = await runConversation({
      workflowId,
      phone: phoneFor(index),
      turns: testCase.turns,
    });

    const checks = [...GLOBAL_ASSERTS, ...testCase.asserts].map((assertion) => {
      const outcome = assertion.check(result);
      return { name: assertion.name, ...outcome };
    });

    return {
      id: testCase.id,
      title: testCase.title,
      ok: checks.every((c) => c.ok),
      elapsedMs: Date.now() - started,
      checks,
      result,
    };
  } catch (error) {
    return {
      id: testCase.id,
      title: testCase.title,
      ok: false,
      elapsedMs: Date.now() - started,
      checks: [{ name: "la conversación corre sin errores", ok: false, detail: String(error.message || error) }],
      result: null,
    };
  }
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const selected = filter
  ? cases.filter((c) => c.id.includes(filter) || c.title.toLowerCase().includes(filter.toLowerCase()))
  : cases;

if (!selected.length) {
  console.error(`Ningún caso matchea "${filter}"`);
  process.exit(2);
}

let workflowId = value("workflow-id");
if (!flag("no-sync") || !workflowId) {
  process.stdout.write("Sincronizando workflow de test… ");
  const workflow = await syncTestWorkflow();
  workflowId = workflow.id;
  console.log(`ok (${workflow.name})`);
}

process.stdout.write("Verificando contrato de ruteo (mock ≡ regla acordada)… ");
try {
  await assertRoutingContract();
  console.log("ok");
} catch (error) {
  console.log("FAIL");
  console.error(error.message || error);
  console.error(
    "El mock no refleja el comportamiento real. Alineá coolmeals-bot-actions-mock con prod y redeploy.",
  );
  process.exit(1);
}

console.log(`Corriendo ${selected.length} caso(s) con concurrencia ${concurrency}\n`);

const outcomes = await runPool(selected, concurrency, (testCase, index) => {
  const globalIndex = cases.indexOf(testCase);
  return runCase(testCase, globalIndex, workflowId).then((outcome) => {
    console.log(`${outcome.ok ? "PASS" : "FAIL"}  ${outcome.id}  (${Math.round(outcome.elapsedMs / 1000)}s)`);
    for (const check of outcome.checks.filter((c) => !c.ok)) {
      console.log(`        ✗ ${check.name}: ${check.detail}`);
    }
    return outcome;
  });
});

const failed = outcomes.filter((o) => !o.ok);

const outOfCredits = outcomes.some((o) =>
  o.checks.some((c) => !c.ok && /insufficient credits/i.test(c.detail || "")),
);
if (outOfCredits) {
  console.log(
    "\nEl proyecto de Kapso se quedó sin créditos: los tests no pueden correr hasta recargar.",
  );
}

mkdirSync(artifactsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifact = path.join(artifactsDir, `run-${stamp}.json`);
writeFileSync(artifact, JSON.stringify(outcomes, null, 2));

console.log(`\n${outcomes.length - failed.length}/${outcomes.length} casos OK`);
console.log(`Transcripciones: ${path.relative(REPO_ROOT, artifact)}`);

if (failed.length) {
  console.log("\nCasos con fallas:");
  for (const outcome of failed) {
    console.log(`  - ${outcome.id}: ${outcome.title}`);
  }
  process.exit(1);
}
