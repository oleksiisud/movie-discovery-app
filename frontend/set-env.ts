import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const envConfig = `
export const environment = {
    production: false,
    apiUrl: '${process.env['API_URL'] || ''}',
};
`;

fs.writeFileSync('./src/environments/environment.development.ts', envConfig);
console.log('Environment file generated.');