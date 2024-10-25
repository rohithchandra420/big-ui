import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Observable } from 'rxjs';


export const authGuard: CanActivateFn = (route, state) => {
  //const authS = inject(AuthService).isAuthenticated();
  let userData = JSON.parse(localStorage.getItem('userData'));
  let token = userData ? userData._token : null;
  //authS.isA
  const router = inject(Router);
  console.log(token);
  if(token) {
      //router.navigate(['dashboard']);
      return true;
  } else {
    router.navigate(['login']);
    return false;
  }
};
