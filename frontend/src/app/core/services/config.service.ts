import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

interface SupabaseConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
}

@Injectable({
    providedIn: 'root',
})
export class ConfigService {
    private supabaseConfig: SupabaseConfig | null = null;
    private readonly CACHE_KEY = 'supabase_config';

    constructor(private http: HttpClient) {}

    async loadSupabaseConfig(): Promise<SupabaseConfig> {
        // Return cached value in memory
        if (this.supabaseConfig) {
            return this.supabaseConfig;
        }

        // Check localStorage first
        const cached = this.getFromCache();
        if (cached) {
            this.supabaseConfig = cached;
            return cached;
        }

        // Fetch from backend
        try {
            this.supabaseConfig = await firstValueFrom(
                this.http.get<SupabaseConfig>(`${environment.apiUrl}/api/config/supabase/`)
            );
            // Cache in localStorage for future reloads
            this.saveToCache(this.supabaseConfig);
            return this.supabaseConfig;
        } catch (error) {
            console.error('Failed to load Supabase config:', error);
            throw error;
        }
    }

    getSupabaseConfig(): SupabaseConfig | null {
        return this.supabaseConfig;
    }

    private getFromCache(): SupabaseConfig | null {
        try {
            const cached = localStorage.getItem(this.CACHE_KEY);
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    }

    private saveToCache(config: SupabaseConfig): void {
        try {
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(config));
        } catch {
            // localStorage might be disabled, silently fail
        }
    }
}
