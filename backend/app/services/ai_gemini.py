import json
import logging
from typing import Dict, Any, List, Optional
import httpx

from app.config import settings

logger = logging.getLogger("ai_gemini")

SYSTEM_INSTRUCTION = """
Eres un ingeniero de software senior y asistente de programación autónomo para Vibe Manager AI.
Tu tarea es analizar la solicitud del usuario (prompt validado), entender la estructura del proyecto y generar los cambios exactos de código requeridos, junto con un mensaje de commit semántico y una descripción para el Pull Request de GitHub.

Debes responder ÚNICAMENTE con un objeto JSON válido con la siguiente estructura:
{
  "commit_message": "tipo(alcance): descripción breve y precisa del cambio",
  "pr_title": "Título claro para el Pull Request",
  "pr_body": "Descripción detallada en Markdown de los cambios realizados, archivos modificados y consideraciones",
  "changes": [
    {
      "path": "ruta/relativa/al/archivo.ext",
      "action": "MODIFY" | "CREATE" | "DELETE",
      "content": "Contenido completo del archivo para CREATE o MODIFY (debe ser código completo, sin omitir partes con comentarios tipo 'resto del código sigue igual')"
    }
  ]
}
"""

async def generate_code_changes(
    prompt: str,
    project_name: str,
    project_rules: Optional[str] = None,
    file_tree: Optional[List[str]] = None,
    file_samples: Optional[Dict[str, str]] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calls Google Gemini to generate code modifications and PR details based on prompt.
    """
    key = api_key or settings.GEMINI_API_KEY
    chosen_model = model or settings.GEMINI_MODEL
    
    context_str = f"Proyecto: {project_name}\n"
    if project_rules:
        context_str += f"Reglas y directrices del proyecto:\n{project_rules}\n\n"
        
    if file_tree:
        context_str += f"Árbol de archivos del repositorio:\n" + "\n".join(file_tree[:100]) + "\n\n"
        
    if file_samples:
        context_str += "Contenido de archivos clave relevantes:\n"
        for path, sample in list(file_samples.items())[:5]:
            context_str += f"--- {path} ---\n{sample[:2500]}\n"
            
    user_message = f"{context_str}\nSolicitud de cambio (Prompt validado):\n\"\"\"\n{prompt}\n\"\"\"\n\nGenera el JSON con los cambios requeridos."

    if not key:
        # Mock mode when no API key is set yet, allowing testing without immediate API keys
        logger.warning("No GEMINI_API_KEY configured. Generating standard automated change template.")
        return {
            "commit_message": f"feat: apply prompt changes for {project_name}",
            "pr_title": f"Vibe Task: Modificaciones para {project_name}",
            "pr_body": f"## Cambios automáticos generados por Vibe Manager AI\n\n**Prompt original:**\n> {prompt}\n\n*Nota: Ejecutado en modo simulación (configura GEMINI_API_KEY para generación IA en tiempo real).*",
            "changes": [
                {
                    "path": "VIBE_CHANGES.md",
                    "action": "CREATE",
                    "content": f"# Modificaciones aplicadas por Vibe Manager AI\n\n- **Proyecto:** {project_name}\n- **Prompt:** {prompt}\n- **Fecha:** Generado automáticamente\n"
                }
            ]
        }

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{chosen_model}:generateContent?key={key}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": SYSTEM_INSTRUCTION},
                    {"text": user_message}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }
    
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(endpoint, json=payload)
        if response.status_code != 200:
            raise RuntimeError(f"Gemini API error ({response.status_code}): {response.text}")
            
        data = response.json()
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                raise RuntimeError("No candidates returned by Gemini")
            raw_text = candidates[0]["content"]["parts"][0]["text"].strip()
            import re
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                raw_text = re.sub(r"\s*```$", "", raw_text)
            parsed = json.loads(raw_text)
            return parsed
        except Exception as e:
            raise RuntimeError(f"Error parseando respuesta JSON de Gemini: {str(e)}\nRespuesta cruda: {data}")
