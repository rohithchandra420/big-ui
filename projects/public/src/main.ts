import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { AppComponent } from './app/app.component';

// Public participant app (rchomeproject.in/live) — PUBLIC_HOME_CONTEXT.md.
// Standalone components only, no Material / Bootstrap, to stay small.
bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    // Its own offline worker, scoped to /live/ (separate from the staff app's).
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
}).catch(err => console.error(err));
