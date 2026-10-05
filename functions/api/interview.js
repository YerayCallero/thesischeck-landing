/**
 * Cloudflare Pages Function: /api/interview
 * Endpoint serverless blindado para el Auditor Socrático Forense de ThesisCheck.
 * Medidas de protección de costes y abuso:
 * 1. Hard Cap de turnos: Máximo 3 turnos de usuario por llamada (cierre automático).
 * 2. Tokens acotados: maxOutputTokens 180 (respuestas directas y concisas).
 * 3. Fallback elegante sin romper la demo ante cuotas agotadas.
 */

const SYSTEM_PROMPT_CHAT_ES = `Eres el Auditor Socrático Forense de ThesisCheck.
Tu misión es entrevistar al inversor para someter su tesis de inversión a un escrutinio forense implacable basado en los filings oficiales 10-Q y 10-K de la SEC.
Reglas operativas obligatorias:
1. Idioma: Español estricto, tono sobrio, inquisitivo, riguroso y escéptico. Cero adulación, cero jerga comercial.
2. Si el inversor menciona una empresa o ticker (ej. Zoetis, Alexandria, CrowdStrike, ASML, 3M, Nike, MercadoLibre, Palantir, etc.):
   - Desafía de inmediato su narrativa señalando el principal riesgo contable, dilución por SBC, deuda o contingencias legales (ASC 450).
   - Exige que defina su línea roja cuantitativa o kill-switch contable que le forzaría a vender.
3. Si el inversor declara fondos indexados (Boglehead, VWCE, S&P 500):
   - Reconoce la ausencia de riesgo idiosincrático por 10-K corporativo y explica que ThesisCheck audita carteras activas.
4. Mantén tus intervenciones cortas y contundentes (máximo 2 frases) para garantizar una conversación ágil por micrófono.`;

const SYSTEM_PROMPT_CHAT_EN = `You are the ThesisCheck Forensic Socratic Auditor.
Your mission is to interview the investor to subject their thesis to relentless scrutiny against statutory SEC Form 10-Q and 10-K filings.
Mandatory rules:
1. Strict sober, institutional, skeptical equity-research tone. Zero sycophancy or sales talk.
2. When the investor mentions a company or ticker, challenge their narrative by pointing out balance sheet risks, SBC dilution, debt refinancings, or ASC 450 contingent liabilities.
3. Demand their quantitative kill-switch or exit red line.
4. Keep turns short (2 sentences max) for an agile voice dialogue.`;

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
            return new Response(JSON.stringify({ 
                error: "GEMINI_API_KEY_NOT_CONFIGURED", 
                detail: "La clave de Gemini no está configurada aún en Cloudflare Pages. Utilice el modo de simulación guiada." 
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        const body = await request.json();
        const action = body.action || "chat";
        const messages = body.messages || [];
        const language = body.language || "es";

        // Cost & abuse guard: hard turn cap (max 6 total messages in sequence)
        if (action === "chat" && messages.length > 6) {
            return new Response(JSON.stringify({
                role: "auditor",
                text: language === "es"
                    ? "He registrado tus tesis principales y líneas rojas. Concluyo la llamada para proyectar tu terminal forense personalizada en pantalla."
                    : "I have recorded your key theses and red lines. Ending call now to project your customized forensic terminal on screen.",
                call_concluded: true
            }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        if (action === "chat") {
            const systemPrompt = language === "en" ? SYSTEM_PROMPT_CHAT_EN : SYSTEM_PROMPT_CHAT_ES;
            
            const contents = messages.map(m => ({
                role: m.role === "auditor" ? "model" : "user",
                parts: [{ text: m.text }]
            }));

            const payload = {
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: contents,
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 180 // Tight token limit to minimize cost and latency
                }
            };

            const resp = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                // If rate limited or quota exceeded, return fallback message gracefully
                return new Response(JSON.stringify({
                    role: "auditor",
                    text: language === "es"
                        ? "Entendido. He registrado tus empresas y horizonte. ¿Cuál es tu línea roja cuantitativa en balance o flujo de caja que te forzaría a vender?"
                        : "Understood. I have recorded your holdings and horizon. What is your quantitative exit red line on free cash flow or debt?"
                }), {
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
                return new Response(JSON.stringify({ success: false, fallback: true }), {
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
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
