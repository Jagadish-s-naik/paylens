"""
Benchmark script to test Gemini extraction against 5 synthetic payslips.
Reports accuracy percentage per file and overall accuracy.
"""

import os
import sys
import json
from extract import extract_payslip_from_bytes, generate_financial_explanation

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

with open("samples/ground_truth.json", "r") as f:
    ground_truth = json.load(f)

print("=" * 65)
print("  PAYLENS — GEMINI EXTRACTION BENCHMARK (5 SYNTHETIC PAYSLIPS)")
print("=" * 65)

total_fields_checked = 0
total_fields_matched = 0
file_results = []

for filename, expected in ground_truth.items():
    filepath = os.path.join("samples", filename)
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == ".pdf":
        mime_type = "application/pdf"
    elif ext == ".png":
        mime_type = "image/png"
    elif ext in [".jpg", ".jpeg"]:
        mime_type = "image/jpeg"
    else:
        mime_type = "application/octet-stream"
        
    print(f"\nProcessing: {filename} ({mime_type})...")
    with open(filepath, "rb") as f:
        file_bytes = f.read()
        
    extracted = extract_payslip_from_bytes(file_bytes, mime_type)
    if not extracted:
        print(f" ❌ Failed to extract from {filename}")
        file_results.append((filename, 0.0, 0, len(expected)))
        continue
        
    matched = 0
    total = len(expected)
    extracted_dict = extracted.model_dump()
    
    print(f" Extracted: Gross=₹{extracted.gross_monthly:,.2f}, Basic=₹{extracted.basic:,.2f}, HRA=₹{extracted.hra:,.2f}, PF=₹{extracted.pf_employee:,.2f}, NetPay=₹{extracted.net_pay:,.2f}")
    
    for key, exp_val in expected.items():
        actual_val = extracted_dict.get(key, 0.0)
        # Match within 0.01 tolerance
        if abs(actual_val - exp_val) < 1.0:
            matched += 1
        else:
            print(f"   ⚠️ Mismatch on '{key}': expected {exp_val}, got {actual_val}")
            
    accuracy = (matched / total) * 100.0
    print(f" Accuracy: {accuracy:.1f}% ({matched}/{total} fields matched)")
    file_results.append((filename, accuracy, matched, total))
    total_fields_checked += total
    total_fields_matched += matched

print("\n" + "=" * 65)
print("  BENCHMARK SUMMARY REPORT")
print("=" * 65)
for fname, acc, m, t in file_results:
    status = "✅ PASS" if acc >= 90.0 else "⚠️ REVIEW"
    print(f" {status} | {fname:<32} : {acc:5.1f}% ({m}/{t})")

overall_acc = (total_fields_matched / total_fields_checked) * 100.0 if total_fields_checked else 0
print("-" * 65)
print(f" OVERALL EXTRACTION ACCURACY : {overall_acc:.1f}% ({total_fields_matched}/{total_fields_checked} fields)")
print("=" * 65)

# Test explanation endpoint too
print("\n--- Testing 5-Bullet Financial Explanation in English & Hindi ---")
sample_computed = {
    "gross_monthly": 80000.0,
    "better_regime": "NEW",
    "annual_savings": 62920.0,
    "recommended_take_home": 72000.0,
    "safe_emi": 25200.0,
    "loan_capacity": 530000.0
}
bullets_en = generate_financial_explanation(sample_computed, language="en")
print(f"English Bullets ({len(bullets_en)}):")
for b in bullets_en:
    print(f" • {b}")

bullets_hi = generate_financial_explanation(sample_computed, language="hi")
print(f"\nHindi Bullets ({len(bullets_hi)}):")
for b in bullets_hi:
    print(f" • {b}")
