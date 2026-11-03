import { Component, OnInit } from '@angular/core';
import { NotificationPrefs, PushService } from '../../core/push.service';
import { NotificationService } from '../../core/notification.service';

/** My Profile → Notifications (PWA Phase 2): this device on/off, categories, test. */
@Component({
  selector: 'app-notification-settings',
  templateUrl: './notification-settings.component.html',
  styleUrls: ['./notification-settings.component.css']
})
export class NotificationSettingsComponent implements OnInit {
  busy = false;
  savingPref: keyof NotificationPrefs | null = null;

  readonly categories: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
    { key: 'emailBatch', label: 'Email batch finished', hint: 'When ticket or custom emails you sent have all gone out.' },
    { key: 'announcements', label: 'Announcements', hint: 'Messages from the festival organisers.' },
    { key: 'meals', label: 'Meals', hint: 'Meal time changes and when the Mess Hall opens or closes.' }
  ];

  constructor(public push: PushService, private notifications: NotificationService) { }

  ngOnInit(): void {
    this.push.load();
  }

  async turnOn(): Promise<void> {
    this.busy = true;
    try {
      const state = await this.push.enable();
      if (state === 'on') this.notifications.openSucessSnackBar('Notifications are on for this device');
      else if (state === 'blocked') this.notifications.openErrorSnackBar('Notifications are blocked in your browser settings');
    } finally {
      this.busy = false;
    }
  }

  async turnOff(): Promise<void> {
    this.busy = true;
    try {
      await this.push.disable();
      this.notifications.openSucessSnackBar('Notifications are off for this device');
    } finally {
      this.busy = false;
    }
  }

  async toggle(key: keyof NotificationPrefs, value: boolean): Promise<void> {
    this.savingPref = key;
    try {
      await this.push.setPreference(key, value);
    } catch {
      this.notifications.openErrorSnackBar('Could not save — please try again');
      this.push.load();   // put the switch back to what the server has
    } finally {
      this.savingPref = null;
    }
  }

  async sendTest(): Promise<void> {
    this.busy = true;
    try {
      const r = await this.push.sendTest();
      if (r.delivered > 0) this.notifications.openSucessSnackBar('Test sent — it should appear in a moment');
      else this.notifications.openErrorSnackBar('Nothing was delivered — try turning notifications off and on again');
    } catch {
      this.notifications.openErrorSnackBar('Could not send the test notification');
    } finally {
      this.busy = false;
    }
  }
}
