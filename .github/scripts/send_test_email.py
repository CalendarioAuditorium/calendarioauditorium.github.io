"""Invia un solo messaggio di prova tramite Microsoft Graph."""
import json
import os
import re
import sys
import urllib.error
import urllib.request


def main():
    token = os.environ.get("GRAPH_ACCESS_TOKEN", "").strip()
    recipient = os.environ.get("TEST_RECIPIENT", "").strip()
    if not token:
        sys.exit("Manca il secret OUTLOOK_GRAPH_ACCESS_TOKEN in GitHub.")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", recipient):
        sys.exit("Indirizzo destinatario non valido.")
    payload = {
        "message": {
            "subject": "Calendario auditorium - prova notifica",
            "body": {
                "contentType": "Text",
                "content": "Questo è un messaggio di prova del calendario auditorium. Non è associato a un evento reale.",
            },
            "toRecipients": [{"emailAddress": {"address": recipient}}],
        },
        "saveToSentItems": True,
    }
    request = urllib.request.Request(
        "https://graph.microsoft.com/v1.0/me/sendMail",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 202:
                sys.exit(f"Risposta Microsoft inattesa: HTTP {response.status}.")
    except urllib.error.HTTPError as error:
        sys.exit(f"Microsoft ha rifiutato la richiesta (HTTP {error.code}). Verifica account, permesso Mail.Send e validità del token.")
    except urllib.error.URLError:
        sys.exit("Impossibile raggiungere Microsoft Graph.")
    print("Microsoft ha accettato il messaggio di prova. Controlla la casella destinataria e la cartella spam.")


if __name__ == "__main__":
    main()
