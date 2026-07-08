import requests
from urllib.parse import urljoin

DOMAIN = "http://localhost:8787/"

ENDPOINT = "admin-api/"
# Current_endpoints:
# init
# upgrade

headers = {
    "Authorization": "Bearer <key>"
}

response = requests.get(urljoin(DOMAIN, urljoin(ENDPOINT, "upgrade")), headers=headers)
print(response.json())