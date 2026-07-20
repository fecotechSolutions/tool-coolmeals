/**
 * Cool Meals — append rows to Google Sheets without service account keys.
 *
 * SETUP (≈5 min):
 * 1. Abrí cualquiera de los sheets (derivados, muestras, atención comercial, sin cobertura)
 *    con la misma cuenta Google que va a desplegar el Apps Script.
 * 2. Extensiones → Apps Script
 * 3. Borrá el código default y pegá TODO este archivo
 * 4. En Script Properties (⚙️ Project settings → Script properties) agregá:
 *      WEBHOOK_SECRET = (una frase larga aleatoria, ej. coolmeals-sheets-xxxx)
 * 5. Deploy → New deployment → Type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Copiá la URL del deployment (termina en /exec)
 * 7. En apps/api/.env (y secrets Kapso de coolmeals-bot-actions):
 *      GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
 *      GOOGLE_SHEETS_WEBHOOK_SECRET=la-misma-frase-del-paso-4
 *      (+ IDs de los 4 sheets)
 * 8. Compartí TODOS los sheets como Editor con esa misma cuenta Google.
 * 9. npm run test:sheets -w @coolmeals/api
 *
 * El script escribe en el spreadsheetId que manda la API (los 4 sheets).
 */

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty("WEBHOOK_SECRET");
    if (!expected) {
      return jsonResponse_({
        ok: false,
        error: "WEBHOOK_SECRET not set in Script Properties",
      });
    }

    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    if (!body.secret || body.secret !== expected) {
      return jsonResponse_({ ok: false, error: "Unauthorized" });
    }

    if (!body.spreadsheetId || !body.values || !Array.isArray(body.values)) {
      return jsonResponse_({
        ok: false,
        error: "spreadsheetId and values[] required",
      });
    }

    var ss = SpreadsheetApp.openById(String(body.spreadsheetId));
    var sheetName = body.sheetName || "Sheet1";
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      // fallback: primera hoja
      sheet = ss.getSheets()[0];
    }
    if (!sheet) {
      return jsonResponse_({ ok: false, error: "No sheet found" });
    }

    sheet.appendRow(body.values.map(String));

    return jsonResponse_({
      ok: true,
      kind: body.kind || null,
      spreadsheetId: body.spreadsheetId,
      sheetName: sheet.getName(),
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

/** Health check rápido en el browser. */
function doGet() {
  return jsonResponse_({ ok: true, service: "coolmeals-sheets-append" });
}
