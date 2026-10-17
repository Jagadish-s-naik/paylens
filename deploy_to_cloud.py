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

gcloud_bin = "gcloud.cmd" if os.name == "nt" else "gcloud"

cmd = [
    gcloud_bin, "run", "deploy", "paylens",
    "--source", ".",
    "--region", "asia-south1",
    "--allow-unauthenticated",
    "--max-instances", "1",
    "--min-instances", "0",
    "--memory", "512Mi",
    "--cpu", "1",
    "--concurrency", "20",
    "--project", "paylens-fintech",
    "--quiet"
]

cmd_str = " ".join(cmd)
print("3. Executing Cloud Run deployment:", cmd_str)
res = subprocess.run(cmd_str, env=env, shell=True)
print("4. Deployment finished with returncode:", res.returncode)

if res.returncode == 0:
    url_cmd = f"{gcloud_bin} run services describe paylens --region asia-south1 --project paylens-fintech --format=\"value(status.url)\""
    url_res = subprocess.run(url_cmd, env=env, capture_output=True, text=True, shell=True)
    service_url = url_res.stdout.strip()
    print(f"\n=======================================================")
    print(f"SUCCESS: Paylens deployed to Cloud Run!")
    print(f"Service URL: {service_url}")
    print(f"Storefront:  {service_url}/mock-shop/")
    print(f"Health API:  {service_url}/api/health")
    print(f"=======================================================\n")
