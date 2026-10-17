import os
import subprocess
import google.auth
import google.auth.transport.requests

print("1. Fetching authorized ADC token for paylens-fintech...")
creds, proj = google.auth.default()
req = google.auth.transport.requests.Request()
creds.refresh(req)
token = creds.token

print(f"2. Token acquired. Setting CLOUDSDK_AUTH_ACCESS_TOKEN...")
env = os.environ.copy()
env["CLOUDSDK_AUTH_ACCESS_TOKEN"] = token

cmd = [
    "gcloud", "run", "deploy", "paylens",
    "--source", ".",
    "--region", "asia-south1",
    "--allow-unauthenticated",
    "--max-instances", "3",
    "--min-instances", "0",
    "--memory", "512Mi",
    "--cpu", "1",
    "--concurrency", "20",
    "--project", "paylens-fintech",
    "--quiet"
]

print("3. Executing Cloud Run deployment:", " ".join(cmd))
res = subprocess.run(cmd, env=env, shell=True)
print("4. Deployment finished with returncode:", res.returncode)
