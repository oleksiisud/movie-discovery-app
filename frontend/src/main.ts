import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { client } from './appwrite';

// Verify Appwrite backend connection
client.ping().then(() => {
  console.log('Appwrite backend is connected');
}).catch((err) => {
  console.error('Failed to connect to Appwrite backend:', err);
});

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
