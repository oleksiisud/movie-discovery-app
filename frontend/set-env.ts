import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const envConfig = `
export const environment = {
    production: false,
    apiUrl: '${process.env['API_URL'] || ''}',
    supabaseUrl: '${process.env['SUPABASE_URL'] || ''}',
    supabaseAnonKey: '${process.env['SUPABASE_ANON_KEY'] || ''}',
};
`;

fs.writeFileSync('./src/environments/environment.development.ts', envConfig);
console.log('Environment file generated.');