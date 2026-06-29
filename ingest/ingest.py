import os
import time
import glob
import requests
import pdfplumber
from dotenv import load_dotenv
from supabase import create_client

# Load the same secrets your app uses (read from ../.env.local)
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
    """Read every page of a PDF and join it into one big string."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"
    return text


def chunk_text(text, chunk_size=1000, overlap=150):
    """Split long text into overlapping chunks so context isn't cut mid-idea."""
    text = " ".join(text.split())  # collapse whitespace
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap  # step back a bit so chunks overlap
    return [c.strip() for c in chunks if c.strip()]


def embed(text):
    """Turn a piece of text into a 768-number meaning vector via Gemini."""
    resp = requests.post(
        EMBED_URL,
        params={"key": GEMINI_API_KEY},
        json={
            "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_DOCUMENT",   # we're embedding stored documents
            "outputDimensionality": 768,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]["values"]


def main():
    # Wipe old rows so re-running doesn't create duplicates
    supabase.table("documents").delete().neq("id", 0).execute()
    print("Cleared existing documents.")

    pdf_files = glob.glob(os.path.join(os.path.dirname(__file__), "pdfs", "*.pdf"))
    if not pdf_files:
        print("No PDFs found in ingest/pdfs/. Add some and re-run.")
        return

    for pdf_path in pdf_files:
        name = os.path.basename(pdf_path)
        print(f"\nProcessing {name} ...")
        text = extract_text(pdf_path)
        chunks = chunk_text(text)
        print(f"  {len(chunks)} chunks")

        for i, chunk in enumerate(chunks):
            vector = embed(chunk)
            supabase.table("documents").insert({
                "content": chunk,
                "source": name,
                "embedding": vector,
            }).execute()
            print(f"  uploaded chunk {i + 1}/{len(chunks)}")
            time.sleep(0.4)  # gentle pause to respect free-tier rate limits

    print("\nDone! Knowledge base is ready.")


if __name__ == "__main__":
    main()