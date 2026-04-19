from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def get_supabase_config(request):
    """
    GET /api/config/supabase/

    :param request: Django HttpRequest object
    :return: JsonResponse with Supabase configuration
    """
    import os
    
    return JsonResponse({
        "supabaseUrl": os.getenv("SUPABASE_URL", ""),
        "supabaseAnonKey": os.getenv("SUPABASE_ANON_KEY", ""),
    })