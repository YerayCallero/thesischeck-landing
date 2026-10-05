/**
 * Cloudflare Pages Function: /api/interview
 * Endpoint serverless para el Auditor Socrático Forense de ThesisCheck.
 * Conecta en tiempo real con Gemini 2.5 Flash para:
 * 1. Conducir la entrevista socrática por voz ('chat')
 * 2. Extraer el esquema JSON estructurado y proyectar la terminal ('extract')
 */

const SYSTEM_PROMPT_CHAT_ES = `Eres el Auditor Socrático Forense de ThesisCheck.
Tu misión es entrevistar al inversor para someter su tesis de inversión a un escrutinio forense implacable basado en los filings oficiales 10-Q y 10-K de la SEC.
Reglas operativas obligatorias:
1. Idioma: Español estricto, tono sobrio, inquisitivo, riguroso y escéptico (como un analista senior de equity research o auditor contable). Cero adulación, cero jerga comercial, cero coletillas complacientes.
2. Si el inversor menciona una empresa o ticker (ej. Zoetis, Alexandria, CrowdStrike, ASML, 3M, Nike, MercadoLibre, Palantir, Nvidia, Tesla, Microsoft, etc.):
   - Desafía de inmediato su narrativa señalando el principal riesgo contable, dilución por SBC, vencimientos de deuda o contingencias legales (ASC 450).
   - Exige que defina su línea roja cuantitativa o kill-switch contable que le forzaría a vender la posición.
3. Si el inversor declara que solo invierte en fondos indexados (Boglehead, VWCE, S&P 500):
   - Reconoce la ausencia de riesgo idiosincrático por 10-K corporativo y explica que ThesisCheck audita las tripas de las empresas individuales para carteras activas.
4. Mantén tus intervenciones concisas (máximo 2-3 frases contundentes) para garantizar una conversación de voz ágil y dinámica por teléfono/micrófono.`;

const SYSTEM_PROMPT_CHAT_EN = `You are the ThesisCheck Forensic Socratic Auditor.
Your mission is to interview the investor to subject their thesis to relentless scrutiny against statutory SEC Form 10-Q and 10-K filings.
Mandatory rules:
1. Strict sober, institutional, skeptical equity-research tone. Zero sycophancy or sales talk.
2. When the investor mentions a company or ticker, challenge their narrative by pointing out balance sheet risks, SBC dilution, debt refinancings, or ASC 450 contingent liabilities.
3. Demand their quantitative kill-switch or exit red line.
4. Keep turns short (2-3 sentences max) for an agile voice dialogue.`;

const SYSTEM_PROMPT_EXTRACT = `Eres el Motor Forense de Extracción de ThesisCheck.
Analiza la transcripción de la entrevista y extrae estrictamente un objeto JSON válido con este formato:
{
  "investor_profile": "Quality Compounder / Hyper-Growth Tech / Contrarian Deep Value / Passive Boglehead",
  "effective_horizon_years": 20,
  "positions": [
    {
      "ticker": "TICKER_EN_MAYUSCULAS",
      "name": "Nombre Corporativo Oficial",
      "sector": "Sector GICS",
      "industry": "Industria Específica",
      "status": "HEALTHY / WARNING / CRITICAL",
      "health_score": 85,
      "fcf_quality": "Porcentaje o ratio de calidad de FCF",
      "sbc_pct_cfo": "Porcentaje de SBC sobre CFO (ej. 4.2% o 27.8%)",
      "net_debt_ebitda": "Ratio Deuda Neta/EBITDA",
      "dividend_payout": "Payout ratio o '0% (Sin dividendo)'",
      "primary_alert_headline": "Titular forense de alto impacto",
      "forensic_summary": "Resumen forense riguroso citando aspectos clave de los filings",
      "footnote_citation": "Cita verbatim o referencia a Nota del 10-Q/10-K",
      "sec_edgar_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
      "financial_impact": "Impacto financiero cuantificado",
      "actionable_verdict": "Veredicto forense institucional",
      "user_thesis": "Tesis que declaró el inversor en la llamada",
      "user_killswitch": "Línea roja declarada por el inversor",
      "contrast_verdict": "Contraste explícito entre la línea roja del usuario y los datos oficiales de la SEC"
    }
  ]
}
Si el inversor declaró una cartera puramente pasiva (0 acciones individuales), 'positions' debe ser una lista vacía [].
Responde EXCLUSIVAMENTE con el JSON parseable. Sin bloques markdown, sin texto adicional.`;

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "GEMINI_API_KEY no configurada en las variables de entorno de Cloudflare." }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const body = await request.json();
        const action = body.action || "chat";
        const messages = body.messages || [];
        const language = body.language || "es";

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        if (action === "chat") {
            const systemPrompt = language === "en" ? SYSTEM_PROMPT_CHAT_EN : SYSTEM_PROMPT_CHAT_ES;
            
            // Format messages for Gemini API
            const contents = messages.map(m => ({
                role: m.role === "auditor" ? "model" : "user",
                parts: [{ text: m.text }]
            }));

            const payload = {
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: contents,
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 250
                }
            };

            const resp = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return new Response(JSON.stringify({ error: `Gemini API Error: ${resp.status}`, detail: errText }), {
                    status: resp.status,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

            return new Response(JSON.stringify({ role: "auditor", text: text }), {
                headers: { "Content-Type": "application/json" }
            });
        } 
        else if (action === "extract") {
            // Build conversation transcript text
            const transcript = messages.map(m => `${m.role === "auditor" ? "ThesisCheck Auditor" : "Inversor"}: ${m.text}`).join("\n\n");

            const payload = {
                system_instruction: { parts: [{ text: SYSTEM_PROMPT_EXTRACT }] },
                contents: [{ role: "user", parts: [{ text: `Transcripción de la llamada:\n\n${transcript}` }] }],
                generationConfig: {
                    temperature: 0.1,
                    response_mime_type: "application/json"
                }
            };

            const resp = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return new Response(JSON.stringify({ error: `Gemini Extract Error: ${resp.status}`, detail: errText }), {
                    status: resp.status,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const data = await resp.json();
            const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
            const portfolio = JSON.parse(rawJson);

            return new Response(JSON.stringify({ success: true, portfolio: portfolio }), {
                headers: { "Content-Type": "application/json" }
            });
        } else {
            return new Response(JSON.stringify({ error: "Acción no reconocida. Use 'chat' o 'extract'." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
