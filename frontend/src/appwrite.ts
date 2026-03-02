import { Client, Account, Databases } from 'appwrite';
import { environment } from './environments/environment';

const client = new Client();

client
    .setEndpoint(environment.appwriteEndpoint)
    .setProject(environment.appwriteProjectId);

export const account = new Account(client);
export const databases = new Databases(client);
export { client };