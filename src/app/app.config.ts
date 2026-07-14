import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/error-logger';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route uncaught renderer errors to the Electron file log.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // Hash routing keeps the router working when Electron loads index.html over file://.
    provideRouter(routes, withHashLocation()),
  ],
};
