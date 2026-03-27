import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const envConfig = `
export const environment = {
    production: false,
    apiUrl: '${process.env['API_URL'] || ''}',
    appwriteProjectName: '${process.env['APPWRITE_PROJECT_NAME'] || ''}',
    appwriteEndpoint: '${process.env['APPWRITE_ENDPOINT'] || ''}',
    appwriteProjectId: '${process.env['APPWRITE_PROJECT_ID'] || ''}'
};
`;

fs.writeFileSync('./src/environments/environment.ts', envConfig);
console.log('Environment file generated.');