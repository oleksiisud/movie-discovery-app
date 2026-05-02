import os
import time
import json
import requests
import numpy as np
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

# Emotion definitions
EMOTIONS: dict[str, list[str]] = {
    "happy": [
        "uplifting feel-good joyful movie",
        "lighthearted fun comedy entertaining story",
        "positive energetic humorous enjoyable film"
    ],
    "sad": [
        "comforting emotional healing heartfelt story",
        "warm touching drama about overcoming sadness",
        "tearjerker emotional journey with hopeful ending"
    ],
    "angry": [
        "intense action revenge fast-paced story",
        "explosive conflict high-energy aggressive movie",
        "emotional release through action or confrontation"
    ],
    "anxious": [
        "calm soothing gentle low-stakes story",
        "relaxing peaceful comforting easy-going movie",
        "reassuring slow-paced safe emotionally grounding film"
    ],
    "bored": [
        "exciting fast-paced action adventure story",
        "engaging thrilling unpredictable entertaining movie",
        "high stimulation dynamic plot-driven film"
    ],
    "excited": [
        "high-energy epic blockbuster spectacle",
        "thrilling adventurous large-scale action story",
        "visually exciting intense cinematic experience"
    ],
    "playful": [
        "quirky absurd humorous fun story",
        "witty comedy lighthearted playful tone",
        "silly entertaining animated or comedic film"
    ],
    "lost": [
        "self-discovery journey introspective story",
        "character searching for purpose meaningful narrative",
        "personal growth reflective emotional journey"
    ],
    "reflective": [
        "philosophical introspective deep thoughtful story",
        "slow meaningful character-driven narrative",
        "meditative emotional exploration of life themes"
    ],
    "brave": [
        "heroic courage overcoming fear inspiring story",
        "determined character facing challenges action drama",
        "empowering journey of strength and resilience"
    ],
    "scared": [
        "horror suspense dark tension fear-inducing story",
        "thriller with intense atmosphere and danger",
        "adrenaline suspenseful unsettling experience"
    ],
    "hopeful": [
        "uplifting redemption second chances story",
        "optimistic inspiring positive life journey",
        "warm encouraging emotional recovery narrative"
    ],
    "nostalgic": [
        "retro classic sentimental coming-of-age story",
        "memory-filled emotional past era setting",
        "childhood nostalgia warm reflective film"
    ],
    "curious": [
        "mystery mind-bending intellectual story",
        "sci-fi or puzzle-solving thought-provoking narrative",
        "clever complex ideas engaging exploration"
    ],
    "frustrated": [
        "tense dramatic conflict emotional struggle",
        "intense interpersonal conflict character-driven story",
        "pressure-filled situations escalating tension"
    ],
    "romantic": [
        "love story emotional passionate relationship",
        "heartfelt romantic connection character-driven narrative",
        "tender emotional intimacy and affection"
    ],
    "lonely": [
        "connection friendship companionship emotional story",
        "character finding belonging and human connection",
        "heartwarming relationships overcoming isolation"
    ],
    "depressed": [
        "uplifting gentle comforting feel-good story",
        "lighthearted positive easy emotional recovery film",
        "hopeful warm calming narrative"
    ],
    "jealous": [
        "relationship drama rivalry emotional tension",
        "conflict driven by insecurity and desire",
        "intense interpersonal emotional struggle"
    ],
    "overwhelmed": [
        "simple calming cozy easy-watch story",
        "low-energy relaxing comforting narrative",
        "gentle slow-paced stress-free film"
    ],
}


def get_embedding(text, retries = 5, wait = 20):
    """
    Call HF inference API and return a 384-dim embedding vector.
    
    :param text: Text to embed.
    :param retries: Number of retries.
    :param wait: Wait time between retries.
    :return: 384-dim embedding vector.
    """
    headers = {"Authorization": f"Bearer {os.getenv('HF_TOKEN')}"}
    payload = {"inputs": [text]}

    for attempt in range(retries):
        response = requests.post(HF_MODEL_URL, headers=headers, json=payload)

        if response.status_code == 200:
            data = response.json()
            embedding = data[0] if isinstance(data[0], list) else data
            if len(embedding) != 384:
                raise ValueError(f"Unexpected embedding dim: {len(embedding)}")
            return embedding

        if response.status_code in (503, 504):
            print(f"  Model unavailable (attempt {attempt + 1}/{retries}), waiting {wait}s...")
            time.sleep(wait)
        else:
            raise RuntimeError(f"HF API {response.status_code}: {response.text}")

    raise RuntimeError(f"HF API failed after {retries} retries.")


def main() -> None:
    supabase = create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_KEY"),
    )

    print(f"Injecting {len(EMOTIONS)} emotion embeddings into Supabase...\n")

    rows = []
    for name, sentences in EMOTIONS.items():
        print(f"  [{name}] — embedding {len(sentences)} sentences and averaging...")
        vectors = []
        for sentence in sentences:
            embedding = get_embedding(sentence)
            vectors.append(embedding)
            time.sleep(0.3)  # be polite to the API between sub-calls

        # Average the individual embeddings into a single composite vector
        averaged = np.mean(vectors, axis=0).tolist()
        rows.append({"name": name, "embedding": averaged})
        time.sleep(0.3)

    print("\nUpserting into `emotion_embeddings`...")
    result = (
        supabase.table("emotion_embeddings")
        .upsert(rows, on_conflict="name")
        .execute()
    )

    inserted = len(result.data) if result.data else 0
    print(f"\nDone. {inserted} rows upserted.")


if __name__ == "__main__":
    main()
