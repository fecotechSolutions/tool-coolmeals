/**
 * Contrato de ruteo acordado (fuente de verdad = prod + docs).
 *
 * El workflow [TEST] usa coolmeals-bot-actions-mock. Si el mock se atrasa,
 * las pruebas mienten. Este check corre ANTES de los casos del agente.
 *
 * Regla ≥50: Cool Meals directo en CUALQUIER provincia.
 * <50 Córdoba → operador; <50 fuera → dist / sin cobertura.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT, apiRaw } from "./lib/kapso.mjs";
import { MOCK_FUNCTION_ID } from "./sync-workflow.mjs";

const MOCK_SRC = path.join(REPO_ROOT, "functions/coolmeals-bot-actions-mock/index.js");
const PROD_SRC = path.join(REPO_ROOT, "functions/coolmeals-bot-actions/index.js");

async function invokeMock(input) {
  const raw = await apiRaw("POST", `/functions/${MOCK_FUNCTION_ID}/invoke`, {
    input,
  });
  // Kapso may wrap: { data: { ... } } or passthrough body
  const body = raw?.data ?? raw;
  if (body && typeof body === "object" && body.result) return body.result;
  return body;
}

function assert(condition, detail) {
  if (!condition) throw new Error(detail);
}

function assertSourceAligned() {
  const mock = readFileSync(MOCK_SRC, "utf8");
  const prod = readFileSync(PROD_SRC, "utf8");

  assert(
    /≥50, cualquier provincia/.test(mock) && /≥50, cualquier provincia/.test(prod),
    "mock y prod deben documentar ≥50 en cualquier provincia",
  );
  assert(
    /blockDerivationAtHighVolume/.test(mock) && /blockDerivationAtHighVolume/.test(prod),
    "mock y prod deben bloquear sync_derived con volumen ≥50",
  );
  assert(
    !/usesVolumeThreshold && isCordoba/.test(mock),
    "mock NO puede tener la regla vieja (≥50 solo Córdoba)",
  );
  assert(
    !/fuera de Córdoba → red de distribuidores/.test(mock),
    "mock NO puede decir que ≥50 fuera de Córdoba va a la red de dist.",
  );
  assert(
    /gateContactBeforeClose/.test(mock) && /gateContactBeforeClose/.test(prod),
    "mock y prod deben exigir contacto (nombre/negocio/tel confirmado) antes de handoff/derive",
  );
  assert(
    /gateDecideRouteQualification/.test(mock) && /gateDecideRouteQualification/.test(prod),
    "mock y prod deben tener gateDecideRouteQualification (checklist duro)",
  );
  assert(
    /nextStepAfterDistributorColumn/.test(mock) && /nextStepAfterDistributorColumn/.test(prod),
    "mock y prod deben devolver nextStep tras columna quiere_ser_distribuidor",
  );
}

async function assertRuntimeContract() {
  // ≥50 Santa Fe → Cool Meals directo (nunca Litoral Fresh)
  const high = await invokeMock({
    action: "decide_route",
    certainty: "high",
    clientType: "retail",
    province: "Santa Fe",
    estimatedVolume: 120,
  });
  assert(high?.ok === true, `decide_route ≥50 Santa Fe falló: ${JSON.stringify(high)}`);
  assert(
    high.action === "own_attention" && high.coolMealsMenu === true,
    `≥50 Santa Fe debía ser own_attention+menu, fue action=${high.action} coolMealsMenu=${high.coolMealsMenu}`,
  );
  assert(
    !high.distributorName,
    `≥50 Santa Fe no debe devolver distributorName (recibió ${high.distributorName})`,
  );

  // sync_derived con ≥50 debe rechazar
  const blocked = await invokeMock({
    action: "sync_derived",
    certainty: "high",
    estimatedVolume: 80,
    province: "Mendoza",
    distributorName: "Cool Logística Cuyo",
  });
  assert(
    blocked?.ok === false,
    `sync_derived con ≥50 debía fallar; ok=${blocked?.ok}`,
  );

  // <50 Mendoza → derive
  const low = await invokeMock({
    action: "decide_route",
    certainty: "high",
    clientType: "minorista",
    province: "Mendoza",
    estimatedVolume: 20,
  });
  assert(low?.ok === true, `decide_route <50 Mendoza falló: ${JSON.stringify(low)}`);
  assert(
    low.action === "derive_to_distributor",
    `<50 Mendoza debía derive_to_distributor, fue ${low.action}`,
  );

  // <50 Córdoba → operador sin menú
  const cba = await invokeMock({
    action: "decide_route",
    certainty: "high",
    clientType: "mayorista",
    province: "Córdoba",
    estimatedVolume: 20,
  });
  assert(cba?.ok === true, `decide_route <50 Córdoba falló: ${JSON.stringify(cba)}`);
  assert(
    cba.action === "own_attention" && cba.coolMealsMenu === false,
    `<50 Córdoba debía own_attention sin menú; action=${cba.action} menu=${cba.coolMealsMenu}`,
  );

  // Checklist: retail sin volumen → bloquea
  const noVol = await invokeMock({
    action: "decide_route",
    certainty: "high",
    clientType: "retail",
    province: "Mendoza",
  });
  assert(noVol?.ok === false && noVol.gate === "missing_volume", `retail sin volumen debía missing_volume: ${JSON.stringify(noVol)}`);

  // Checklist: volumen incerto → operador (no rutea)
  const uncertain = await invokeMock({
    action: "decide_route",
    certainty: "high",
    clientType: "distribuidor",
    province: "Córdoba",
    volumeUncertain: true,
  });
  assert(
    uncertain?.ok === false && uncertain.gate === "volume_uncertain",
    `volumen incerto debía volume_uncertain: ${JSON.stringify(uncertain)}`,
  );

  // Upsert dist → nextStep ask_province
  const upsert = await invokeMock({
    action: "upsert_conversation",
    status: "quiere_ser_distribuidor",
    phone: "+5493511111111",
  });
  assert(
    upsert?.nextStep === "ask_province" && upsert.gate === "dist_checklist",
    `upsert dist sin zona debía ask_province: ${JSON.stringify(upsert)}`,
  );

  // Handoff ilegal quiere_ser_distribuidor → remap operador (con contacto OK)
  const remap = await invokeMock({
    action: "handoff",
    status: "quiere_ser_distribuidor",
    reason: "quiere precios",
    fullName: "Fer Romay",
    company: "Distribuidora Test",
    contactPhone: "543513053755",
    phoneConfirmed: true,
  });
  assert(
    remap?.ok === true &&
      remap.status === "atencion_representante" &&
      remap.gateRemap === "quiere_ser_distribuidor_to_atencion_representante",
    `handoff dist debía remapear a operador: ${JSON.stringify(remap)}`,
  );

  // Contacto obligatorio: handoff sin datos → missing_contact
  const noContact = await invokeMock({
    action: "handoff",
    status: "atencion_representante",
    reason: "operador",
  });
  assert(
    noContact?.ok === false && noContact.gate === "missing_contact",
    `handoff sin contacto debía missing_contact: ${JSON.stringify(noContact)}`,
  );

  // Negativa de contacto → permite handoff operador
  const refused = await invokeMock({
    action: "handoff",
    status: "atencion_representante",
    reason: "no quiere dar datos",
    contactRefused: true,
  });
  assert(
    refused?.ok === true && refused.status === "atencion_representante",
    `contactRefused debía permitir handoff: ${JSON.stringify(refused)}`,
  );
}

export async function assertRoutingContract() {
  assertSourceAligned();
  await assertRuntimeContract();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertRoutingContract()
    .then(() => {
      console.log("OK  contrato de ruteo mock ≡ regla acordada (≥50 Cool Meals directo)");
    })
    .catch((error) => {
      console.error("FAIL contrato de ruteo:", error.message || error);
      process.exit(1);
    });
}
