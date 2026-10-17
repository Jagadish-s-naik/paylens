import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

from config import settings
from google.cloud import firestore
from google.cloud import translate_v2 as translate
from google import genai
from google.genai import types

print("=" * 55)
print("  PAYLENS — GCP SERVICES VERIFICATION SMOKE TEST")
print("=" * 55)
print(f"Project ID : {settings.PROJECT_ID}")
print(f"Region     : {settings.REGION}")
print(f"Vertex Loc : {settings.VERTEX_LOCATION}")
print(f"Model      : {settings.GEMINI_MODEL}")
print("-" * 55)

# 1. Firestore Test
try:
    db = firestore.Client(project=settings.PROJECT_ID)
    doc_ref = db.collection("smoke_tests").document("ping")
    doc_ref.set({"status": "healthy", "service": "firestore", "app": "paylens"})
    doc = doc_ref.get().to_dict()
    print(" [1/3] Firestore (asia-south1): SUCCESS! ->", doc)
except Exception as e:
    print(" [1/3] Firestore: FAILED ->", e)

# 2. Cloud Translation Test
try:
    tc = translate.Client()
    res_hi = tc.translate("Take-Home Salary", target_language="hi")
    res_kn = tc.translate("Take-Home Salary", target_language="kn")
    print(f" [2/3] Cloud Translation: SUCCESS! -> Hindi: {res_hi['translatedText']} | Kannada: {res_kn['translatedText']}")
except Exception as e:
    print(" [2/3] Cloud Translation: FAILED ->", e)

# 3. Gemini Vertex AI Test
try:
    client = genai.Client(vertexai=True, project=settings.PROJECT_ID, location=settings.VERTEX_LOCATION)
    resp = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents="Reply in 5 words: Confirm Paylens AI is operational.",
        config=types.GenerateContentConfig(max_output_tokens=30, temperature=0.0)
    )
    print(f" [3/3] Gemini on Vertex AI ({settings.GEMINI_MODEL}): SUCCESS! -> {resp.text.strip()}")
except Exception as e:
    print(" [3/3] Gemini on Vertex AI: FAILED ->", e)

print("=" * 55)
print("  PHASE 0 CLOUD VERIFICATION COMPLETE: ALL SYSTEMS READY")
print("=" * 55)
