import requests
from urllib.parse import urljoin

DOMAIN = "http://localhost:8787/"

ENDPOINT = "admin-api/"
# currently only one admin endpoint, db init

headers = {
    "Authorization": "Bearer <key>"
}

response = requests.get(urljoin(DOMAIN, urljoin(ENDPOINT, "init")), headers=headers)
print(response.json())