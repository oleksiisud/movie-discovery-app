import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

client = None

def get_client():
    global client
    if client is None:
        client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_KEY"),
        )
    return client