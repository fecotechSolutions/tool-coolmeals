/**
 * Prueba escritura a los Google Sheets (derivados, muestras, atención comercial, sin cobertura).
 *
 * Uso:
 *   npm run test:sheets -w @coolmeals/api
 */
import {
  appendSheetRow,
  commercialAttentionSheetRow,
  derivedLeadSheetRow,
  noCoverageSheetRow,
  sampleLogisticsSheetRow,
} from "../src/lib/sheets";

async function main() {
  console.log("→ Probando sheet de leads derivados…");
  const derived = await appendSheetRow(
    "derived_distributors",
    "test",
    null,
    derivedLeadSheetRow({
      fullName: "TEST Cool Meals",
      phone: "+5493510000000",
      company: "Empresa Test",
      businessType: "Local gastronómico",
      clientType: "minorista",
      province: "Córdoba",
      city: "Córdoba",
      postalCode: "5000",
      distributorName: "TEST Dist",
    }),
    { source: "test-sheets.ts" },
  );
  console.log(derived);

  console.log("→ Probando sheet de muestras…");
  const samples = await appendSheetRow(
    "sample_logistics",
    "test",
    null,
    sampleLogisticsSheetRow({
      fullName: "TEST Cool Meals",
      phone: "+5493510000000",
      address: "Gral. Manuel Savio 6010, Córdoba",
    }),
    { source: "test-sheets.ts" },
  );
  console.log(samples);

  console.log("→ Probando sheet atención comercial (dist/rep/fasón)…");
  const commercial = await appendSheetRow(
    "commercial_attention",
    "test",
    null,
    commercialAttentionSheetRow({
      fullName: "TEST Cool Meals",
      phone: "+5493510000000",
      company: "Pepitos SA",
      tipoCliente: "fason",
      province: "Buenos Aires",
      reason: "TEST tercer feedback",
    }),
    { source: "test-sheets.ts" },
  );
  console.log(commercial);

  console.log("→ Probando sheet sin cobertura…");
  const noCoverage = await appendSheetRow(
    "no_coverage",
    "test",
    null,
    noCoverageSheetRow({
      fullName: "TEST Cool Meals",
      phone: "+5493510000000",
      province: "Salta",
      clientType: "minorista",
      reason: "TEST sin cobertura",
    }),
    { source: "test-sheets.ts" },
  );
  console.log(noCoverage);

  const all = [derived, samples, commercial, noCoverage];
  if (all.some((r) => !r.success)) {
    console.error(
      "\n✗ Falló al menos un sheet. Revisá IDs, webhook y que la cuenta del Apps Script tenga Editor en los 4 sheets.",
    );
    process.exit(1);
  }

  console.log("\n✓ Los 4 sheets OK. Borrá las filas TEST cuando quieras.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
