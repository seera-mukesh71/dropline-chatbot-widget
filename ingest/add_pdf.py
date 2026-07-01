import os
import sys
import time
import requests
import pdfplumber
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-embedding-001:embedContent"
)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def extract_text(pdf_path):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text += (page.extract_text() or "") + "\n"
    return text


def chunk_text(text, chunk_size=1000, overlap=150):
    text = " ".join(text.split())
    chunks, start = [], 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return [c.strip() for c in chunks if c.strip()]


def embed(text):
    resp = requests.post(
        EMBED_URL,
        params={"key": GEMINI_API_KEY},
        json={
            "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_DOCUMENT",
            "outputDimensionality": 768,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]["values"]


def main():
    if len(sys.argv) < 2:
        print("Usage: python add_pdf.py <filename.pdf>")
        print("(the PDF must be inside ingest/pdfs/)")
        return

    filename = sys.argv[1]
    pdf_path = os.path.join(os.path.dirname(__file__), "pdfs", filename)
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return

    # Safety: if this file was added before, remove its old rows first
    # so you don't get duplicates when re-adding an updated version.
    supabase.table("documents").delete().eq("source", filename).execute()
    print(f"Cleared any previous chunks for {filename}.")

    text = extract_text(pdf_path)
    chunks = chunk_text(text)
    print(f"{filename}: {len(chunks)} chunks")

    for i, chunk in enumerate(chunks):
        vector = embed(chunk)
        supabase.table("documents").insert({
            "content": chunk,
            "source": filename,
            "embedding": vector,
        }).execute()
        print(f"  uploaded chunk {i + 1}/{len(chunks)}")
        time.sleep(0.4)

    print(f"\nDone! Added {filename} to the knowledge base.")


if __name__ == "__main__":
    main()